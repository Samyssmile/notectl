import { describe, expect, it, vi } from 'vitest';
import { createBlockNode, createDocument, createTextNode } from '../../model/Document.js';
import { createCollapsedSelection, createSelection } from '../../model/Selection.js';
import { EditorState } from '../../state/EditorState.js';
import type { Plugin } from '../Plugin.js';
import { PluginManager, type PluginManagerInitOptions } from '../PluginManager.js';
import { StrikethroughPlugin } from './StrikethroughPlugin.js';

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
			markTypes: ['bold', 'italic', 'underline', 'strikethrough'],
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

describe('StrikethroughPlugin', () => {
	describe('registration', () => {
		it('registers with correct id and name', () => {
			const plugin = new StrikethroughPlugin();
			expect(plugin.id).toBe('strikethrough');
			expect(plugin.name).toBe('Strikethrough');
			expect(plugin.priority).toBe(22);
		});
	});

	describe('MarkSpec', () => {
		it('registers strikethrough MarkSpec', async () => {
			const plugin = new StrikethroughPlugin();
			const { pm } = await initWithPlugin(plugin);
			expect(pm.schemaRegistry.getMarkSpec('strikethrough')).toBeDefined();
		});

		it('strikethrough MarkSpec creates <s> element', async () => {
			const plugin = new StrikethroughPlugin();
			const { pm } = await initWithPlugin(plugin);

			const spec = pm.schemaRegistry.getMarkSpec('strikethrough');
			const el = spec?.toDOM({ type: 'strikethrough' });
			expect(el?.tagName).toBe('S');
		});

		it('has rank 3', async () => {
			const plugin = new StrikethroughPlugin();
			const { pm } = await initWithPlugin(plugin);
			expect(pm.schemaRegistry.getMarkSpec('strikethrough')?.rank).toBe(3);
		});
	});

	describe('command', () => {
		it('registers toggleStrikethrough command', async () => {
			const plugin = new StrikethroughPlugin();
			const { pm } = await initWithPlugin(plugin);
			expect(pm.executeCommand('toggleStrikethrough')).toBe(true);
		});

		it('toggleStrikethrough dispatches a transaction on range selection', async () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: { nodeTypes: ['paragraph'], markTypes: ['strikethrough'] },
			});

			const plugin = new StrikethroughPlugin();
			const { pm, dispatch } = await initWithPlugin(plugin, state);

			pm.executeCommand('toggleStrikethrough');

			expect(dispatch).toHaveBeenCalled();
			const tr = dispatch.mock.calls[0]?.[0];
			expect(tr.steps.length).toBeGreaterThan(0);
		});
	});

	describe('keymap', () => {
		it('registers Mod-Shift-X keymap', async () => {
			const plugin = new StrikethroughPlugin();
			const { pm } = await initWithPlugin(plugin);

			const keymaps = pm.schemaRegistry.getKeymaps();
			expect(keymaps.length).toBeGreaterThan(0);

			const keymap = keymaps[0];
			expect(keymap?.['Mod-Shift-X']).toBeDefined();
		});
	});

	describe('toolbar item', () => {
		it('registers a strikethrough toolbar item', async () => {
			const plugin = new StrikethroughPlugin();
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'strikethrough');
			expect(item).toBeDefined();
			expect(item?.group).toBe('format');
			expect(item?.icon).toContain('<svg');
			expect(item?.label).toBe('Strikethrough');
			expect(item?.command).toBe('toggleStrikethrough');
		});

		it('toolbar item reports active state', async () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('struck', [{ type: 'strikethrough' }])], 'b1'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 2),
				schema: { nodeTypes: ['paragraph'], markTypes: ['strikethrough'] },
			});

			const plugin = new StrikethroughPlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state }));

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'strikethrough');
			expect(item?.isActive?.(state)).toBe(true);
		});

		it('toolbar item reports inactive state', async () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('plain')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 2),
				schema: { nodeTypes: ['paragraph'], markTypes: ['strikethrough'] },
			});

			const plugin = new StrikethroughPlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state }));

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'strikethrough');
			expect(item?.isActive?.(state)).toBe(false);
		});

		it('respects separatorAfter config', async () => {
			const plugin = new StrikethroughPlugin({ separatorAfter: true });
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'strikethrough');
			expect(item?.separatorAfter).toBe(true);
		});
	});
});
