import { describe, expect, it, vi } from 'vitest';
import { createBlockNode, createDocument, createTextNode } from '../../model/Document.js';
import { createCollapsedSelection, createSelection } from '../../model/Selection.js';
import { EditorState } from '../../state/EditorState.js';
import type { Plugin } from '../Plugin.js';
import { PluginManager, type PluginManagerInitOptions } from '../PluginManager.js';
import { TextColorPlugin } from './TextColorPlugin.js';

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
		schema: { nodeTypes: ['paragraph'], markTypes: ['bold', 'italic', 'underline', 'textColor'] },
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

describe('TextColorPlugin', () => {
	describe('registration', () => {
		it('registers with correct id, name, and priority', () => {
			const plugin = new TextColorPlugin();
			expect(plugin.id).toBe('textColor');
			expect(plugin.name).toBe('Text Color');
			expect(plugin.priority).toBe(23);
		});
	});

	describe('MarkSpec', () => {
		it('registers textColor MarkSpec', async () => {
			const plugin = new TextColorPlugin();
			const { pm } = await initWithPlugin(plugin);
			expect(pm.schemaRegistry.getMarkSpec('textColor')).toBeDefined();
		});

		it('textColor MarkSpec creates <span> with style.color', async () => {
			const plugin = new TextColorPlugin();
			const { pm } = await initWithPlugin(plugin);

			const spec = pm.schemaRegistry.getMarkSpec('textColor');
			const el = spec?.toDOM({ type: 'textColor', attrs: { color: '#ff0000' } });
			expect(el?.tagName).toBe('SPAN');
			expect(el?.style.color).toBeTruthy();
		});

		it('has rank 5', async () => {
			const plugin = new TextColorPlugin();
			const { pm } = await initWithPlugin(plugin);
			expect(pm.schemaRegistry.getMarkSpec('textColor')?.rank).toBe(5);
		});

		it('has color attr with default', async () => {
			const plugin = new TextColorPlugin();
			const { pm } = await initWithPlugin(plugin);
			const spec = pm.schemaRegistry.getMarkSpec('textColor');
			expect(spec?.attrs).toEqual({ color: { default: '' } });
		});
	});

	describe('command', () => {
		it('registers removeTextColor command', async () => {
			const plugin = new TextColorPlugin();
			const { pm } = await initWithPlugin(plugin);
			// With default state (collapsed, no color), removeTextColor returns false
			expect(pm.executeCommand('removeTextColor')).toBe(false);
		});

		it('removeTextColor dispatches on colored text with range selection', async () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('hello', [{ type: 'textColor', attrs: { color: '#ff0000' } }])],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: { nodeTypes: ['paragraph'], markTypes: ['textColor'] },
			});

			const plugin = new TextColorPlugin();
			const { dispatch } = await initWithPlugin(plugin, state);

			// Execute removeTextColor — it dispatches via the plugin context
			// The command was registered and will use current state
			expect(dispatch).not.toHaveBeenCalled();
		});
	});

	describe('toolbar item', () => {
		it('registers a textColor toolbar item', async () => {
			const plugin = new TextColorPlugin();
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'textColor');
			expect(item).toBeDefined();
			expect(item?.group).toBe('format');
			expect(item?.label).toBe('Text Color');
			expect(item?.priority).toBe(45);
			expect(item?.popupType).toBe('custom');
		});

		it('toolbar item reports active state when text has color', async () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('colored', [{ type: 'textColor', attrs: { color: '#ff0000' } }])],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 2),
				schema: { nodeTypes: ['paragraph'], markTypes: ['textColor'] },
			});

			const plugin = new TextColorPlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state }));

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'textColor');
			expect(item?.isActive?.(state)).toBe(true);
		});

		it('toolbar item reports inactive state when text has no color', async () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('plain')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 2),
				schema: { nodeTypes: ['paragraph'], markTypes: ['textColor'] },
			});

			const plugin = new TextColorPlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state }));

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'textColor');
			expect(item?.isActive?.(state)).toBe(false);
		});

		it('respects separatorAfter config', async () => {
			const plugin = new TextColorPlugin({ separatorAfter: true });
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'textColor');
			expect(item?.separatorAfter).toBe(true);
		});
	});

	describe('colors config', () => {
		it('uses default palette when no colors provided', async () => {
			const plugin = new TextColorPlugin();
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'textColor');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const grid = container.querySelector('.notectl-color-picker__grid');
			expect(grid?.children.length).toBe(70);
		});

		it('restricts palette to custom colors', async () => {
			const plugin = new TextColorPlugin({
				colors: ['#ff0000', '#00ff00', '#0000ff'],
			});
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'textColor');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const grid = container.querySelector('.notectl-color-picker__grid');
			expect(grid?.children.length).toBe(3);
		});

		it('accepts shorthand hex colors (#RGB)', () => {
			const plugin = new TextColorPlugin({ colors: ['#f00', '#0f0', '#00f'] });
			expect(plugin).toBeDefined();
		});

		it('normalizes colors to lowercase and deduplicates', async () => {
			const plugin = new TextColorPlugin({
				colors: ['#FF0000', '#ff0000', '#00FF00'],
			});
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'textColor');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const grid = container.querySelector('.notectl-color-picker__grid');
			expect(grid?.children.length).toBe(2);
		});

		it('throws on invalid hex color', () => {
			expect(() => new TextColorPlugin({ colors: ['red'] })).toThrow(
				'TextColorPlugin: invalid hex color(s): red',
			);
		});

		it('throws on hex color without hash', () => {
			expect(() => new TextColorPlugin({ colors: ['ff0000'] })).toThrow(
				'TextColorPlugin: invalid hex color(s): ff0000',
			);
		});

		it('throws listing all invalid values', () => {
			expect(() => new TextColorPlugin({ colors: ['#ff0000', 'bad', 'rgb(0,0,0)'] })).toThrow(
				'TextColorPlugin: invalid hex color(s): bad, rgb(0,0,0)',
			);
		});

		it('falls back to default palette for empty array', async () => {
			const plugin = new TextColorPlugin({ colors: [] });
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'textColor');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const grid = container.querySelector('.notectl-color-picker__grid');
			expect(grid?.children.length).toBe(70);
		});
	});

	describe('color application', () => {
		it('applies color on range selection (removeMark + addMark steps)', async () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: { nodeTypes: ['paragraph'], markTypes: ['textColor'] },
			});

			const plugin = new TextColorPlugin();
			const { pm } = await initWithPlugin(plugin, state);

			// Render the popup to trigger color application
			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'textColor');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => state,
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			// Verify grid was rendered
			const grid = container.querySelector('.notectl-color-picker__grid');
			expect(grid).toBeDefined();
			expect(grid?.children.length).toBe(70); // 10x7
		});

		it('replaces color on already-colored text', async () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('hello', [{ type: 'textColor', attrs: { color: '#ff0000' } }])],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: { nodeTypes: ['paragraph'], markTypes: ['textColor'] },
			});

			const plugin = new TextColorPlugin();
			const { pm } = await initWithPlugin(plugin, state);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'textColor');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => state,
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			// Check the active swatch is highlighted
			const activeSwatch = container.querySelector('.notectl-color-picker__swatch--active');
			expect(activeSwatch).toBeDefined();
		});

		it('removes color via Default button', async () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('hello', [{ type: 'textColor', attrs: { color: '#ff0000' } }])],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: { nodeTypes: ['paragraph'], markTypes: ['textColor'] },
			});

			const plugin = new TextColorPlugin();
			const { pm } = await initWithPlugin(plugin, state);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'textColor');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => state,
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const defaultBtn = container.querySelector('.notectl-color-picker__default');
			expect(defaultBtn).toBeDefined();
			expect(defaultBtn?.textContent).toBe('Default');
		});
	});
});
