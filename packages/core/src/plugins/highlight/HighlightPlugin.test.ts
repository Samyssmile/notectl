import { describe, expect, it, vi } from 'vitest';
import { createBlockNode, createDocument, createTextNode } from '../../model/Document.js';
import { createCollapsedSelection, createSelection } from '../../model/Selection.js';
import { EditorState } from '../../state/EditorState.js';
import type { Plugin } from '../Plugin.js';
import { PluginManager, type PluginManagerInitOptions } from '../PluginManager.js';
import { HighlightPlugin } from './HighlightPlugin.js';

// --- Helpers ---

function makeOptions(overrides?: Partial<PluginManagerInitOptions>): PluginManagerInitOptions {
	return {
		getState: () => EditorState.create(),
		dispatch: vi.fn(),
		getContainer: () => document.createElement('div'),
		getPluginContainer: () => document.createElement('div'),
		...overrides,
	};
}

function defaultState(): EditorState {
	return EditorState.create({
		schema: {
			nodeTypes: ['paragraph'],
			markTypes: ['bold', 'italic', 'underline', 'highlight'],
		},
	});
}

async function initWithPlugin(
	plugin: Plugin,
	stateOverride?: EditorState,
): Promise<{ pm: PluginManager; dispatch: ReturnType<typeof vi.fn> }> {
	const pm = new PluginManager();
	pm.register(plugin);
	const dispatch = vi.fn();
	const state = stateOverride ?? defaultState();

	await pm.init(
		makeOptions({
			getState: () => state,
			dispatch,
		}),
	);

	return { pm, dispatch };
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
			const plugin = new HighlightPlugin();
			const { pm } = await initWithPlugin(plugin);
			expect(pm.schemaRegistry.getMarkSpec('highlight')).toBeDefined();
		});

		it('highlight MarkSpec creates <span> with style.backgroundColor', async () => {
			const plugin = new HighlightPlugin();
			const { pm } = await initWithPlugin(plugin);

			const spec = pm.schemaRegistry.getMarkSpec('highlight');
			const el = spec?.toDOM({ type: 'highlight', attrs: { color: '#fff176' } });
			expect(el?.tagName).toBe('SPAN');
			expect(el?.style.backgroundColor).toBeTruthy();
		});

		it('has rank 4', async () => {
			const plugin = new HighlightPlugin();
			const { pm } = await initWithPlugin(plugin);
			expect(pm.schemaRegistry.getMarkSpec('highlight')?.rank).toBe(4);
		});

		it('has color attr with default', async () => {
			const plugin = new HighlightPlugin();
			const { pm } = await initWithPlugin(plugin);
			const spec = pm.schemaRegistry.getMarkSpec('highlight');
			expect(spec?.attrs).toEqual({ color: { default: '' } });
		});
	});

	describe('command', () => {
		it('registers removeHighlight command', async () => {
			const plugin = new HighlightPlugin();
			const { pm } = await initWithPlugin(plugin);
			expect(pm.executeCommand('removeHighlight')).toBe(false);
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

			const plugin = new HighlightPlugin();
			const { dispatch } = await initWithPlugin(plugin, state);

			expect(dispatch).not.toHaveBeenCalled();
		});
	});

	describe('toolbar item', () => {
		it('registers a highlight toolbar item', async () => {
			const plugin = new HighlightPlugin();
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'highlight');
			expect(item).toBeDefined();
			expect(item?.group).toBe('format');
			expect(item?.label).toBe('Highlight');
			expect(item?.priority).toBe(46);
			expect(item?.popupType).toBe('custom');
		});

		it('toolbar item reports active state when text has highlight', async () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('marked', [{ type: 'highlight', attrs: { color: '#fff176' } }])],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 2),
				schema: { nodeTypes: ['paragraph'], markTypes: ['highlight'] },
			});

			const plugin = new HighlightPlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state }));

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'highlight');
			expect(item?.isActive?.(state)).toBe(true);
		});

		it('toolbar item reports inactive state when text has no highlight', async () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('plain')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 2),
				schema: { nodeTypes: ['paragraph'], markTypes: ['highlight'] },
			});

			const plugin = new HighlightPlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state }));

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'highlight');
			expect(item?.isActive?.(state)).toBe(false);
		});

		it('respects separatorAfter config', async () => {
			const plugin = new HighlightPlugin({ separatorAfter: true });
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'highlight');
			expect(item?.separatorAfter).toBe(true);
		});
	});

	describe('colors config', () => {
		it('uses default palette when no colors provided', async () => {
			const plugin = new HighlightPlugin();
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'highlight');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const grid = container.querySelector('.notectl-color-picker__grid');
			expect(grid?.children.length).toBe(50);
		});

		it('restricts palette to custom colors', async () => {
			const plugin = new HighlightPlugin({
				colors: ['#fff176', '#aed581', '#4dd0e1'],
			});
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'highlight');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const grid = container.querySelector('.notectl-color-picker__grid');
			expect(grid?.children.length).toBe(3);
		});

		it('accepts shorthand hex colors (#RGB)', () => {
			const plugin = new HighlightPlugin({ colors: ['#f00', '#0f0', '#00f'] });
			expect(plugin).toBeDefined();
		});

		it('normalizes colors to lowercase and deduplicates', async () => {
			const plugin = new HighlightPlugin({
				colors: ['#FFF176', '#fff176', '#AED581'],
			});
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'highlight');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

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
			const plugin = new HighlightPlugin({ colors: [] });
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'highlight');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const grid = container.querySelector('.notectl-color-picker__grid');
			expect(grid?.children.length).toBe(50);
		});
	});

	describe('highlight application', () => {
		it('applies highlight on range selection (removeMark + addMark steps)', async () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: { nodeTypes: ['paragraph'], markTypes: ['highlight'] },
			});

			const plugin = new HighlightPlugin();
			const { pm } = await initWithPlugin(plugin, state);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'highlight');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => state,
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

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

			const plugin = new HighlightPlugin();
			const { pm } = await initWithPlugin(plugin, state);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'highlight');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => state,
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

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

			const plugin = new HighlightPlugin();
			const { pm } = await initWithPlugin(plugin, state);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'highlight');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => state,
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const defaultBtn = container.querySelector('.notectl-color-picker__default');
			expect(defaultBtn).toBeDefined();
			expect(defaultBtn?.textContent).toBe('None');
		});
	});

	describe('combination with TextColor', () => {
		it('highlight and textColor marks coexist independently', async () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[
						createTextNode('hello', [
							{ type: 'textColor', attrs: { color: '#e53935' } },
							{ type: 'highlight', attrs: { color: '#fff176' } },
						]),
					],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 2),
				schema: { nodeTypes: ['paragraph'], markTypes: ['textColor', 'highlight'] },
			});

			const plugin = new HighlightPlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state }));

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'highlight');
			expect(item?.isActive?.(state)).toBe(true);
		});
	});
});
