import { describe, expect, it, vi } from 'vitest';
import {
	createBlockNode,
	createDocument,
	createTextNode,
	getTextChildren,
	hasMark,
} from '../../model/Document.js';
import { createCollapsedSelection, createSelection } from '../../model/Selection.js';
import { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { Plugin } from '../Plugin.js';
import { PluginManager } from '../PluginManager.js';
import { LinkPlugin } from './LinkPlugin.js';

// --- Helpers ---

const SCHEMA = { nodeTypes: ['paragraph'], markTypes: ['bold', 'italic', 'underline', 'link'] };

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
): EditorState {
	const blockNodes = blocks.map((b) =>
		createBlockNode('paragraph', [createTextNode(b.text, b.marks)], b.id),
	);
	const doc = createDocument(blockNodes);
	const sel = selection
		? selection.headBlock
			? createSelection(
					{ blockId: selection.anchorBlock, offset: selection.anchorOffset },
					{ blockId: selection.headBlock, offset: selection.headOffset ?? 0 },
				)
			: createCollapsedSelection(selection.anchorBlock, selection.anchorOffset)
		: createCollapsedSelection(blocks[0]?.id ?? '', 0);

	return EditorState.create({ doc, selection: sel, schema: SCHEMA });
}

async function initPlugin(
	plugin: Plugin,
	state?: EditorState,
): Promise<{ pm: PluginManager; dispatch: ReturnType<typeof vi.fn>; getState: () => EditorState }> {
	const pm = new PluginManager();
	pm.register(plugin);
	let currentState = state ?? makeState([{ text: 'hello', id: 'b1' }]);
	const dispatch = vi.fn((tr: Transaction) => {
		currentState = currentState.apply(tr);
	});

	await pm.init({
		getState: () => currentState,
		dispatch,
		getContainer: () => document.createElement('div'),
		getPluginContainer: () => document.createElement('div'),
	});

	return { pm, dispatch, getState: () => currentState };
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
			const { pm } = await initPlugin(new LinkPlugin());
			expect(pm.schemaRegistry.getMarkSpec('link')).toBeDefined();
		});

		it('link MarkSpec creates <a> element', async () => {
			const { pm } = await initPlugin(new LinkPlugin());
			const spec = pm.schemaRegistry.getMarkSpec('link');
			const el = spec?.toDOM({ type: 'link', attrs: { href: 'https://example.com' } });

			expect(el?.tagName).toBe('A');
			expect(el?.getAttribute('href')).toBe('https://example.com');
		});

		it('adds target="_blank" and rel by default', async () => {
			const { pm } = await initPlugin(new LinkPlugin());
			const spec = pm.schemaRegistry.getMarkSpec('link');
			const el = spec?.toDOM({ type: 'link', attrs: { href: 'https://example.com' } });

			expect(el?.getAttribute('target')).toBe('_blank');
			expect(el?.getAttribute('rel')).toBe('noopener noreferrer');
		});

		it('omits target and rel when openInNewTab is false', async () => {
			const { pm } = await initPlugin(new LinkPlugin({ openInNewTab: false }));
			const spec = pm.schemaRegistry.getMarkSpec('link');
			const el = spec?.toDOM({ type: 'link', attrs: { href: 'https://example.com' } });

			expect(el?.getAttribute('target')).toBeNull();
			expect(el?.getAttribute('rel')).toBeNull();
		});

		it('has rank 10 (lower priority than text formatting marks)', async () => {
			const { pm } = await initPlugin(new LinkPlugin());
			expect(pm.schemaRegistry.getMarkSpec('link')?.rank).toBe(10);
		});
	});

	describe('commands', () => {
		it('registers toggleLink command', async () => {
			const { pm } = await initPlugin(new LinkPlugin());
			// toggleLink returns false for collapsed selection
			expect(pm.executeCommand('toggleLink')).toBe(false);
		});

		it('registers removeLink command', async () => {
			const { pm } = await initPlugin(new LinkPlugin());
			// removeLink returns false when no link is active
			expect(pm.executeCommand('removeLink')).toBe(false);
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
				{ anchorBlock: 'b1', anchorOffset: 0, headBlock: 'b1', headOffset: 10 },
			);

			const { pm, getState } = await initPlugin(new LinkPlugin(), state);
			pm.executeCommand('removeLink');

			const children = getTextChildren(getState().doc.children[0]);
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

			const { pm, getState } = await initPlugin(new LinkPlugin(), state);
			pm.executeCommand('removeLink');

			const children = getTextChildren(getState().doc.children[0]);
			expect(hasMark(children[0]?.marks, 'link')).toBe(false);
		});
	});

	describe('keymap', () => {
		it('registers Mod-K keymap', async () => {
			const { pm } = await initPlugin(new LinkPlugin());
			const keymaps = pm.schemaRegistry.getKeymaps();
			expect(keymaps.length).toBeGreaterThan(0);
			expect(keymaps[0]?.['Mod-K']).toBeDefined();
		});
	});

	describe('toolbar item', () => {
		it('registers link toolbar item', async () => {
			const { pm } = await initPlugin(new LinkPlugin());
			const item = pm.schemaRegistry.getToolbarItem('link');

			expect(item).toBeDefined();
			expect(item?.group).toBe('insert');
			expect(item?.command).toBe('toggleLink');
			expect(item?.popupType).toBe('custom');
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

			const { pm } = await initPlugin(new LinkPlugin(), state);
			const item = pm.schemaRegistry.getToolbarItem('link');
			expect(item?.isActive?.(state)).toBe(true);
		});

		it('isActive returns false when cursor is not in linked text', async () => {
			const state = makeState([{ text: 'plain', id: 'b1' }], {
				anchorBlock: 'b1',
				anchorOffset: 0,
			});

			const { pm } = await initPlugin(new LinkPlugin(), state);
			const item = pm.schemaRegistry.getToolbarItem('link');
			expect(item?.isActive?.(state)).toBe(false);
		});

		it('isEnabled returns false for collapsed selection', async () => {
			const state = makeState([{ text: 'text', id: 'b1' }], { anchorBlock: 'b1', anchorOffset: 0 });

			const { pm } = await initPlugin(new LinkPlugin(), state);
			const item = pm.schemaRegistry.getToolbarItem('link');
			expect(item?.isEnabled?.(state)).toBe(false);
		});

		it('isEnabled returns true for range selection', async () => {
			const state = makeState([{ text: 'select me', id: 'b1' }], {
				anchorBlock: 'b1',
				anchorOffset: 0,
				headBlock: 'b1',
				headOffset: 5,
			});

			const { pm } = await initPlugin(new LinkPlugin(), state);
			const item = pm.schemaRegistry.getToolbarItem('link');
			expect(item?.isEnabled?.(state)).toBe(true);
		});

		it('renderPopup creates URL input for non-link text', async () => {
			const state = makeState([{ text: 'text', id: 'b1' }], {
				anchorBlock: 'b1',
				anchorOffset: 0,
				headBlock: 'b1',
				headOffset: 4,
			});

			const { pm } = await initPlugin(new LinkPlugin(), state);
			const item = pm.schemaRegistry.getToolbarItem('link');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => state,
				dispatch: vi.fn(),
				getContainer: () => document.createElement('div'),
				getPluginContainer: () => document.createElement('div'),
				registerCommand: vi.fn(),
				executeCommand: vi.fn(),
				getEventBus: vi.fn() as never,
				registerMiddleware: vi.fn(),
				registerService: vi.fn(),
				getService: vi.fn(),
				updateConfig: vi.fn(),
				registerNodeSpec: vi.fn(),
				registerMarkSpec: vi.fn(),
				registerNodeView: vi.fn(),
				registerKeymap: vi.fn(),
				registerInputRule: vi.fn(),
				registerToolbarItem: vi.fn(),
				getSchemaRegistry: vi.fn() as never,
			});

			const input = container.querySelector('input');
			expect(input).not.toBeNull();
			expect(input?.type).toBe('url');
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

			const { pm } = await initPlugin(new LinkPlugin(), state);
			const item = pm.schemaRegistry.getToolbarItem('link');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => state,
				dispatch: vi.fn(),
				getContainer: () => document.createElement('div'),
				getPluginContainer: () => document.createElement('div'),
				registerCommand: vi.fn(),
				executeCommand: vi.fn(),
				getEventBus: vi.fn() as never,
				registerMiddleware: vi.fn(),
				registerService: vi.fn(),
				getService: vi.fn(),
				updateConfig: vi.fn(),
				registerNodeSpec: vi.fn(),
				registerMarkSpec: vi.fn(),
				registerNodeView: vi.fn(),
				registerKeymap: vi.fn(),
				registerInputRule: vi.fn(),
				registerToolbarItem: vi.fn(),
				getSchemaRegistry: vi.fn() as never,
			});

			const button = container.querySelector('button');
			expect(button).not.toBeNull();
			expect(button?.textContent).toBe('Remove Link');
		});
	});
});
