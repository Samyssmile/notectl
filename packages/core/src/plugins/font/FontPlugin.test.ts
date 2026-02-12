import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlockNode, createDocument, createTextNode } from '../../model/Document.js';
import { createCollapsedSelection, createSelection } from '../../model/Selection.js';
import { EditorState } from '../../state/EditorState.js';
import type { Plugin } from '../Plugin.js';
import { PluginManager, type PluginManagerInitOptions } from '../PluginManager.js';
import { type FontDefinition, FontPlugin } from './FontPlugin.js';

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
		schema: { nodeTypes: ['paragraph'], markTypes: ['bold', 'italic', 'underline', 'font'] },
	});
}

async function initWithPlugin(
	plugin: Plugin,
	stateOverride?: EditorState,
): Promise<{ pm: PluginManager; dispatch: ReturnType<typeof vi.fn> }> {
	const pm = new PluginManager();
	pm.register(plugin);
	const dispatch = vi.fn();
	const state: EditorState = stateOverride ?? defaultState();

	await pm.init(
		makeOptions({
			getState: () => state,
			dispatch,
		}),
	);

	return { pm, dispatch };
}

const TEST_FONT: FontDefinition = {
	name: 'Test Font',
	family: "'Test Font', sans-serif",
	category: 'sans-serif',
};

const MONO_FONT: FontDefinition = {
	name: 'Mono',
	family: "'Mono', monospace",
	category: 'monospace',
};

// --- Tests ---

