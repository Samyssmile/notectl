import { describe, expect, it, vi } from 'vitest';
import type { Mark } from '../../model/Document.js';
import { getTextChildren, hasMark } from '../../model/Document.js';
import {
	expectKeyBinding,
	expectToolbarActive,
	expectToolbarEnabled,
	expectToolbarItem,
} from '../../test/PluginTestUtils.js';
import { mockPluginContext, pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { LinkPlugin } from './LinkPlugin.js';

// --- Helpers ---

function makeState(
	blocks: {
		text: string;
		id: string;
		marks?: { type: string; attrs?: Record<string, string | number | boolean> }[];
	}[],
	selection?: {
		anchorBlock: string;
		anchorOffset: number;
		headBlock?: string;
		headOffset?: number;
	},
) {
	const builder = stateBuilder();
	for (const b of blocks) {
		builder.block('paragraph', b.text, b.id, { marks: b.marks as readonly Mark[] });
	}
	if (selection?.headBlock) {
		builder.selection(
			{ blockId: selection.anchorBlock, offset: selection.anchorOffset },
			{ blockId: selection.headBlock, offset: selection.headOffset ?? 0 },
		);
	} else if (selection) {
		builder.cursor(selection.anchorBlock, selection.anchorOffset);
	} else {
		builder.cursor(blocks[0]?.id ?? '', 0);
	}
	builder.schema(['paragraph'], ['bold', 'italic', 'underline', 'link']);
	return builder.build();
}

// --- Tests ---

describe('LinkPlugin', () => {
	describe('registration', () => {
		it('registers with correct id and name', () => {
			const plugin = new LinkPlugin();
			expect(plugin.id).toBe('link');
			expect(plugin.name).toBe('Link');
			expect(plugin.priority).toBe(25);
		});
	});

	describe('MarkSpec', () => {
		it('registers link MarkSpec', async () => {
			const h = await pluginHarness(new LinkPlugin());
			expect(h.getMarkSpec('link')).toBeDefined();
		});

		it('link MarkSpec creates <a> element', async () => {
			const h = await pluginHarness(new LinkPlugin());
			const spec = h.getMarkSpec('link');
			const el = spec?.toDOM({
				type: 'link',
				attrs: { href: 'https://example.com' },
			});

			expect(el?.tagName).toBe('A');
			expect(el?.getAttribute('href')).toBe('https://example.com');
		});

		it('adds target="_blank" and rel by default', async () => {
			const h = await pluginHarness(new LinkPlugin());
			const spec = h.getMarkSpec('link');
			const el = spec?.toDOM({
				type: 'link',
				attrs: { href: 'https://example.com' },
			});

			expect(el?.getAttribute('target')).toBe('_blank');
			expect(el?.getAttribute('rel')).toBe('noopener noreferrer');
		});

		it('omits target and rel when openInNewTab is false', async () => {
			const h = await pluginHarness(new LinkPlugin({ openInNewTab: false }));
			const spec = h.getMarkSpec('link');
			const el = spec?.toDOM({
				type: 'link',
				attrs: { href: 'https://example.com' },
			});

			expect(el?.getAttribute('target')).toBeNull();
			expect(el?.getAttribute('rel')).toBeNull();
		});

		it('has rank 10 (lower priority than text formatting marks)', async () => {
			const h = await pluginHarness(new LinkPlugin());
			expect(h.getMarkSpec('link')?.rank).toBe(10);
		});
	});

	describe('commands', () => {
		it('registers toggleLink command', async () => {
			const h = await pluginHarness(new LinkPlugin());
			// toggleLink returns false for collapsed selection
			expect(h.executeCommand('toggleLink')).toBe(false);
		});

		it('registers removeLink command', async () => {
			const h = await pluginHarness(new LinkPlugin());
			// removeLink returns false when no link is active
			expect(h.executeCommand('removeLink')).toBe(false);
		});

		it('removeLink removes link mark from selected range', async () => {
			const state = makeState(
				[
					{
						text: 'click here',
						id: 'b1',
						marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
					},
				],
				{
					anchorBlock: 'b1',
					anchorOffset: 0,
					headBlock: 'b1',
					headOffset: 10,
				},
			);

			const h = await pluginHarness(new LinkPlugin(), state);
			h.executeCommand('removeLink');

			const children = getTextChildren(h.getState().doc.children[0]);
			expect(hasMark(children[0]?.marks, 'link')).toBe(false);
		});

		it('removeLink on collapsed cursor removes link from entire span', async () => {
			const state = makeState(
				[
					{
						text: 'click here',
						id: 'b1',
						marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
					},
				],
				{ anchorBlock: 'b1', anchorOffset: 5 },
			);

			const h = await pluginHarness(new LinkPlugin(), state);
			h.executeCommand('removeLink');

			const children = getTextChildren(h.getState().doc.children[0]);
			expect(hasMark(children[0]?.marks, 'link')).toBe(false);
		});
	});

	describe('keymap', () => {
		it('registers Mod-K keymap', async () => {
			const h = await pluginHarness(new LinkPlugin());
			expectKeyBinding(h, 'Mod-K');
		});
	});

	describe('toolbar item', () => {
		it('registers link toolbar item', async () => {
			const h = await pluginHarness(new LinkPlugin());
			expectToolbarItem(h, 'link', {
				group: 'insert',
				command: 'toggleLink',
				popupType: 'custom',
			});
		});

		it('isActive returns true when cursor is in linked text', async () => {
			const state = makeState(
				[
					{
						text: 'click',
						id: 'b1',
						marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
					},
				],
				{ anchorBlock: 'b1', anchorOffset: 2 },
			);

			const h = await pluginHarness(new LinkPlugin(), state);
			expectToolbarActive(h, 'link', true);
		});

		it('isActive returns false when cursor is not in linked text', async () => {
			const state = makeState([{ text: 'plain', id: 'b1' }], {
				anchorBlock: 'b1',
				anchorOffset: 0,
			});

			const h = await pluginHarness(new LinkPlugin(), state);
			expectToolbarActive(h, 'link', false);
		});

		it('isEnabled returns false for collapsed selection', async () => {
			const state = makeState([{ text: 'text', id: 'b1' }], { anchorBlock: 'b1', anchorOffset: 0 });

			const h = await pluginHarness(new LinkPlugin(), state);
			expectToolbarEnabled(h, 'link', false);
		});

		it('isEnabled returns true for range selection', async () => {
			const state = makeState([{ text: 'select me', id: 'b1' }], {
				anchorBlock: 'b1',
				anchorOffset: 0,
				headBlock: 'b1',
				headOffset: 5,
			});

			const h = await pluginHarness(new LinkPlugin(), state);
			expectToolbarEnabled(h, 'link', true);
		});

		it('renderPopup creates URL input for non-link text', async () => {
			const state = makeState([{ text: 'text', id: 'b1' }], {
				anchorBlock: 'b1',
				anchorOffset: 0,
				headBlock: 'b1',
				headOffset: 4,
			});

			const h = await pluginHarness(new LinkPlugin(), state);
			const item = h.getToolbarItem('link');

			const container = document.createElement('div');
			item?.renderPopup?.(
				container,
				mockPluginContext({ getState: () => state, dispatch: vi.fn() }),
				vi.fn(),
			);

			const input = container.querySelector('input');
			expect(input).not.toBeNull();
			expect(input?.type).toBe('url');
			expect(input?.getAttribute('aria-label')).toBe('Link URL');
		});

		it('renderPopup shows remove button for linked text', async () => {
			const state = makeState(
				[
					{
						text: 'linked',
						id: 'b1',
						marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
					},
				],
				{ anchorBlock: 'b1', anchorOffset: 2 },
			);

			const h = await pluginHarness(new LinkPlugin(), state);
			const item = h.getToolbarItem('link');

			const container = document.createElement('div');
			item?.renderPopup?.(
				container,
				mockPluginContext({ getState: () => state, dispatch: vi.fn() }),
				vi.fn(),
			);

			const button = container.querySelector('button');
			expect(button).not.toBeNull();
			expect(button?.textContent).toBe('Remove Link');
		});

		it('onClose called after Apply button mousedown', async () => {
			const state = makeState([{ text: 'text', id: 'b1' }], {
				anchorBlock: 'b1',
				anchorOffset: 0,
				headBlock: 'b1',
				headOffset: 4,
			});

			const h = await pluginHarness(new LinkPlugin(), state);
			const item = h.getToolbarItem('link');
			const onClose = vi.fn();
			const container = document.createElement('div');
			const mockContainer = document.createElement('div');

			item?.renderPopup?.(
				container,
				mockPluginContext({
					getState: () => state,
					dispatch: vi.fn(),
					getContainer: () => mockContainer,
				}),
				onClose,
			);

			const input = container.querySelector('input') as HTMLInputElement;
			input.value = 'https://example.com';

			const applyBtn = container.querySelector(
				'button[aria-label="Apply link"]',
			) as HTMLButtonElement;
			applyBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

			expect(onClose).toHaveBeenCalledOnce();
		});

		it('onClose called after Enter in URL input', async () => {
			const state = makeState([{ text: 'text', id: 'b1' }], {
				anchorBlock: 'b1',
				anchorOffset: 0,
				headBlock: 'b1',
				headOffset: 4,
			});

			const h = await pluginHarness(new LinkPlugin(), state);
			const item = h.getToolbarItem('link');
			const onClose = vi.fn();
			const container = document.createElement('div');
			const mockContainer = document.createElement('div');

			item?.renderPopup?.(
				container,
				mockPluginContext({
					getState: () => state,
					dispatch: vi.fn(),
					getContainer: () => mockContainer,
				}),
				onClose,
			);

			const input = container.querySelector('input') as HTMLInputElement;
			input.value = 'https://example.com';
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

			expect(onClose).toHaveBeenCalledOnce();
		});

		it('onClose called after Remove Link button', async () => {
			const state = makeState(
				[
					{
						text: 'linked',
						id: 'b1',
						marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
					},
				],
				{
					anchorBlock: 'b1',
					anchorOffset: 0,
					headBlock: 'b1',
					headOffset: 6,
				},
			);

			const h = await pluginHarness(new LinkPlugin(), state);
			const item = h.getToolbarItem('link');
			const onClose = vi.fn();
			const container = document.createElement('div');
			const mockContainer = document.createElement('div');

			item?.renderPopup?.(
				container,
				mockPluginContext({
					getState: () => state,
					dispatch: vi.fn(),
					getContainer: () => mockContainer,
				}),
				onClose,
			);

			const removeBtn = container.querySelector(
				'button[aria-label="Remove link"]',
			) as HTMLButtonElement;
			removeBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

			expect(onClose).toHaveBeenCalledOnce();
		});
	});
});
