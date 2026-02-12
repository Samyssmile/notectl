import { describe, expect, it, vi } from 'vitest';
import { createBlockNode, createDocument, createTextNode } from '../../model/Document.js';
import { createCollapsedSelection, createSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { EditorState } from '../../state/EditorState.js';
import type { Plugin } from '../Plugin.js';
import { PluginManager, type PluginManagerInitOptions } from '../PluginManager.js';
import { SuperSubPlugin } from './SuperSubPlugin.js';

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
			markTypes: ['bold', 'italic', 'underline', 'superscript', 'subscript'],
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
	const state: EditorState = stateOverride ?? defaultState();

	await pm.init(
		makeOptions({
			getState: () => state,
			dispatch,
		}),
	);

	return { pm, dispatch };
}

// --- Tests ---

describe('SuperSubPlugin', () => {
	describe('registration', () => {
		it('registers with correct id, name and priority', () => {
			const plugin = new SuperSubPlugin();
			expect(plugin.id).toBe('super-sub');
			expect(plugin.name).toBe('Superscript & Subscript');
			expect(plugin.priority).toBe(23);
		});
	});

	describe('MarkSpec — superscript', () => {
		it('registers superscript MarkSpec', async () => {
			const plugin = new SuperSubPlugin();
			const { pm } = await initWithPlugin(plugin);
			expect(pm.schemaRegistry.getMarkSpec('superscript')).toBeDefined();
		});

		it('superscript MarkSpec creates <sup> element', async () => {
			const plugin = new SuperSubPlugin();
			const { pm } = await initWithPlugin(plugin);

			const spec = pm.schemaRegistry.getMarkSpec('superscript');
			const el = spec?.toDOM({ type: 'superscript' });
			expect(el?.tagName).toBe('SUP');
		});

		it('has rank 4', async () => {
			const plugin = new SuperSubPlugin();
			const { pm } = await initWithPlugin(plugin);
			expect(pm.schemaRegistry.getMarkSpec('superscript')?.rank).toBe(4);
		});
	});

	describe('MarkSpec — subscript', () => {
		it('registers subscript MarkSpec', async () => {
			const plugin = new SuperSubPlugin();
			const { pm } = await initWithPlugin(plugin);
			expect(pm.schemaRegistry.getMarkSpec('subscript')).toBeDefined();
		});

		it('subscript MarkSpec creates <sub> element', async () => {
			const plugin = new SuperSubPlugin();
			const { pm } = await initWithPlugin(plugin);

			const spec = pm.schemaRegistry.getMarkSpec('subscript');
			const el = spec?.toDOM({ type: 'subscript' });
			expect(el?.tagName).toBe('SUB');
		});

		it('has rank 4', async () => {
			const plugin = new SuperSubPlugin();
			const { pm } = await initWithPlugin(plugin);
			expect(pm.schemaRegistry.getMarkSpec('subscript')?.rank).toBe(4);
		});
	});

	describe('commands', () => {
		it('registers toggleSuperscript command', async () => {
			const plugin = new SuperSubPlugin();
			const { pm } = await initWithPlugin(plugin);
			expect(pm.executeCommand('toggleSuperscript')).toBe(true);
		});

		it('registers toggleSubscript command', async () => {
			const plugin = new SuperSubPlugin();
			const { pm } = await initWithPlugin(plugin);
			expect(pm.executeCommand('toggleSubscript')).toBe(true);
		});

		it('toggleSuperscript dispatches a transaction on range selection', async () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: { nodeTypes: ['paragraph'], markTypes: ['superscript', 'subscript'] },
			});

			const plugin = new SuperSubPlugin();
			const { pm, dispatch } = await initWithPlugin(plugin, state);

			pm.executeCommand('toggleSuperscript');

			expect(dispatch).toHaveBeenCalled();
			const tr = dispatch.mock.calls[0]?.[0];
			expect(tr.steps.length).toBeGreaterThan(0);
		});

		it('toggleSubscript dispatches a transaction on range selection', async () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: { nodeTypes: ['paragraph'], markTypes: ['superscript', 'subscript'] },
			});

			const plugin = new SuperSubPlugin();
			const { pm, dispatch } = await initWithPlugin(plugin, state);

			pm.executeCommand('toggleSubscript');

			expect(dispatch).toHaveBeenCalled();
			const tr = dispatch.mock.calls[0]?.[0];
			expect(tr.steps.length).toBeGreaterThan(0);
		});
	});

	describe('keymap', () => {
		it('registers Mod-. for superscript', async () => {
			const plugin = new SuperSubPlugin();
			const { pm } = await initWithPlugin(plugin);

			const keymaps = pm.schemaRegistry.getKeymaps();
			const hasBinding: boolean = keymaps.some((km) => km['Mod-.'] !== undefined);
			expect(hasBinding).toBe(true);
		});

		it('registers Mod-, for subscript', async () => {
			const plugin = new SuperSubPlugin();
			const { pm } = await initWithPlugin(plugin);

			const keymaps = pm.schemaRegistry.getKeymaps();
			const hasBinding: boolean = keymaps.some((km) => km['Mod-,'] !== undefined);
			expect(hasBinding).toBe(true);
		});
	});

	describe('toolbar items', () => {
		it('registers a superscript toolbar item', async () => {
			const plugin = new SuperSubPlugin();
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'superscript');
			expect(item).toBeDefined();
			expect(item?.group).toBe('format');
			expect(item?.icon).toContain('<svg');
			expect(item?.label).toBe('Superscript');
			expect(item?.command).toBe('toggleSuperscript');
			expect(item?.priority).toBe(50);
		});

		it('registers a subscript toolbar item', async () => {
			const plugin = new SuperSubPlugin();
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'subscript');
			expect(item).toBeDefined();
			expect(item?.group).toBe('format');
			expect(item?.icon).toContain('<svg');
			expect(item?.label).toBe('Subscript');
			expect(item?.command).toBe('toggleSubscript');
			expect(item?.priority).toBe(51);
		});

		it('superscript toolbar item reports active state', async () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('x2', [{ type: 'superscript' }])], 'b1'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 1),
				schema: { nodeTypes: ['paragraph'], markTypes: ['superscript', 'subscript'] },
			});

			const plugin = new SuperSubPlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state }));

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'superscript');
			expect(item?.isActive?.(state)).toBe(true);
		});

		it('subscript toolbar item reports active state', async () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('H2O', [{ type: 'subscript' }])], 'b1'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 1),
				schema: { nodeTypes: ['paragraph'], markTypes: ['superscript', 'subscript'] },
			});

			const plugin = new SuperSubPlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state }));

			const items = pm.schemaRegistry.getToolbarItems();
			const item = items.find((i) => i.id === 'subscript');
			expect(item?.isActive?.(state)).toBe(true);
		});

		it('toolbar items report inactive state for plain text', async () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('plain')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 2),
				schema: { nodeTypes: ['paragraph'], markTypes: ['superscript', 'subscript'] },
			});

			const plugin = new SuperSubPlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state }));

			const items = pm.schemaRegistry.getToolbarItems();
			const supItem = items.find((i) => i.id === 'superscript');
			const subItem = items.find((i) => i.id === 'subscript');
			expect(supItem?.isActive?.(state)).toBe(false);
			expect(subItem?.isActive?.(state)).toBe(false);
		});

		it('respects separatorAfter config', async () => {
			const plugin = new SuperSubPlugin({ separatorAfter: true });
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const subItem = items.find((i) => i.id === 'subscript');
			expect(subItem?.separatorAfter).toBe(true);

			// superscript should not have separator (only last visible item)
			const supItem = items.find((i) => i.id === 'superscript');
			expect(supItem?.separatorAfter).toBeFalsy();
		});
	});

	describe('config', () => {
		it('only registers superscript when subscript is disabled', async () => {
			const plugin = new SuperSubPlugin({ subscript: false });
			const { pm } = await initWithPlugin(plugin);

			expect(pm.schemaRegistry.getMarkSpec('superscript')).toBeDefined();
			expect(pm.schemaRegistry.getMarkSpec('subscript')).toBeUndefined();
		});

		it('only registers subscript when superscript is disabled', async () => {
			const plugin = new SuperSubPlugin({ superscript: false });
			const { pm } = await initWithPlugin(plugin);

			expect(pm.schemaRegistry.getMarkSpec('subscript')).toBeDefined();
			expect(pm.schemaRegistry.getMarkSpec('superscript')).toBeUndefined();
		});

		it('hides toolbar item when toolbar config disables it', async () => {
			const plugin = new SuperSubPlugin({ toolbar: { superscript: false } });
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			expect(items.find((i) => i.id === 'superscript')).toBeUndefined();
			expect(items.find((i) => i.id === 'subscript')).toBeDefined();
		});
	});

	describe('exclusivity middleware', () => {
		it('injects removeMark for subscript when addMark superscript is dispatched', async () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: { nodeTypes: ['paragraph'], markTypes: ['superscript', 'subscript'] },
			});

			const plugin = new SuperSubPlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state }));

			// Build a transaction with addMark for superscript
			const tr = state
				.transaction('command')
				.addMark('b1' as BlockId, 0, 5, { type: 'superscript' })
				.setSelection(state.selection)
				.build();

			const finalDispatch = vi.fn();
			pm.dispatchWithMiddleware(tr, state, finalDispatch);

			expect(finalDispatch).toHaveBeenCalled();
			const dispatched = finalDispatch.mock.calls[0]?.[0];
			const hasRemoveSub: boolean = dispatched.steps.some(
				(s: { type: string; mark?: { type: string } }) =>
					s.type === 'removeMark' && s.mark?.type === 'subscript',
			);
			expect(hasRemoveSub).toBe(true);
		});

		it('injects removeMark for superscript when addMark subscript is dispatched', async () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: { nodeTypes: ['paragraph'], markTypes: ['superscript', 'subscript'] },
			});

			const plugin = new SuperSubPlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state }));

			// Build a transaction with addMark for subscript
			const tr = state
				.transaction('command')
				.addMark('b1' as BlockId, 0, 5, { type: 'subscript' })
				.setSelection(state.selection)
				.build();

			const finalDispatch = vi.fn();
			pm.dispatchWithMiddleware(tr, state, finalDispatch);

			expect(finalDispatch).toHaveBeenCalled();
			const dispatched = finalDispatch.mock.calls[0]?.[0];
			const hasRemoveSup: boolean = dispatched.steps.some(
				(s: { type: string; mark?: { type: string } }) =>
					s.type === 'removeMark' && s.mark?.type === 'superscript',
			);
			expect(hasRemoveSup).toBe(true);
		});

		it('does not inject removeMark for unrelated marks', async () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: {
					nodeTypes: ['paragraph'],
					markTypes: ['bold', 'superscript', 'subscript'],
				},
			});

			const plugin = new SuperSubPlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state }));

			// Build a transaction with addMark for bold (unrelated)
			const tr = state
				.transaction('command')
				.addMark('b1' as BlockId, 0, 5, { type: 'bold' })
				.setSelection(state.selection)
				.build();

			const finalDispatch = vi.fn();
			pm.dispatchWithMiddleware(tr, state, finalDispatch);

			expect(finalDispatch).toHaveBeenCalled();
			const dispatched = finalDispatch.mock.calls[0]?.[0];
			// Should not add any removeMark steps for superscript or subscript
			const hasRemove: boolean = dispatched.steps.some(
				(s: { type: string; mark?: { type: string } }) =>
					s.type === 'removeMark' &&
					(s.mark?.type === 'superscript' || s.mark?.type === 'subscript'),
			);
			expect(hasRemove).toBe(false);
		});

		it('does not register middleware when only one mark is enabled', async () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: { nodeTypes: ['paragraph'], markTypes: ['superscript'] },
			});

			const plugin = new SuperSubPlugin({ subscript: false });
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state }));

			// Build a transaction with addMark for superscript
			const tr = state
				.transaction('command')
				.addMark('b1' as BlockId, 0, 5, { type: 'superscript' })
				.setSelection(state.selection)
				.build();

			const finalDispatch = vi.fn();
			pm.dispatchWithMiddleware(tr, state, finalDispatch);

			expect(finalDispatch).toHaveBeenCalled();
			const dispatched = finalDispatch.mock.calls[0]?.[0];
			// No removeMark for subscript since it's not enabled
			const hasRemoveSub: boolean = dispatched.steps.some(
				(s: { type: string; mark?: { type: string } }) =>
					s.type === 'removeMark' && s.mark?.type === 'subscript',
			);
			expect(hasRemoveSub).toBe(false);
		});
	});
});
