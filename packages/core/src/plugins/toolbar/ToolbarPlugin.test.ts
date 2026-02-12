import { describe, expect, it, vi } from 'vitest';
import { createBlockNode, createDocument, createTextNode } from '../../model/Document.js';
import { SchemaRegistry } from '../../model/SchemaRegistry.js';
import { createCollapsedSelection } from '../../model/Selection.js';
import { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { Plugin } from '../Plugin.js';
import { PluginManager } from '../PluginManager.js';
import type { ToolbarItem } from './ToolbarItem.js';
import { ToolbarPlugin } from './ToolbarPlugin.js';
import type { ToolbarLayoutConfig } from './ToolbarPlugin.js';

// --- Helpers ---

function makeState(): EditorState {
	const block = createBlockNode('paragraph', [createTextNode('')], 'b1');
	const doc = createDocument([block]);
	return EditorState.create({
		doc,
		selection: createCollapsedSelection(block.id, 0),
		schema: { nodeTypes: ['paragraph'], markTypes: ['bold'] },
	});
}

function makeToolbarItem(overrides: Partial<ToolbarItem> & { id: string }): ToolbarItem {
	return {
		group: 'format',
		icon: '<svg></svg>',
		label: overrides.id,
		command: `cmd-${overrides.id}`,
		...overrides,
	};
}

/** A minimal fake plugin that registers toolbar items during init. */
function createFakePlugin(id: string, items: ToolbarItem[], opts?: { priority?: number }): Plugin {
	return {
		id,
		name: id,
		priority: opts?.priority ?? 100,
		init(context) {
			for (const item of items) {
				context.registerToolbarItem(item);
			}
		},
	};
}

async function initWithPlugins(
	plugins: Plugin[],
	toolbarPlugin: ToolbarPlugin,
): Promise<{ pm: PluginManager; container: HTMLElement }> {
	const pm = new PluginManager();
	let currentState = makeState();

	for (const p of plugins) {
		pm.register(p);
	}
	pm.register(toolbarPlugin);

	const container = document.createElement('div');

	await pm.init({
		getState: () => currentState,
		dispatch: vi.fn((tr: Transaction) => {
			currentState = currentState.apply(tr);
		}),
		getContainer: () => document.createElement('div'),
		getPluginContainer: () => container,
	});

	return { pm, container };
}

// --- SchemaRegistry pluginId tracking ---

describe('SchemaRegistry toolbar pluginId tracking', () => {
	it('registerToolbarItem tracks pluginId', () => {
		const registry = new SchemaRegistry();
		const item = makeToolbarItem({ id: 'bold' });
		registry.registerToolbarItem(item, 'text-formatting');

		const items = registry.getToolbarItemsByPlugin('text-formatting');
		expect(items).toHaveLength(1);
		expect(items[0]?.id).toBe('bold');
	});

	it('getToolbarItemsByPlugin returns correct items', () => {
		const registry = new SchemaRegistry();
		registry.registerToolbarItem(makeToolbarItem({ id: 'bold' }), 'text-formatting');
		registry.registerToolbarItem(makeToolbarItem({ id: 'italic' }), 'text-formatting');
		registry.registerToolbarItem(makeToolbarItem({ id: 'heading' }), 'heading');

		expect(registry.getToolbarItemsByPlugin('text-formatting')).toHaveLength(2);
		expect(registry.getToolbarItemsByPlugin('heading')).toHaveLength(1);
	});

	it('getToolbarItemsByPlugin returns empty array for unknown pluginId', () => {
		const registry = new SchemaRegistry();
		expect(registry.getToolbarItemsByPlugin('nonexistent')).toHaveLength(0);
	});

	it('removeToolbarItem cleans up pluginMap', () => {
		const registry = new SchemaRegistry();
		registry.registerToolbarItem(makeToolbarItem({ id: 'bold' }), 'text-formatting');
		registry.registerToolbarItem(makeToolbarItem({ id: 'italic' }), 'text-formatting');

		registry.removeToolbarItem('bold');
		const items = registry.getToolbarItemsByPlugin('text-formatting');
		expect(items).toHaveLength(1);
		expect(items[0]?.id).toBe('italic');
	});

	it('removeToolbarItem removes pluginMap entry when last item removed', () => {
		const registry = new SchemaRegistry();
		registry.registerToolbarItem(makeToolbarItem({ id: 'bold' }), 'text-formatting');

		registry.removeToolbarItem('bold');
		expect(registry.getToolbarItemsByPlugin('text-formatting')).toHaveLength(0);
	});

	it('clear resets pluginMap', () => {
		const registry = new SchemaRegistry();
		registry.registerToolbarItem(makeToolbarItem({ id: 'bold' }), 'text-formatting');

		registry.clear();
		expect(registry.getToolbarItemsByPlugin('text-formatting')).toHaveLength(0);
	});

	it('registerToolbarItem without pluginId still works', () => {
		const registry = new SchemaRegistry();
		const item = makeToolbarItem({ id: 'bold' });
		registry.registerToolbarItem(item);

		expect(registry.getToolbarItem('bold')).toBe(item);
		expect(registry.getToolbarItemsByPlugin('')).toHaveLength(0);
	});
});

// --- ToolbarPlugin layout rendering ---

describe('ToolbarPlugin', () => {
	it('renders items in layout-group order with separators between groups', async () => {
		const pluginA = createFakePlugin('plugin-a', [
			makeToolbarItem({ id: 'a1', priority: 10 }),
			makeToolbarItem({ id: 'a2', priority: 20 }),
		]);
		const pluginB = createFakePlugin('plugin-b', [makeToolbarItem({ id: 'b1' })]);
		const pluginC = createFakePlugin('plugin-c', [makeToolbarItem({ id: 'c1' })]);

		const layoutConfig: ToolbarLayoutConfig = {
			groups: [['plugin-a'], ['plugin-b', 'plugin-c']],
		};
		const toolbar = new ToolbarPlugin(layoutConfig);

		const { container } = await initWithPlugins([pluginA, pluginB, pluginC], toolbar);

		const toolbarEl = container.querySelector('.notectl-toolbar');
		const children = [...(toolbarEl?.children ?? [])];

		// Group 1: a1, a2 | separator | Group 2: b1, c1
		const buttons = children.filter((el) => el.tagName === 'BUTTON') as HTMLButtonElement[];
		const separators = children.filter((el) => el.classList.contains('notectl-toolbar-separator'));

		expect(buttons).toHaveLength(4);
		expect(buttons[0]?.getAttribute('data-toolbar-item')).toBe('a1');
		expect(buttons[1]?.getAttribute('data-toolbar-item')).toBe('a2');
		expect(buttons[2]?.getAttribute('data-toolbar-item')).toBe('b1');
		expect(buttons[3]?.getAttribute('data-toolbar-item')).toBe('c1');
		expect(separators).toHaveLength(1);
	});

	it('skips empty groups without extra separators', async () => {
		const pluginA = createFakePlugin('plugin-a', [makeToolbarItem({ id: 'a1' })]);
		// plugin-empty registers no toolbar items
		const pluginEmpty = createFakePlugin('plugin-empty', []);
		const pluginB = createFakePlugin('plugin-b', [makeToolbarItem({ id: 'b1' })]);

		const layoutConfig: ToolbarLayoutConfig = {
			groups: [['plugin-a'], ['plugin-empty'], ['plugin-b']],
		};
		const toolbar = new ToolbarPlugin(layoutConfig);

		const { container } = await initWithPlugins([pluginA, pluginEmpty, pluginB], toolbar);

		const toolbarEl = container.querySelector('.notectl-toolbar');
		const separators = toolbarEl?.querySelectorAll('.notectl-toolbar-separator');
		const buttons = toolbarEl?.querySelectorAll('button');

		expect(buttons).toHaveLength(2);
		expect(separators).toHaveLength(1);
	});

	it('hidden items are excluded in layout mode', async () => {
		const pluginA = createFakePlugin('plugin-a', [
			makeToolbarItem({ id: 'a1' }),
			makeToolbarItem({ id: 'a2' }),
		]);

		const layoutConfig: ToolbarLayoutConfig = {
			groups: [['plugin-a']],
		};
		const toolbar = new ToolbarPlugin(layoutConfig);

		const { pm, container } = await initWithPlugins([pluginA], toolbar);

		// Hide a1
		pm.configurePlugin('toolbar', { a1: false });

		const toolbarEl = container.querySelector('.notectl-toolbar');
		const buttons = toolbarEl?.querySelectorAll('button');
		expect(buttons).toHaveLength(1);
		expect(buttons?.[0]?.getAttribute('data-toolbar-item')).toBe('a2');
	});

	it('falls back to priority sorting without layout config', async () => {
		const pluginA = createFakePlugin('plugin-a', [makeToolbarItem({ id: 'a1', priority: 20 })]);
		const pluginB = createFakePlugin('plugin-b', [makeToolbarItem({ id: 'b1', priority: 10 })]);

		// No layout config — legacy mode
		const toolbar = new ToolbarPlugin();

		const { container } = await initWithPlugins([pluginA, pluginB], toolbar);

		const toolbarEl = container.querySelector('.notectl-toolbar');
		const buttons = toolbarEl?.querySelectorAll('button');

		// b1 (priority 10) should come before a1 (priority 20)
		expect(buttons?.[0]?.getAttribute('data-toolbar-item')).toBe('b1');
		expect(buttons?.[1]?.getAttribute('data-toolbar-item')).toBe('a1');
	});

	it('within a plugin, items are sorted by priority in layout mode', async () => {
		const pluginA = createFakePlugin('plugin-a', [
			makeToolbarItem({ id: 'a-high', priority: 30 }),
			makeToolbarItem({ id: 'a-low', priority: 10 }),
			makeToolbarItem({ id: 'a-mid', priority: 20 }),
		]);

		const layoutConfig: ToolbarLayoutConfig = {
			groups: [['plugin-a']],
		};
		const toolbar = new ToolbarPlugin(layoutConfig);

		const { container } = await initWithPlugins([pluginA], toolbar);

		const toolbarEl = container.querySelector('.notectl-toolbar');
		const buttons = toolbarEl?.querySelectorAll('button');

		expect(buttons?.[0]?.getAttribute('data-toolbar-item')).toBe('a-low');
		expect(buttons?.[1]?.getAttribute('data-toolbar-item')).toBe('a-mid');
		expect(buttons?.[2]?.getAttribute('data-toolbar-item')).toBe('a-high');
	});
});
