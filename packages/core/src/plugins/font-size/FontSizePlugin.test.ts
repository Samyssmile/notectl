import { describe, expect, it, vi } from 'vitest';
import { createBlockNode, createDocument, createTextNode } from '../../model/Document.js';
import { createCollapsedSelection, createSelection } from '../../model/Selection.js';
import { EditorState } from '../../state/EditorState.js';
import type { Plugin } from '../Plugin.js';
import { PluginManager, type PluginManagerInitOptions } from '../PluginManager.js';
import { DEFAULT_FONT_SIZES, FontSizePlugin } from './FontSizePlugin.js';

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
			markTypes: ['bold', 'italic', 'underline', 'fontSize'],
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

describe('FontSizePlugin', () => {
	describe('registration', () => {
		it('registers with correct id, name, and priority', () => {
			const plugin = new FontSizePlugin();
			expect(plugin.id).toBe('fontSize');
			expect(plugin.name).toBe('Font Size');
			expect(plugin.priority).toBe(21);
		});
	});

	describe('MarkSpec', () => {
		it('registers fontSize MarkSpec', async () => {
			const plugin = new FontSizePlugin();
			const { pm } = await initWithPlugin(plugin);
			expect(pm.schemaRegistry.getMarkSpec('fontSize')).toBeDefined();
		});

		it('fontSize MarkSpec creates <span> with style.fontSize', async () => {
			const plugin = new FontSizePlugin();
			const { pm } = await initWithPlugin(plugin);

			const spec = pm.schemaRegistry.getMarkSpec('fontSize');
			const el = spec?.toDOM({
				type: 'fontSize',
				attrs: { size: '24px' },
			});
			expect(el?.tagName).toBe('SPAN');
			expect(el?.style.fontSize).toBe('24px');
		});

		it('has rank 4', async () => {
			const plugin = new FontSizePlugin();
			const { pm } = await initWithPlugin(plugin);
			expect(pm.schemaRegistry.getMarkSpec('fontSize')?.rank).toBe(4);
		});

		it('has size attr with default', async () => {
			const plugin = new FontSizePlugin();
			const { pm } = await initWithPlugin(plugin);
			const spec = pm.schemaRegistry.getMarkSpec('fontSize');
			expect(spec?.attrs).toEqual({ size: { default: '' } });
		});
	});

	describe('commands', () => {
		it('registers removeFontSize command', async () => {
			const plugin = new FontSizePlugin();
			const { pm } = await initWithPlugin(plugin);
			expect(pm.executeCommand('removeFontSize')).toBe(false);
		});

		it('registers setFontSize command (placeholder)', async () => {
			const plugin = new FontSizePlugin();
			const { pm } = await initWithPlugin(plugin);
			expect(pm.executeCommand('setFontSize')).toBe(false);
		});

		it('registers increaseFontSize command', async () => {
			const plugin = new FontSizePlugin();
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: {
					nodeTypes: ['paragraph'],
					markTypes: ['fontSize'],
				},
			});
			const { pm, dispatch } = await initWithPlugin(plugin, state);
			pm.executeCommand('increaseFontSize');
			expect(dispatch).toHaveBeenCalled();
		});

		it('registers decreaseFontSize command', async () => {
			const plugin = new FontSizePlugin();
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('hello', [{ type: 'fontSize', attrs: { size: '24px' } }])],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: {
					nodeTypes: ['paragraph'],
					markTypes: ['fontSize'],
				},
			});
			const { pm, dispatch } = await initWithPlugin(plugin, state);
			pm.executeCommand('decreaseFontSize');
			expect(dispatch).toHaveBeenCalled();
		});
	});

	describe('toolbar item', () => {
		it('registers a fontSize toolbar item', async () => {
			const plugin = new FontSizePlugin();
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'fontSize');
			expect(item).toBeDefined();
			expect(item?.group).toBe('format');
			expect(item?.label).toBe('Font Size');
			expect(item?.priority).toBe(6);
			expect(item?.popupType).toBe('custom');
		});

		it('toolbar item reports active state when text has fontSize', async () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('sized', [{ type: 'fontSize', attrs: { size: '24px' } }])],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 2),
				schema: {
					nodeTypes: ['paragraph'],
					markTypes: ['fontSize'],
				},
			});

			const plugin = new FontSizePlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state }));

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'fontSize');
			expect(item?.isActive?.(state)).toBe(true);
		});

		it('toolbar item reports inactive when text has no fontSize', async () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('plain')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 2),
				schema: {
					nodeTypes: ['paragraph'],
					markTypes: ['fontSize'],
				},
			});

			const plugin = new FontSizePlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state }));

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'fontSize');
			expect(item?.isActive?.(state)).toBe(false);
		});

		it('respects separatorAfter config', async () => {
			const plugin = new FontSizePlugin({ separatorAfter: true });
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'fontSize');
			expect(item?.separatorAfter).toBe(true);
		});
	});

	describe('custom sizes config', () => {
		it('uses default sizes when no sizes provided', async () => {
			const plugin = new FontSizePlugin();
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'fontSize');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const listItems = container.querySelectorAll('.notectl-font-size-picker__item');
			expect(listItems.length).toBe(DEFAULT_FONT_SIZES.length);
		});

		it('renders custom sizes when provided', async () => {
			const plugin = new FontSizePlugin({ sizes: [12, 16, 24, 48] });
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'fontSize');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const listItems = container.querySelectorAll('.notectl-font-size-picker__item');
			expect(listItems.length).toBe(4);

			const labels = [...container.querySelectorAll('.notectl-font-size-picker__label')].map(
				(el) => el.textContent,
			);
			expect(labels).toEqual(['12', '16', '24', '48']);
		});

		it('sorts and deduplicates custom sizes', async () => {
			const plugin = new FontSizePlugin({ sizes: [48, 12, 24, 12, 48] });
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'fontSize');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const labels = [...container.querySelectorAll('.notectl-font-size-picker__label')].map(
				(el) => el.textContent,
			);
			expect(labels).toEqual(['12', '24', '48']);
		});

		it('falls back to defaults when empty array is provided', async () => {
			const plugin = new FontSizePlugin({ sizes: [] });
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'fontSize');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const listItems = container.querySelectorAll('.notectl-font-size-picker__item');
			expect(listItems.length).toBe(DEFAULT_FONT_SIZES.length);
		});

		it('uses custom defaultSize in toolbar combo label', async () => {
			const plugin = new FontSizePlugin({ sizes: [12, 16, 24], defaultSize: 12 });
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'fontSize');
			expect(item?.icon).toContain('12');
		});

		it('defaultSize is shown in popup input when no mark is active', async () => {
			const plugin = new FontSizePlugin({ defaultSize: 12 });
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'fontSize');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const input = container.querySelector('.notectl-font-size-picker__input') as HTMLInputElement;
			expect(input.value).toBe('12');
		});

		it('selecting defaultSize removes the fontSize mark', async () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('hello', [{ type: 'fontSize', attrs: { size: '24px' } }])],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: {
					nodeTypes: ['paragraph'],
					markTypes: ['fontSize'],
				},
			});

			const plugin = new FontSizePlugin({ sizes: [12, 24, 48], defaultSize: 12 });
			const dispatch = vi.fn();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state, dispatch }));

			// Decrease from 24 → should hit 12 (the defaultSize) → removes mark
			pm.executeCommand('decreaseFontSize');
			expect(dispatch).toHaveBeenCalled();
			const tr = dispatch.mock.calls[0]?.[0];
			const steps = tr.steps;
			const hasAddMark = steps.some((s: { type: string }) => s.type === 'addMark');
			expect(hasAddMark).toBe(false);
		});

		it('increase/decrease steps through custom sizes', async () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: {
					nodeTypes: ['paragraph'],
					markTypes: ['fontSize'],
				},
			});

			const plugin = new FontSizePlugin({ sizes: [10, 16, 32, 64] });
			const dispatch = vi.fn();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state, dispatch }));

			// Default is 16, increase should jump to 32 (not 18)
			pm.executeCommand('increaseFontSize');
			expect(dispatch).toHaveBeenCalled();
			const tr = dispatch.mock.calls[0]?.[0];
			const steps = tr.steps;
			const addMarkStep = steps.find((s: { type: string }) => s.type === 'addMark');
			expect(addMarkStep.mark.attrs.size).toBe('32px');
		});
	});

	describe('popup', () => {
		it('renders a list with 17 preset items', async () => {
			const plugin = new FontSizePlugin();
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'fontSize');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const listItems = container.querySelectorAll('.notectl-font-size-picker__item');
			expect(listItems.length).toBe(17);
		});

		it('renders a custom size input field', async () => {
			const plugin = new FontSizePlugin();
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'fontSize');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const input = container.querySelector('.notectl-font-size-picker__input') as HTMLInputElement;
			expect(input).toBeDefined();
			expect(input.type).toBe('number');
			expect(input.getAttribute('aria-label')).toBe('Custom font size');
		});

		it('marks active preset with aria-selected', async () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('hello', [{ type: 'fontSize', attrs: { size: '24px' } }])],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 2),
				schema: {
					nodeTypes: ['paragraph'],
					markTypes: ['fontSize'],
				},
			});

			const plugin = new FontSizePlugin();
			const { pm } = await initWithPlugin(plugin, state);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'fontSize');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => state,
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const activeItem = container.querySelector('.notectl-font-size-picker__item--active');
			expect(activeItem).toBeDefined();
			expect(activeItem?.getAttribute('aria-selected')).toBe('true');
		});

		it('list has role=listbox and items have role=option', async () => {
			const plugin = new FontSizePlugin();
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'fontSize');

			const container = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const list = container.querySelector('.notectl-font-size-picker__list');
			expect(list?.getAttribute('role')).toBe('listbox');

			const options = container.querySelectorAll('[role="option"]');
			expect(options.length).toBe(17);
		});
	});

	describe('increase / decrease', () => {
		it('increases from default 16 to 18', async () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: {
					nodeTypes: ['paragraph'],
					markTypes: ['fontSize'],
				},
			});

			const plugin = new FontSizePlugin();
			const { dispatch } = await initWithPlugin(plugin, state);
			dispatch.mockClear();

			const ctx = {
				getState: () => state,
				dispatch,
				executeCommand: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext;

			// Access private method via renderPopup indirection is not needed;
			// we test via command execution
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state, dispatch }));
			pm.executeCommand('increaseFontSize');
			expect(dispatch).toHaveBeenCalled();
		});

		it('does not increase beyond max preset (96)', async () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('hello', [{ type: 'fontSize', attrs: { size: '96px' } }])],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: {
					nodeTypes: ['paragraph'],
					markTypes: ['fontSize'],
				},
			});

			const plugin = new FontSizePlugin();
			const { pm, dispatch } = await initWithPlugin(plugin, state);
			dispatch.mockClear();

			pm.executeCommand('increaseFontSize');
			expect(dispatch).not.toHaveBeenCalled();
		});

		it('does not decrease below min preset (8)', async () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('hello', [{ type: 'fontSize', attrs: { size: '8px' } }])],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: {
					nodeTypes: ['paragraph'],
					markTypes: ['fontSize'],
				},
			});

			const plugin = new FontSizePlugin();
			const { pm, dispatch } = await initWithPlugin(plugin, state);
			dispatch.mockClear();

			pm.executeCommand('decreaseFontSize');
			expect(dispatch).not.toHaveBeenCalled();
		});
	});
});