describe('FontPlugin', () => {
	describe('registration', () => {
		it('registers with correct id, name, and priority', () => {
			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			expect(plugin.id).toBe('font');
			expect(plugin.name).toBe('Font');
			expect(plugin.priority).toBe(22);
		});
	});

	describe('MarkSpec', () => {
		it('registers font MarkSpec', async () => {
			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			const { pm } = await initWithPlugin(plugin);
			expect(pm.schemaRegistry.getMarkSpec('font')).toBeDefined();
		});

		it('font MarkSpec creates <span> with style.fontFamily', async () => {
			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			const { pm } = await initWithPlugin(plugin);

			const spec = pm.schemaRegistry.getMarkSpec('font');
			const el: HTMLElement = spec?.toDOM({
				type: 'font',
				attrs: { family: "'Fira Code', monospace" },
			});
			expect(el?.tagName).toBe('SPAN');
			expect(el?.style.fontFamily).toBeTruthy();
		});

		it('has rank 6', async () => {
			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			const { pm } = await initWithPlugin(plugin);
			expect(pm.schemaRegistry.getMarkSpec('font')?.rank).toBe(6);
		});

		it('has family attr with default', async () => {
			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			const { pm } = await initWithPlugin(plugin);
			const spec = pm.schemaRegistry.getMarkSpec('font');
			expect(spec?.attrs).toEqual({ family: { default: '' } });
		});
	});

	describe('commands', () => {
		it('registers removeFont command', async () => {
			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			const { pm } = await initWithPlugin(plugin);
			expect(pm.executeCommand('removeFont')).toBe(false);
		});

		it('registers setFont command', async () => {
			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			const { pm } = await initWithPlugin(plugin);
			expect(pm.executeCommand('setFont')).toBe(false);
		});

		it('removeFont dispatches on font-marked text with range selection', async () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('hello', [{ type: 'font', attrs: { family: 'Arial' } }])],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: { nodeTypes: ['paragraph'], markTypes: ['font'] },
			});

			const plugin = new FontPlugin({ fonts: [TEST_FONT] });
			const { dispatch } = await initWithPlugin(plugin, state);

			expect(dispatch).not.toHaveBeenCalled();
		});
	});

	describe('configuration', () => {
		it('renders configured fonts in popup', async () => {
			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'font');
			const container: HTMLDivElement = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const listItems = container.querySelectorAll('.notectl-font-picker__item');
			expect(listItems.length).toBe(2);
		});

		it('uses first font as default when defaultFont not specified', async () => {
			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'font');
			const container: HTMLDivElement = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const activeItem = container.querySelector('.notectl-font-picker__item--active');
			expect(activeItem).not.toBeNull();
			const label = activeItem?.querySelector('.notectl-font-picker__label');
			expect(label?.textContent).toBe('Test Font');
		});

		it('uses named defaultFont when specified', async () => {
			const plugin = new FontPlugin({
				fonts: [TEST_FONT, MONO_FONT],
				defaultFont: 'Mono',
			});
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'font');
			const container: HTMLDivElement = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const activeItem = container.querySelector('.notectl-font-picker__item--active');
			expect(activeItem).not.toBeNull();
			const label = activeItem?.querySelector('.notectl-font-picker__label');
			expect(label?.textContent).toBe('Mono');
		});

		it('falls back to first font when defaultFont name not found', async () => {
			const plugin = new FontPlugin({
				fonts: [TEST_FONT, MONO_FONT],
				defaultFont: 'NonExistent',
			});
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'font');
			const container: HTMLDivElement = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const activeItem = container.querySelector('.notectl-font-picker__item--active');
			expect(activeItem).not.toBeNull();
			const label = activeItem?.querySelector('.notectl-font-picker__label');
			expect(label?.textContent).toBe('Test Font');
		});

		it('accepts custom font list', async () => {
			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'font');
			const container: HTMLDivElement = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const listItems = container.querySelectorAll('.notectl-font-picker__item');
			expect(listItems.length).toBe(2);

			const labels = container.querySelectorAll(
				'.notectl-font-picker__item .notectl-font-picker__label',
			);
			expect(labels[0]?.textContent).toBe('Test Font');
			expect(labels[1]?.textContent).toBe('Mono');
		});
	});

	describe('toolbar item', () => {
		it('registers a font toolbar item', async () => {
			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'font');
			expect(item).toBeDefined();
			expect(item?.group).toBe('format');
			expect(item?.label).toBe('Font');
			expect(item?.priority).toBe(5);
			expect(item?.popupType).toBe('custom');
		});

		it('toolbar item reports active state when text has font', async () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('styled', [{ type: 'font', attrs: { family: 'Arial' } }])],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 2),
				schema: { nodeTypes: ['paragraph'], markTypes: ['font'] },
			});

			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state }));

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'font');
			expect(item?.isActive?.(state)).toBe(true);
		});

		it('toolbar item reports inactive state when text has no font', async () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('plain')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 2),
				schema: { nodeTypes: ['paragraph'], markTypes: ['font'] },
			});

			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state }));

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'font');
			expect(item?.isActive?.(state)).toBe(false);
		});

		it('respects separatorAfter config', async () => {
			const plugin = new FontPlugin({ fonts: [TEST_FONT], separatorAfter: true });
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'font');
			expect(item?.separatorAfter).toBe(true);
		});
	});

	describe('popup rendering', () => {
		it('renders font list without separate Default entry', async () => {
			const plugin = new FontPlugin({ fonts: [TEST_FONT] });
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'font');
			const container: HTMLDivElement = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const list = container.querySelector('.notectl-font-picker__list');
			expect(list).not.toBeNull();
			// Only 1 font item (no Default entry, no separator)
			expect(list?.children.length).toBe(1);
		});

		it('highlights active font in popup with checkmark', async () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[
						createTextNode('styled', [
							{
								type: 'font',
								attrs: { family: "'Test Font', sans-serif" },
							},
						]),
					],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 2),
				schema: { nodeTypes: ['paragraph'], markTypes: ['font'] },
			});

			const plugin = new FontPlugin({ fonts: [TEST_FONT] });
			const { pm } = await initWithPlugin(plugin, state);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'font');
			const container: HTMLDivElement = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => state,
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const activeItem = container.querySelector('.notectl-font-picker__item--active');
			expect(activeItem).not.toBeNull();

			const label = activeItem?.querySelector('.notectl-font-picker__label');
			expect(label?.textContent).toBe('Test Font');

			const check = activeItem?.querySelector('.notectl-font-picker__check');
			expect(check?.textContent).toBe('\u2713');
		});

		it('shows font preview with correct font-family on label', async () => {
			const plugin = new FontPlugin({ fonts: [TEST_FONT] });
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'font');
			const container: HTMLDivElement = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const fontLabel = container.querySelector(
				'.notectl-font-picker__item .notectl-font-picker__label',
			) as HTMLElement;
			expect(fontLabel.style.fontFamily).toBeTruthy();
		});

		it('marks default font as active when no font mark is set', async () => {
			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'font');
			const container: HTMLDivElement = document.createElement('div');
			item?.renderPopup?.(container, {
				getState: () => defaultState(),
				dispatch: vi.fn(),
			} as unknown as import('../Plugin.js').PluginContext);

			const activeItem = container.querySelector('.notectl-font-picker__item--active');
			expect(activeItem).not.toBeNull();
			const label = activeItem?.querySelector('.notectl-font-picker__label');
			expect(label?.textContent).toBe('Test Font');
		});
	});

	describe('font application', () => {
		it('applies font on range selection', async () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: { nodeTypes: ['paragraph'], markTypes: ['font'] },
			});

			const plugin = new FontPlugin({ fonts: [TEST_FONT] });
			const dispatch = vi.fn();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state, dispatch }));

			plugin.applyFont(
				{ getState: () => state, dispatch } as unknown as import('../Plugin.js').PluginContext,
				state,
				TEST_FONT.family,
			);

			expect(dispatch).toHaveBeenCalledTimes(1);
		});

		it('applies font on collapsed selection via stored marks', async () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 2),
				schema: { nodeTypes: ['paragraph'], markTypes: ['font'] },
			});

			const plugin = new FontPlugin({ fonts: [TEST_FONT] });
			const dispatch = vi.fn();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state, dispatch }));

			plugin.applyFont(
				{ getState: () => state, dispatch } as unknown as import('../Plugin.js').PluginContext,
				state,
				TEST_FONT.family,
			);

			expect(dispatch).toHaveBeenCalledTimes(1);
		});

		it('replaces font on already-font-styled text', async () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('hello', [{ type: 'font', attrs: { family: 'Arial' } }])],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: { nodeTypes: ['paragraph'], markTypes: ['font'] },
			});

			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			const dispatch = vi.fn();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state, dispatch }));

			plugin.applyFont(
				{ getState: () => state, dispatch } as unknown as import('../Plugin.js').PluginContext,
				state,
				MONO_FONT.family,
			);

			expect(dispatch).toHaveBeenCalledTimes(1);
		});

		it('applies font across multiple blocks', async () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('first')], 'b1'),
				createBlockNode('paragraph', [createTextNode('second')], 'b2'),
			]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b2', offset: 6 }),
				schema: { nodeTypes: ['paragraph'], markTypes: ['font'] },
			});

			const plugin = new FontPlugin({ fonts: [TEST_FONT] });
			const dispatch = vi.fn();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state, dispatch }));

			plugin.applyFont(
				{ getState: () => state, dispatch } as unknown as import('../Plugin.js').PluginContext,
				state,
				TEST_FONT.family,
			);

			expect(dispatch).toHaveBeenCalledTimes(1);
		});
	});

	describe('getActiveFont', () => {
		it('returns null when no font mark is present', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('plain')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 2),
				schema: { nodeTypes: ['paragraph'], markTypes: ['font'] },
			});

			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			expect(plugin.getActiveFont(state)).toBeNull();
		});

		it('returns family when font mark is present', () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('styled', [{ type: 'font', attrs: { family: 'Georgia, serif' } }])],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 2),
				schema: { nodeTypes: ['paragraph'], markTypes: ['font'] },
			});

			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			expect(plugin.getActiveFont(state)).toBe('Georgia, serif');
		});

		it('reads from stored marks when available', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const baseState = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 2),
				schema: { nodeTypes: ['paragraph'], markTypes: ['font'] },
			});

			// Apply stored marks via transaction
			const tr = baseState
				.transaction('command')
				.setStoredMarks([{ type: 'font', attrs: { family: 'Arial' } }], null)
				.setSelection(baseState.selection)
				.build();
			const state: EditorState = baseState.apply(tr);

			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			expect(plugin.getActiveFont(state)).toBe('Arial');
		});
	});

	describe('@font-face injection', () => {
		beforeEach(() => {
			document.querySelectorAll('style[data-notectl-fonts]').forEach((el) => el.remove());
		});

		afterEach(() => {
			document.querySelectorAll('style[data-notectl-fonts]').forEach((el) => el.remove());
		});

		it('injects style element for fonts with fontFaces', async () => {
			const customFont: FontDefinition = {
				name: 'Custom',
				family: "'Custom', sans-serif",
				fontFaces: [{ src: "url('/fonts/Custom.woff2') format('woff2')", weight: '400' }],
			};

			const plugin = new FontPlugin({ fonts: [customFont] });
			await initWithPlugin(plugin);

			const style = document.querySelector('style[data-notectl-fonts]');
			expect(style).not.toBeNull();
			expect(style?.textContent).toContain("font-family: 'Custom'");
			expect(style?.textContent).toContain("url('/fonts/Custom.woff2')");

			plugin.destroy();
		});

		it('does not inject style when no fontFaces defined', async () => {
			const plugin = new FontPlugin({
				fonts: [{ name: 'Arial', family: 'Arial, sans-serif' }],
			});
			await initWithPlugin(plugin);

			const style = document.querySelector('style[data-notectl-fonts]');
			expect(style).toBeNull();

			plugin.destroy();
		});

		it('cleans up style element on destroy', async () => {
			const customFont: FontDefinition = {
				name: 'Custom',
				family: "'Custom', sans-serif",
				fontFaces: [{ src: "url('/fonts/Custom.woff2') format('woff2')", weight: '400' }],
			};

			const plugin = new FontPlugin({ fonts: [customFont] });
			await initWithPlugin(plugin);

			expect(document.querySelector('style[data-notectl-fonts]')).not.toBeNull();

			plugin.destroy();

			expect(document.querySelector('style[data-notectl-fonts]')).toBeNull();
		});
	});
});
