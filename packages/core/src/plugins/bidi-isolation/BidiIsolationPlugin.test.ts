import { describe, expect, it } from 'vitest';
import type { EditorState } from '../../state/EditorState.js';
import {
	expectCommandRegistered,
	expectKeyBinding,
	expectToolbarItem,
} from '../../test/PluginTestUtils.js';
import { pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { TextDirectionPlugin } from '../text-direction/TextDirectionPlugin.js';
import { BidiIsolationPlugin } from './BidiIsolationPlugin.js';

const HARNESS_OPTIONS = { useMiddleware: true, builtinSpecs: true } as const;

function makeState(
	blocks?: {
		type: string;
		text: string;
		id: string;
		attrs?: Record<string, string | number | boolean>;
	}[],
	cursorBlockId?: string,
	cursorOffset?: number,
): EditorState {
	const builder = stateBuilder();
	for (const b of blocks ?? [{ type: 'paragraph', text: '', id: 'b1' }]) {
		builder.block(b.type, b.text, b.id, { attrs: b.attrs });
	}
	const bid: string = cursorBlockId ?? blocks?.[0]?.id ?? 'b1';
	builder.cursor(bid, cursorOffset ?? 0);
	builder.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi']);
	return builder.build();
}

describe('BidiIsolationPlugin', () => {
	describe('bdi mark spec', () => {
		it('registers bdi mark spec', async () => {
			const h = await pluginHarness(new BidiIsolationPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getMarkSpec('bdi');
			expect(spec).toBeDefined();
			expect(spec?.rank).toBe(10);
		});

		it('bdi mark toDOM renders <bdi> element with dir attribute', async () => {
			const h = await pluginHarness(new BidiIsolationPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getMarkSpec('bdi');

			const el = spec?.toDOM({ type: 'bdi', attrs: { dir: 'rtl' } });
			expect(el?.tagName).toBe('BDI');
			expect(el?.getAttribute('dir')).toBe('rtl');
		});

		it('bdi mark toDOM defaults dir to auto', async () => {
			const h = await pluginHarness(new BidiIsolationPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getMarkSpec('bdi');

			const el = spec?.toDOM({ type: 'bdi' });
			expect(el?.tagName).toBe('BDI');
			expect(el?.getAttribute('dir')).toBe('auto');
		});

		it('bdi mark attrs default to auto', async () => {
			const h = await pluginHarness(new BidiIsolationPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getMarkSpec('bdi');
			expect(spec?.attrs?.dir?.default).toBe('auto');
		});
	});

	describe('bdi inline commands', () => {
		it('registers all inline bdi commands', async () => {
			const state: EditorState = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new BidiIsolationPlugin(), state, HARNESS_OPTIONS);

			expectCommandRegistered(h, 'toggleBidiLTR');
			expectCommandRegistered(h, 'toggleBidiRTL');
			expectCommandRegistered(h, 'toggleBidiAuto');
			expectCommandRegistered(h, 'removeBidi');
		});
	});

	describe('toggleBidiIsolation command', () => {
		it('registers toggleBidiIsolation command', async () => {
			const state: EditorState = makeState();
			const h = await pluginHarness(new BidiIsolationPlugin(), state, HARNESS_OPTIONS);
			expectCommandRegistered(h, 'toggleBidiIsolation');
		});

		it('registers Mod-Shift-B keymap', async () => {
			const state: EditorState = makeState();
			const h = await pluginHarness(new BidiIsolationPlugin(), state, HARNESS_OPTIONS);
			expectKeyBinding(h, 'Mod-Shift-B');
		});

		it('applies bdi-rtl mark in an auto/ltr block (no TextDirectionPlugin)', async () => {
			const state: EditorState = stateBuilder()
				.paragraph('Hello world', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new BidiIsolationPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('toggleBidiIsolation');

			const block = h.getState().doc.children[0];
			const firstChild = block?.children[0];
			if (firstChild && 'marks' in firstChild) {
				const bdiMark = firstChild.marks.find((m) => m.type === 'bdi');
				expect(bdiMark).toBeDefined();
				expect(bdiMark?.attrs?.dir).toBe('rtl');
			}
		});

		it('applies bdi-ltr mark in an RTL block (with TextDirectionPlugin)', async () => {
			const state: EditorState = stateBuilder()
				.block('paragraph', 'مرحبا Hello', 'b1', { attrs: { dir: 'rtl' } })
				.selection({ blockId: 'b1', offset: 6 }, { blockId: 'b1', offset: 11 })
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(
				[new TextDirectionPlugin(), new BidiIsolationPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('toggleBidiIsolation');

			const block = h.getState().doc.children[0];
			const children = block?.children;
			const hasBdiLtr = children?.some(
				(c) => 'marks' in c && c.marks.some((m) => m.type === 'bdi' && m.attrs?.dir === 'ltr'),
			);
			expect(hasBdiLtr).toBe(true);
		});

		it('removes bdi mark when toggled a second time', async () => {
			const state: EditorState = stateBuilder()
				.paragraph('Hello world', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new BidiIsolationPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('toggleBidiIsolation');
			h.executeCommand('toggleBidiIsolation');

			const block = h.getState().doc.children[0];
			const hasBdi = block?.children.some(
				(c) => 'marks' in c && c.marks.some((m) => m.type === 'bdi'),
			);
			expect(hasBdi).toBe(false);
		});
	});

	describe('inline-direction toolbar item', () => {
		it('registers an inline-direction toolbar item', async () => {
			const h = await pluginHarness(new BidiIsolationPlugin(), undefined, HARNESS_OPTIONS);
			expectToolbarItem(h, 'inline-direction', {
				group: 'format',
				popupType: 'dropdown',
			});
		});

		it('tooltip includes Mod-Shift-B shortcut hint', async () => {
			const h = await pluginHarness(new BidiIsolationPlugin(), undefined, HARNESS_OPTIONS);
			const item = h.getToolbarItem('inline-direction');
			expect(item?.tooltip).toContain('Shift');
			expect(item?.tooltip).toContain('B');
		});

		it('dropdown contains LTR, RTL, Auto, and Remove items', async () => {
			const h = await pluginHarness(new BidiIsolationPlugin(), undefined, HARNESS_OPTIONS);
			const item = h.getToolbarItem('inline-direction');
			const config = item?.popupConfig as {
				items: readonly { label: string; command: string }[];
			};

			expect(config.items).toHaveLength(4);
			expect(config.items[0]?.command).toBe('toggleBidiLTR');
			expect(config.items[1]?.command).toBe('toggleBidiRTL');
			expect(config.items[2]?.command).toBe('toggleBidiAuto');
			expect(config.items[3]?.command).toBe('removeBidi');
		});

		it('isActive returns true when bdi mark is active', async () => {
			const state: EditorState = stateBuilder()
				.paragraph('Hello world', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new BidiIsolationPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('toggleBidiLTR');

			const item = h.getToolbarItem('inline-direction');
			expect(item?.isActive?.(h.getState())).toBe(true);
		});

		it('isActive returns false when no bdi mark', async () => {
			const state: EditorState = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new BidiIsolationPlugin(), state, HARNESS_OPTIONS);

			const item = h.getToolbarItem('inline-direction');
			expect(item?.isActive?.(h.getState())).toBe(false);
		});

		it('isEnabled returns false for collapsed cursor', async () => {
			const state: EditorState = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new BidiIsolationPlugin(), state, HARNESS_OPTIONS);

			const item = h.getToolbarItem('inline-direction');
			expect(item?.isEnabled?.(h.getState())).toBe(false);
		});

		it('isEnabled returns true for range selection', async () => {
			const state: EditorState = stateBuilder()
				.paragraph('Hello world', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new BidiIsolationPlugin(), state, HARNESS_OPTIONS);

			const item = h.getToolbarItem('inline-direction');
			expect(item?.isEnabled?.(h.getState())).toBe(true);
		});
	});

	describe('removeBidi announcement', () => {
		it('removeBidi returns true after removing bdi mark', async () => {
			const state: EditorState = stateBuilder()
				.paragraph('Hello world', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new BidiIsolationPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('toggleBidiLTR');
			const result: boolean = h.executeCommand('removeBidi');
			expect(result).toBe(true);
		});
	});

	describe('copy/paste roundtrip — bdi mark', () => {
		it('parses <bdi dir="rtl"> as bdi mark', async () => {
			const h = await pluginHarness(new BidiIsolationPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getMarkSpec('bdi');
			expect(spec?.parseHTML?.[0]?.tag).toBe('bdi');

			const el: HTMLElement = document.createElement('bdi');
			el.setAttribute('dir', 'rtl');
			const attrs = spec?.parseHTML?.[0]?.getAttrs?.(el);
			expect(attrs).toEqual({ dir: 'rtl' });
		});

		it('bdi toHTMLString → parseHTML roundtrip preserves dir="rtl"', async () => {
			const h = await pluginHarness(new BidiIsolationPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getMarkSpec('bdi');

			const html: string | undefined = spec?.toHTMLString?.(
				{ type: 'bdi', attrs: { dir: 'rtl' } },
				'מילה',
			);
			expect(html).toBe('<bdi dir="rtl">מילה</bdi>');
		});

		it('bdi parseHTML rejects invalid dir values', async () => {
			const h = await pluginHarness(new BidiIsolationPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getMarkSpec('bdi');

			const el: HTMLElement = document.createElement('bdi');
			el.setAttribute('dir', 'foo');
			const attrs = spec?.parseHTML?.[0]?.getAttrs?.(el);
			expect(attrs).toEqual({ dir: 'auto' });
		});

		it('bdi toHTMLString escapes dir attribute to prevent XSS', async () => {
			const h = await pluginHarness(new BidiIsolationPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getMarkSpec('bdi');

			const html: string | undefined = spec?.toHTMLString?.(
				{ type: 'bdi', attrs: { dir: '"><script>alert(1)</script>' } },
				'text',
			);
			expect(html).toBeDefined();
			expect(html).not.toContain('<script>');
			expect(html).toContain('&quot;');
		});
	});
});
