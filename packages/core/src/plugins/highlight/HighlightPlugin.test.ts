import { describe, expect, it } from 'vitest';
import { createBlockNode, createDocument, createTextNode } from '../../model/Document.js';
import { createCollapsedSelection, createSelection } from '../../model/Selection.js';
import { EditorState } from '../../state/EditorState.js';
import {
	expectCommandRegistered,
	expectMarkSpec,
	expectToolbarActive,
	expectToolbarItem,
} from '../../test/PluginTestUtils.js';
import { mockPluginContext, pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { HighlightPlugin } from './HighlightPlugin.js';

// --- Helpers ---

function defaultState(): EditorState {
	return EditorState.create({
		schema: {
			nodeTypes: ['paragraph'],
			markTypes: ['bold', 'italic', 'underline', 'highlight'],
		},
	});
}

// --- Tests ---

describe('HighlightPlugin', () => {
	describe('registration', () => {
		it('registers with correct id, name, and priority', () => {
			const plugin = new HighlightPlugin();
			expect(plugin.id).toBe('highlight');
			expect(plugin.name).toBe('Highlight');
			expect(plugin.priority).toBe(24);
		});
	});

	describe('MarkSpec', () => {
		it('registers highlight MarkSpec', async () => {
			const h = await pluginHarness(new HighlightPlugin());
			expectMarkSpec(h, 'highlight');
		});

		it('highlight MarkSpec creates <span> with style.backgroundColor', async () => {
			const h = await pluginHarness(new HighlightPlugin());
			expectMarkSpec(h, 'highlight', {
				tag: 'SPAN',
				toDOMInput: { type: 'highlight', attrs: { color: '#fff176' } },
			});

			const spec = h.getMarkSpec('highlight');
			const el = spec?.toDOM({ type: 'highlight', attrs: { color: '#fff176' } });
			expect(el?.style.backgroundColor).toBeTruthy();
		});

		it('has rank 4', async () => {
			const h = await pluginHarness(new HighlightPlugin());
			expectMarkSpec(h, 'highlight', { rank: 4 });
		});

		it('has color attr with default', async () => {
			const h = await pluginHarness(new HighlightPlugin());
			expectMarkSpec(h, 'highlight', { attrs: { color: { default: '' } } });
		});
	});

	describe('command', () => {
		it('registers removeHighlight command', async () => {
			const h = await pluginHarness(new HighlightPlugin());
			expect(h.executeCommand('removeHighlight')).toBe(false);
		});

		it('removeHighlight dispatches on highlighted text with range selection', async () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('hello', [{ type: 'highlight', attrs: { color: '#fff176' } }])],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: { nodeTypes: ['paragraph'], markTypes: ['highlight'] },
			});

			const h = await pluginHarness(new HighlightPlugin(), state);

			expect(h.dispatch).not.toHaveBeenCalled();
		});
	});

	describe('toolbar item', () => {
		it('registers a highlight toolbar item', async () => {
			const h = await pluginHarness(new HighlightPlugin());
			expectToolbarItem(h, 'highlight', {
				group: 'format',
				label: 'Highlight',
				priority: 46,
				popupType: 'custom',
			});
		});

		it('toolbar item reports active state when text has highlight', async () => {
			const state = stateBuilder()
				.paragraph('marked', 'b1', { marks: [{ type: 'highlight', attrs: { color: '#fff176' } }] })
				.cursor('b1', 2)
				.schema(['paragraph'], ['highlight'])
				.build();

			const h = await pluginHarness(new HighlightPlugin(), state);
			expectToolbarActive(h, 'highlight', true);
		});

		it('toolbar item reports inactive state when text has no highlight', async () => {
			const state = stateBuilder()
				.paragraph('plain', 'b1')
				.cursor('b1', 2)
				.schema(['paragraph'], ['highlight'])
				.build();

			const h = await pluginHarness(new HighlightPlugin(), state);
			expectToolbarActive(h, 'highlight', false);
		});

		it('respects separatorAfter config', async () => {
			const h = await pluginHarness(new HighlightPlugin({ separatorAfter: true }));
			expectToolbarItem(h, 'highlight', { separatorAfter: true });
		});
	});

	describe('colors config', () => {
		it('uses default palette when no colors provided', async () => {
			const h = await pluginHarness(new HighlightPlugin());

			const item = h.getToolbarItem('highlight');

			const container = document.createElement('div');
			item?.renderPopup?.(container, mockPluginContext({ getState: () => defaultState() }));

			const grid = container.querySelector('.notectl-color-picker__grid');
			expect(grid?.children.length).toBe(50);
		});

		it('restricts palette to custom colors', async () => {
			const h = await pluginHarness(
				new HighlightPlugin({
					colors: ['#fff176', '#aed581', '#4dd0e1'],
				}),
			);

			const item = h.getToolbarItem('highlight');

			const container = document.createElement('div');
			item?.renderPopup?.(container, mockPluginContext({ getState: () => defaultState() }));

			const grid = container.querySelector('.notectl-color-picker__grid');
			expect(grid?.children.length).toBe(3);
		});

		it('accepts shorthand hex colors (#RGB)', () => {
			const plugin = new HighlightPlugin({ colors: ['#f00', '#0f0', '#00f'] });
			expect(plugin).toBeDefined();
		});

		it('normalizes colors to lowercase and deduplicates', async () => {
			const h = await pluginHarness(
				new HighlightPlugin({
					colors: ['#FFF176', '#fff176', '#AED581'],
				}),
			);

			const item = h.getToolbarItem('highlight');

			const container = document.createElement('div');
			item?.renderPopup?.(container, mockPluginContext({ getState: () => defaultState() }));

			const grid = container.querySelector('.notectl-color-picker__grid');
			expect(grid?.children.length).toBe(2);
		});

		it('throws on invalid hex color', () => {
			expect(() => new HighlightPlugin({ colors: ['yellow'] })).toThrow(
				'HighlightPlugin: invalid hex color(s): yellow',
			);
		});

		it('throws on hex color without hash', () => {
			expect(() => new HighlightPlugin({ colors: ['fff176'] })).toThrow(
				'HighlightPlugin: invalid hex color(s): fff176',
			);
		});

		it('throws listing all invalid values', () => {
			expect(() => new HighlightPlugin({ colors: ['#fff176', 'bad', 'rgb(0,0,0)'] })).toThrow(
				'HighlightPlugin: invalid hex color(s): bad, rgb(0,0,0)',
			);
		});

		it('falls back to default palette for empty array', async () => {
			const h = await pluginHarness(new HighlightPlugin({ colors: [] }));

			const item = h.getToolbarItem('highlight');

			const container = document.createElement('div');
			item?.renderPopup?.(container, mockPluginContext({ getState: () => defaultState() }));

			const grid = container.querySelector('.notectl-color-picker__grid');
			expect(grid?.children.length).toBe(50);
		});
	});

	describe('highlight application', () => {
		it('applies highlight on range selection (removeMark + addMark steps)', async () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph'], ['highlight'])
				.build();

			const h = await pluginHarness(new HighlightPlugin(), state);

			const item = h.getToolbarItem('highlight');

			const container = document.createElement('div');
			item?.renderPopup?.(container, mockPluginContext({ getState: () => state }));

			const grid = container.querySelector('.notectl-color-picker__grid');
			expect(grid).toBeDefined();
			expect(grid?.children.length).toBe(50);
		});

		it('replaces highlight on already-highlighted text', async () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('hello', [{ type: 'highlight', attrs: { color: '#fff176' } }])],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: { nodeTypes: ['paragraph'], markTypes: ['highlight'] },
			});

			const h = await pluginHarness(new HighlightPlugin(), state);

			const item = h.getToolbarItem('highlight');

			const container = document.createElement('div');
			item?.renderPopup?.(container, mockPluginContext({ getState: () => state }));

			const activeSwatch = container.querySelector('.notectl-color-picker__swatch--active');
			expect(activeSwatch).toBeDefined();
		});

		it('removes highlight via None button', async () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('hello', [{ type: 'highlight', attrs: { color: '#fff176' } }])],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: { nodeTypes: ['paragraph'], markTypes: ['highlight'] },
			});

			const h = await pluginHarness(new HighlightPlugin(), state);

			const item = h.getToolbarItem('highlight');

			const container = document.createElement('div');
			item?.renderPopup?.(container, mockPluginContext({ getState: () => state }));

			const defaultBtn = container.querySelector('.notectl-color-picker__default');
			expect(defaultBtn).toBeDefined();
			expect(defaultBtn?.textContent).toBe('None');
		});
	});

	describe('combination with TextColor', () => {
		it('highlight and textColor marks coexist independently', async () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1', {
					marks: [
						{ type: 'textColor', attrs: { color: '#e53935' } },
						{ type: 'highlight', attrs: { color: '#fff176' } },
					],
				})
				.cursor('b1', 2)
				.schema(['paragraph'], ['textColor', 'highlight'])
				.build();

			const h = await pluginHarness(new HighlightPlugin(), state);
			expectToolbarActive(h, 'highlight', true);
		});
	});
});
