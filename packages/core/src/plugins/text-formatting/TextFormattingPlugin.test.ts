import { describe, expect, it, vi } from 'vitest';
import {
	createBlockNode,
	createDocument,
	createTextNode,
	getTextChildren,
} from '../../model/Document.js';
import { createCollapsedSelection, createSelection } from '../../model/Selection.js';
import { EditorState } from '../../state/EditorState.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { PluginManager, type PluginManagerInitOptions } from '../PluginManager.js';
import { TextFormattingPlugin } from './TextFormattingPlugin.js';

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

async function initWithPlugin(
	plugin: Plugin,
	stateOverride?: EditorState,
): Promise<{ pm: PluginManager; dispatch: ReturnType<typeof vi.fn> }> {
	const pm = new PluginManager();
	pm.register(plugin);
	const dispatch = vi.fn();
	const state = stateOverride ?? EditorState.create();

	await pm.init(
		makeOptions({
			getState: () => state,
			dispatch,
		}),
	);

	return { pm, dispatch };
}

// --- Tests ---

describe('TextFormattingPlugin', () => {
	describe('registration', () => {
		it('registers with correct id and name', () => {
			const plugin = new TextFormattingPlugin();
			expect(plugin.id).toBe('text-formatting');
			expect(plugin.name).toBe('Text Formatting');
		});

		it('has priority 20', () => {
			const plugin = new TextFormattingPlugin();
			expect(plugin.priority).toBe(20);
		});
	});

	describe('MarkSpec registration', () => {
		it('registers all three mark specs by default', async () => {
			const plugin = new TextFormattingPlugin();
			const { pm } = await initWithPlugin(plugin);

			const registry = pm.schemaRegistry;
			expect(registry.getMarkSpec('bold')).toBeDefined();
			expect(registry.getMarkSpec('italic')).toBeDefined();
			expect(registry.getMarkSpec('underline')).toBeDefined();
		});

		it('bold MarkSpec creates <strong> element', async () => {
			const plugin = new TextFormattingPlugin();
			const { pm } = await initWithPlugin(plugin);

			const spec = pm.schemaRegistry.getMarkSpec('bold');
			const el = spec?.toDOM({ type: 'bold' });
			expect(el?.tagName).toBe('STRONG');
		});

		it('italic MarkSpec creates <em> element', async () => {
			const plugin = new TextFormattingPlugin();
			const { pm } = await initWithPlugin(plugin);

			const spec = pm.schemaRegistry.getMarkSpec('italic');
			const el = spec?.toDOM({ type: 'italic' });
			expect(el?.tagName).toBe('EM');
		});

		it('underline MarkSpec creates <u> element', async () => {
			const plugin = new TextFormattingPlugin();
			const { pm } = await initWithPlugin(plugin);

			const spec = pm.schemaRegistry.getMarkSpec('underline');
			const el = spec?.toDOM({ type: 'underline' });
			expect(el?.tagName).toBe('U');
		});

		it('respects rank ordering (bold=0, italic=1, underline=2)', async () => {
			const plugin = new TextFormattingPlugin();
			const { pm } = await initWithPlugin(plugin);

			expect(pm.schemaRegistry.getMarkSpec('bold')?.rank).toBe(0);
			expect(pm.schemaRegistry.getMarkSpec('italic')?.rank).toBe(1);
			expect(pm.schemaRegistry.getMarkSpec('underline')?.rank).toBe(2);
		});

		it('does not register disabled marks', async () => {
			const plugin = new TextFormattingPlugin({ bold: true, italic: false, underline: false });
			const { pm } = await initWithPlugin(plugin);

			expect(pm.schemaRegistry.getMarkSpec('bold')).toBeDefined();
			expect(pm.schemaRegistry.getMarkSpec('italic')).toBeUndefined();
			expect(pm.schemaRegistry.getMarkSpec('underline')).toBeUndefined();
		});

		it('registers no marks when all disabled', async () => {
			const plugin = new TextFormattingPlugin({ bold: false, italic: false, underline: false });
			const { pm } = await initWithPlugin(plugin);

			expect(pm.schemaRegistry.getMarkTypes()).toEqual([]);
		});
	});

	describe('command registration', () => {
		it('registers toggleBold command', async () => {
			const plugin = new TextFormattingPlugin();
			const { pm } = await initWithPlugin(plugin);

			expect(pm.executeCommand('toggleBold')).toBe(true);
		});

		it('registers toggleItalic command', async () => {
			const plugin = new TextFormattingPlugin();
			const { pm } = await initWithPlugin(plugin);

			expect(pm.executeCommand('toggleItalic')).toBe(true);
		});

		it('registers toggleUnderline command', async () => {
			const plugin = new TextFormattingPlugin();
			const { pm } = await initWithPlugin(plugin);

			expect(pm.executeCommand('toggleUnderline')).toBe(true);
		});

		it('does not register commands for disabled marks', async () => {
			const plugin = new TextFormattingPlugin({ bold: true, italic: false, underline: false });
			const { pm } = await initWithPlugin(plugin);

			expect(pm.executeCommand('toggleBold')).toBe(true);
			expect(pm.executeCommand('toggleItalic')).toBe(false);
			expect(pm.executeCommand('toggleUnderline')).toBe(false);
		});

		it('toggleBold command dispatches a transaction', async () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
				schema: { nodeTypes: ['paragraph'], markTypes: ['bold', 'italic', 'underline'] },
			});

			const plugin = new TextFormattingPlugin();
			const { pm, dispatch } = await initWithPlugin(plugin, state);

			pm.executeCommand('toggleBold');

			expect(dispatch).toHaveBeenCalled();
			const tr = dispatch.mock.calls[0]?.[0];
			expect(tr.steps.length).toBeGreaterThan(0);
		});
	});

	describe('toolbar item registration', () => {
		it('registers toolbar items for all enabled marks', async () => {
			const plugin = new TextFormattingPlugin();
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const ids = items.map((i) => i.id);
			expect(ids).toContain('bold');
			expect(ids).toContain('italic');
			expect(ids).toContain('underline');
		});

		it('toolbar items have correct labels', async () => {
			const plugin = new TextFormattingPlugin();
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const boldItem = items.find((i) => i.id === 'bold');
			expect(boldItem?.label).toBe('Bold');
			expect(boldItem?.icon).toContain('<svg');
			expect(boldItem?.group).toBe('format');
			expect(boldItem?.command).toBe('toggleBold');
		});

		it('toolbar items have correct priority ordering', async () => {
			const plugin = new TextFormattingPlugin();
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const boldPriority = items.find((i) => i.id === 'bold')?.priority;
			const italicPriority = items.find((i) => i.id === 'italic')?.priority;
			const underlinePriority = items.find((i) => i.id === 'underline')?.priority;

			expect(boldPriority).toBeLessThan(italicPriority);
			expect(italicPriority).toBeLessThan(underlinePriority);
		});

		it('toolbar items report active state', async () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('bold', [{ type: 'bold' }])], 'b1'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 2),
				schema: { nodeTypes: ['paragraph'], markTypes: ['bold', 'italic', 'underline'] },
			});

			const plugin = new TextFormattingPlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makeOptions({ getState: () => state }));

			const items = pm.schemaRegistry.getToolbarItems();
			const boldItem = items.find((i) => i.id === 'bold');
			const italicItem = items.find((i) => i.id === 'italic');

			expect(boldItem?.isActive?.(state)).toBe(true);
			expect(italicItem?.isActive?.(state)).toBe(false);
		});

		it('does not register toolbar items for disabled marks', async () => {
			const plugin = new TextFormattingPlugin({ bold: true, italic: false, underline: false });
			const { pm } = await initWithPlugin(plugin);

			const items = pm.schemaRegistry.getToolbarItems();
			const ids = items.map((i) => i.id);
			expect(ids).toContain('bold');
			expect(ids).not.toContain('italic');
			expect(ids).not.toContain('underline');
		});
	});

	describe('keymap registration', () => {
		it('registers keymaps for enabled marks', async () => {
			const plugin = new TextFormattingPlugin();
			const { pm } = await initWithPlugin(plugin);

			const keymaps = pm.schemaRegistry.getKeymaps();
			expect(keymaps.length).toBeGreaterThan(0);

			const keymap = keymaps[0];
			expect(keymap?.['Mod-B']).toBeDefined();
			expect(keymap?.['Mod-I']).toBeDefined();
			expect(keymap?.['Mod-U']).toBeDefined();
		});

		it('does not register keymaps for disabled marks', async () => {
			const plugin = new TextFormattingPlugin({ bold: true, italic: false, underline: false });
			const { pm } = await initWithPlugin(plugin);

			const keymaps = pm.schemaRegistry.getKeymaps();
			expect(keymaps.length).toBeGreaterThan(0);

			const keymap = keymaps[0];
			expect(keymap?.['Mod-B']).toBeDefined();
			expect(keymap?.['Mod-I']).toBeUndefined();
			expect(keymap?.['Mod-U']).toBeUndefined();
		});

		it('does not register any keymap when all marks disabled', async () => {
			const plugin = new TextFormattingPlugin({ bold: false, italic: false, underline: false });
			const { pm } = await initWithPlugin(plugin);

			const keymaps = pm.schemaRegistry.getKeymaps();
			expect(keymaps).toHaveLength(0);
		});
	});

	describe('config defaults', () => {
		it('enables all marks by default', async () => {
			const plugin = new TextFormattingPlugin();
			const { pm } = await initWithPlugin(plugin);

			expect(pm.schemaRegistry.getMarkSpec('bold')).toBeDefined();
			expect(pm.schemaRegistry.getMarkSpec('italic')).toBeDefined();
			expect(pm.schemaRegistry.getMarkSpec('underline')).toBeDefined();
		});

		it('partial config merges with defaults', async () => {
			const plugin = new TextFormattingPlugin({ italic: false });
			const { pm } = await initWithPlugin(plugin);

			expect(pm.schemaRegistry.getMarkSpec('bold')).toBeDefined();
			expect(pm.schemaRegistry.getMarkSpec('italic')).toBeUndefined();
			expect(pm.schemaRegistry.getMarkSpec('underline')).toBeDefined();
		});
	});
});
