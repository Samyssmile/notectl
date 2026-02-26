import { describe, expect, it, vi } from 'vitest';
import { createBlockNode, createDocument, createTextNode } from '../../model/Document.js';
import { createCollapsedSelection } from '../../model/Selection.js';
import { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { Plugin } from '../Plugin.js';
import { PluginManager } from '../PluginManager.js';
import type { ToolbarItem, ToolbarItemCombobox } from './ToolbarItem.js';
import { ToolbarOverflowBehavior } from './ToolbarOverflowBehavior.js';
import { ToolbarPlugin } from './ToolbarPlugin.js';
import type { ToolbarLayoutConfig } from './ToolbarPlugin.js';
import { ToolbarRegistry } from './ToolbarRegistry.js';

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

// --- ToolbarRegistry pluginId tracking ---

describe('ToolbarRegistry toolbar pluginId tracking', () => {
	it('registerToolbarItem tracks pluginId', () => {
		const registry = new ToolbarRegistry();
		const item = makeToolbarItem({ id: 'bold' });
		registry.registerToolbarItem(item, 'text-formatting');

		const items = registry.getToolbarItemsByPlugin('text-formatting');
		expect(items).toHaveLength(1);
		expect(items[0]?.id).toBe('bold');
	});

	it('getToolbarItemsByPlugin returns correct items', () => {
		const registry = new ToolbarRegistry();
		registry.registerToolbarItem(makeToolbarItem({ id: 'bold' }), 'text-formatting');
		registry.registerToolbarItem(makeToolbarItem({ id: 'italic' }), 'text-formatting');
		registry.registerToolbarItem(makeToolbarItem({ id: 'heading' }), 'heading');

		expect(registry.getToolbarItemsByPlugin('text-formatting')).toHaveLength(2);
		expect(registry.getToolbarItemsByPlugin('heading')).toHaveLength(1);
	});

	it('getToolbarItemsByPlugin returns empty array for unknown pluginId', () => {
		const registry = new ToolbarRegistry();
		expect(registry.getToolbarItemsByPlugin('nonexistent')).toHaveLength(0);
	});

	it('removeToolbarItem cleans up pluginMap', () => {
		const registry = new ToolbarRegistry();
		registry.registerToolbarItem(makeToolbarItem({ id: 'bold' }), 'text-formatting');
		registry.registerToolbarItem(makeToolbarItem({ id: 'italic' }), 'text-formatting');

		registry.removeToolbarItem('bold');
		const items = registry.getToolbarItemsByPlugin('text-formatting');
		expect(items).toHaveLength(1);
		expect(items[0]?.id).toBe('italic');
	});

	it('removeToolbarItem removes pluginMap entry when last item removed', () => {
		const registry = new ToolbarRegistry();
		registry.registerToolbarItem(makeToolbarItem({ id: 'bold' }), 'text-formatting');

		registry.removeToolbarItem('bold');
		expect(registry.getToolbarItemsByPlugin('text-formatting')).toHaveLength(0);
	});

	it('clear resets pluginMap', () => {
		const registry = new ToolbarRegistry();
		registry.registerToolbarItem(makeToolbarItem({ id: 'bold' }), 'text-formatting');

		registry.clear();
		expect(registry.getToolbarItemsByPlugin('text-formatting')).toHaveLength(0);
	});

	it('registerToolbarItem without pluginId still works', () => {
		const registry = new ToolbarRegistry();
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
		const buttons = children.filter(
			(el) => el.tagName === 'BUTTON' && el.classList.contains('notectl-toolbar-btn'),
		) as HTMLButtonElement[];
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
		const buttons = toolbarEl?.querySelectorAll('button.notectl-toolbar-btn');

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
		const buttons = toolbarEl?.querySelectorAll('button.notectl-toolbar-btn');
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
		const buttons = toolbarEl?.querySelectorAll('button.notectl-toolbar-btn');

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
		const buttons = toolbarEl?.querySelectorAll('button.notectl-toolbar-btn');

		expect(buttons?.[0]?.getAttribute('data-toolbar-item')).toBe('a-low');
		expect(buttons?.[1]?.getAttribute('data-toolbar-item')).toBe('a-mid');
		expect(buttons?.[2]?.getAttribute('data-toolbar-item')).toBe('a-high');
	});

	describe('readonly mode', () => {
		it('hides toolbar when onReadOnlyChange(true) is called', async () => {
			const pluginA = createFakePlugin('plugin-a', [makeToolbarItem({ id: 'a1' })]);
			const toolbar = new ToolbarPlugin({ groups: [['plugin-a']] });

			const { container } = await initWithPlugins([pluginA], toolbar);
			const toolbarEl = container.querySelector('.notectl-toolbar') as HTMLElement;

			expect(toolbarEl.hidden).toBe(false);

			toolbar.onReadOnlyChange(true);
			expect(toolbarEl.hidden).toBe(true);
		});

		it('shows toolbar when onReadOnlyChange(false) is called', async () => {
			const pluginA = createFakePlugin('plugin-a', [makeToolbarItem({ id: 'a1' })]);
			const toolbar = new ToolbarPlugin({ groups: [['plugin-a']] });

			const { container } = await initWithPlugins([pluginA], toolbar);
			const toolbarEl = container.querySelector('.notectl-toolbar') as HTMLElement;

			toolbar.onReadOnlyChange(true);
			expect(toolbarEl.hidden).toBe(true);

			toolbar.onReadOnlyChange(false);
			expect(toolbarEl.hidden).toBe(false);
		});

		it('hides toolbar via PluginManager.setReadOnly()', async () => {
			const pluginA = createFakePlugin('plugin-a', [makeToolbarItem({ id: 'a1' })]);
			const toolbar = new ToolbarPlugin({ groups: [['plugin-a']] });

			const { pm, container } = await initWithPlugins([pluginA], toolbar);
			const toolbarEl = container.querySelector('.notectl-toolbar') as HTMLElement;

			pm.setReadOnly(true);
			expect(toolbarEl.hidden).toBe(true);

			pm.setReadOnly(false);
			expect(toolbarEl.hidden).toBe(false);
		});
	});

	describe('overflow behavior', () => {
		it('defaults to BurgerMenu when no overflow is specified', async () => {
			const pluginA = createFakePlugin('plugin-a', [makeToolbarItem({ id: 'a1' })]);
			const toolbar = new ToolbarPlugin({ groups: [['plugin-a']] });

			const { container } = await initWithPlugins([pluginA], toolbar);
			const toolbarEl = container.querySelector('.notectl-toolbar') as HTMLElement;

			expect(toolbar.getOverflowBehavior()).toBe(ToolbarOverflowBehavior.BurgerMenu);
			expect(toolbarEl.getAttribute('data-overflow')).toBe('burger-menu');
		});

		it('sets data-overflow attribute to flow when configured', async () => {
			const pluginA = createFakePlugin('plugin-a', [makeToolbarItem({ id: 'a1' })]);
			const toolbar = new ToolbarPlugin({
				groups: [['plugin-a']],
				overflow: ToolbarOverflowBehavior.Flow,
			});

			const { container } = await initWithPlugins([pluginA], toolbar);
			const toolbarEl = container.querySelector('.notectl-toolbar') as HTMLElement;

			expect(toolbar.getOverflowBehavior()).toBe(ToolbarOverflowBehavior.Flow);
			expect(toolbarEl.getAttribute('data-overflow')).toBe('flow');
		});

		it('sets data-overflow attribute to none when configured', async () => {
			const pluginA = createFakePlugin('plugin-a', [makeToolbarItem({ id: 'a1' })]);
			const toolbar = new ToolbarPlugin({
				groups: [['plugin-a']],
				overflow: ToolbarOverflowBehavior.None,
			});

			const { container } = await initWithPlugins([pluginA], toolbar);
			const toolbarEl = container.querySelector('.notectl-toolbar') as HTMLElement;

			expect(toolbar.getOverflowBehavior()).toBe(ToolbarOverflowBehavior.None);
			expect(toolbarEl.getAttribute('data-overflow')).toBe('none');
		});

		it('does not create overflow controller in Flow mode', async () => {
			const pluginA = createFakePlugin('plugin-a', [makeToolbarItem({ id: 'a1' })]);
			const toolbar = new ToolbarPlugin({
				groups: [['plugin-a']],
				overflow: ToolbarOverflowBehavior.Flow,
			});

			const { container } = await initWithPlugins([pluginA], toolbar);
			const toolbarEl = container.querySelector('.notectl-toolbar') as HTMLElement;

			// No overflow button should exist in Flow mode
			const overflowBtn = toolbarEl.querySelector('.notectl-toolbar-overflow-btn');
			expect(overflowBtn).toBeNull();
		});

		it('does not create overflow controller in None mode', async () => {
			const pluginA = createFakePlugin('plugin-a', [makeToolbarItem({ id: 'a1' })]);
			const toolbar = new ToolbarPlugin({
				groups: [['plugin-a']],
				overflow: ToolbarOverflowBehavior.None,
			});

			const { container } = await initWithPlugins([pluginA], toolbar);
			const toolbarEl = container.querySelector('.notectl-toolbar') as HTMLElement;

			const overflowBtn = toolbarEl.querySelector('.notectl-toolbar-overflow-btn');
			expect(overflowBtn).toBeNull();
		});

		it('switches overflow behavior at runtime via setOverflowBehavior()', async () => {
			const pluginA = createFakePlugin('plugin-a', [makeToolbarItem({ id: 'a1' })]);
			const toolbar = new ToolbarPlugin({
				groups: [['plugin-a']],
				overflow: ToolbarOverflowBehavior.BurgerMenu,
			});

			const { container } = await initWithPlugins([pluginA], toolbar);
			const toolbarEl = container.querySelector('.notectl-toolbar') as HTMLElement;

			expect(toolbarEl.getAttribute('data-overflow')).toBe('burger-menu');

			toolbar.setOverflowBehavior(ToolbarOverflowBehavior.Flow);

			expect(toolbar.getOverflowBehavior()).toBe(ToolbarOverflowBehavior.Flow);
			expect(toolbarEl.getAttribute('data-overflow')).toBe('flow');
			// Overflow button should be removed after switching to Flow
			const overflowBtn = toolbarEl.querySelector('.notectl-toolbar-overflow-btn');
			expect(overflowBtn).toBeNull();
		});

		it('switches from Flow to BurgerMenu at runtime', async () => {
			const pluginA = createFakePlugin('plugin-a', [makeToolbarItem({ id: 'a1' })]);
			const toolbar = new ToolbarPlugin({
				groups: [['plugin-a']],
				overflow: ToolbarOverflowBehavior.Flow,
			});

			const { container } = await initWithPlugins([pluginA], toolbar);
			const toolbarEl = container.querySelector('.notectl-toolbar') as HTMLElement;

			expect(toolbarEl.getAttribute('data-overflow')).toBe('flow');

			toolbar.setOverflowBehavior(ToolbarOverflowBehavior.BurgerMenu);

			expect(toolbar.getOverflowBehavior()).toBe(ToolbarOverflowBehavior.BurgerMenu);
			expect(toolbarEl.getAttribute('data-overflow')).toBe('burger-menu');
		});

		it('is a no-op when setting the same behavior', async () => {
			const pluginA = createFakePlugin('plugin-a', [makeToolbarItem({ id: 'a1' })]);
			const toolbar = new ToolbarPlugin({
				groups: [['plugin-a']],
				overflow: ToolbarOverflowBehavior.Flow,
			});

			const { container } = await initWithPlugins([pluginA], toolbar);
			const toolbarEl = container.querySelector('.notectl-toolbar') as HTMLElement;

			// Verify it doesn't re-render
			const buttonsBefore = toolbarEl.querySelectorAll('button.notectl-toolbar-btn');
			toolbar.setOverflowBehavior(ToolbarOverflowBehavior.Flow);
			const buttonsAfter = toolbarEl.querySelectorAll('button.notectl-toolbar-btn');

			expect(buttonsBefore.length).toBe(buttonsAfter.length);
			expect(toolbarEl.getAttribute('data-overflow')).toBe('flow');
		});

		it('preserves toolbar items when switching overflow behavior', async () => {
			const pluginA = createFakePlugin('plugin-a', [
				makeToolbarItem({ id: 'a1' }),
				makeToolbarItem({ id: 'a2' }),
			]);
			const toolbar = new ToolbarPlugin({
				groups: [['plugin-a']],
				overflow: ToolbarOverflowBehavior.BurgerMenu,
			});

			const { container } = await initWithPlugins([pluginA], toolbar);
			const toolbarEl = container.querySelector('.notectl-toolbar') as HTMLElement;

			const buttonsBefore = toolbarEl.querySelectorAll('button.notectl-toolbar-btn');
			expect(buttonsBefore).toHaveLength(2);

			toolbar.setOverflowBehavior(ToolbarOverflowBehavior.Flow);

			const buttonsAfter = toolbarEl.querySelectorAll('button.notectl-toolbar-btn');
			expect(buttonsAfter).toHaveLength(2);
			expect(buttonsAfter[0]?.getAttribute('data-toolbar-item')).toBe('a1');
			expect(buttonsAfter[1]?.getAttribute('data-toolbar-item')).toBe('a2');
		});
	});

	describe('combobox buttons', () => {
		function makeComboboxItem(overrides?: Partial<ToolbarItemCombobox>): ToolbarItemCombobox {
			return {
				id: 'combo-test',
				group: 'format',
				label: 'Combo',
				command: 'cmd-combo',
				popupType: 'combobox',
				getLabel: () => 'Default Label',
				renderPopup: vi.fn(),
				...overrides,
			};
		}

		it('renders combobox button with label and arrow spans', async () => {
			const comboItem: ToolbarItemCombobox = makeComboboxItem();
			const pluginA = createFakePlugin('plugin-a', [comboItem]);
			const toolbar = new ToolbarPlugin({ groups: [['plugin-a']] });

			const { container } = await initWithPlugins([pluginA], toolbar);
			const toolbarEl = container.querySelector('.notectl-toolbar') as HTMLElement;
			const btn = toolbarEl.querySelector('[data-toolbar-item="combo-test"]') as HTMLButtonElement;

			expect(btn).not.toBeNull();

			const labelSpan = btn.querySelector('.notectl-toolbar-combobox__label');
			expect(labelSpan).not.toBeNull();
			expect(labelSpan?.textContent).toBe('Default Label');

			const arrowSpan = btn.querySelector('.notectl-toolbar-combobox__arrow');
			expect(arrowSpan).not.toBeNull();
			expect(arrowSpan?.textContent).toBe('\u25BE');
		});

		it('combobox button has role="combobox" and aria-haspopup="listbox"', async () => {
			const comboItem: ToolbarItemCombobox = makeComboboxItem();
			const pluginA = createFakePlugin('plugin-a', [comboItem]);
			const toolbar = new ToolbarPlugin({ groups: [['plugin-a']] });

			const { container } = await initWithPlugins([pluginA], toolbar);
			const toolbarEl = container.querySelector('.notectl-toolbar') as HTMLElement;
			const btn = toolbarEl.querySelector('[data-toolbar-item="combo-test"]') as HTMLButtonElement;

			expect(btn.getAttribute('role')).toBe('combobox');
			expect(btn.getAttribute('aria-haspopup')).toBe('listbox');
		});

		it('arrow span has aria-hidden="true"', async () => {
			const comboItem: ToolbarItemCombobox = makeComboboxItem();
			const pluginA = createFakePlugin('plugin-a', [comboItem]);
			const toolbar = new ToolbarPlugin({ groups: [['plugin-a']] });

			const { container } = await initWithPlugins([pluginA], toolbar);
			const toolbarEl = container.querySelector('.notectl-toolbar') as HTMLElement;
			const arrowSpan = toolbarEl.querySelector('.notectl-toolbar-combobox__arrow');

			expect(arrowSpan?.getAttribute('aria-hidden')).toBe('true');
		});

		it('updateButtonStates updates combobox label on state change', async () => {
			let currentLabel = 'Initial';
			const comboItem: ToolbarItemCombobox = makeComboboxItem({
				getLabel: () => currentLabel,
			});
			const pluginA = createFakePlugin('plugin-a', [comboItem]);
			const toolbar = new ToolbarPlugin({ groups: [['plugin-a']] });

			const { container } = await initWithPlugins([pluginA], toolbar);
			const toolbarEl = container.querySelector('.notectl-toolbar') as HTMLElement;

			const labelSpan = toolbarEl.querySelector('.notectl-toolbar-combobox__label');
			expect(labelSpan?.textContent).toBe('Initial');

			// Change the label and simulate state change
			currentLabel = 'Updated';
			const state = makeState();
			const tr = state.transaction('input').insertText('b1', 0, 'x').build();
			toolbar.onStateChange(state, state.apply(tr), tr);

			expect(labelSpan?.textContent).toBe('Updated');
		});
	});
});
