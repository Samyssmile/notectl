import { describe, expect, it, vi } from 'vitest';
import {
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockText,
} from '../../model/Document.js';
import { createCollapsedSelection } from '../../model/Selection.js';
import { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { Plugin } from '../Plugin.js';
import { PluginManager } from '../PluginManager.js';
import { ListPlugin } from './ListPlugin.js';

// --- Helpers ---

const SCHEMA = {
	nodeTypes: ['paragraph', 'list_item'],
	markTypes: ['bold', 'italic', 'underline'],
};

function makeState(
	blocks: {
		type: string;
		text: string;
		id: string;
		attrs?: Record<string, string | number | boolean>;
	}[],
	cursorBlockId?: string,
	cursorOffset?: number,
): EditorState {
	const blockNodes = blocks.map((b) =>
		createBlockNode(b.type, [createTextNode(b.text)], b.id, b.attrs),
	);
	const doc = createDocument(blockNodes);
	return EditorState.create({
		doc,
		selection: createCollapsedSelection(
			cursorBlockId ?? blockNodes[0]?.id ?? '',
			cursorOffset ?? 0,
		),
		schema: SCHEMA,
	});
}

async function initPlugin(
	plugin: Plugin,
	state?: EditorState,
): Promise<{ pm: PluginManager; dispatch: ReturnType<typeof vi.fn>; getState: () => EditorState }> {
	const pm = new PluginManager();
	pm.register(plugin);
	let currentState = state ?? makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
	const dispatch = vi.fn((tr: Transaction) => {
		currentState = currentState.apply(tr);
	});

	await pm.init({
		getState: () => currentState,
		dispatch,
		getContainer: () => document.createElement('div'),
		getPluginContainer: () => document.createElement('div'),
	});

	return { pm, dispatch, getState: () => currentState };
}

// --- Tests ---

describe('ListPlugin', () => {
	describe('registration', () => {
		it('registers with correct id and name', () => {
			const plugin = new ListPlugin();
			expect(plugin.id).toBe('list');
			expect(plugin.name).toBe('List');
			expect(plugin.priority).toBe(35);
		});
	});

	describe('NodeSpec', () => {
		it('registers list_item NodeSpec', async () => {
			const { pm } = await initPlugin(new ListPlugin());
			expect(pm.schemaRegistry.getNodeSpec('list_item')).toBeDefined();
		});

		it('creates DOM with correct attributes for bullet list', async () => {
			const { pm } = await initPlugin(new ListPlugin());
			const spec = pm.schemaRegistry.getNodeSpec('list_item');
			const node = createBlockNode('list_item', [createTextNode('item')], 'test', {
				listType: 'bullet',
				indent: 0,
			});
			const el = spec?.toDOM(node);

			expect(el?.getAttribute('data-block-id')).toBe('test');
			expect(el?.getAttribute('data-list-type')).toBe('bullet');
			expect(el?.getAttribute('data-indent')).toBe('0');
			expect(el?.className).toContain('notectl-list-item--bullet');
		});

		it('creates DOM with indent margin', async () => {
			const { pm } = await initPlugin(new ListPlugin());
			const spec = pm.schemaRegistry.getNodeSpec('list_item');
			const node = createBlockNode('list_item', [createTextNode('item')], 'test', {
				listType: 'bullet',
				indent: 2,
			});
			const el = spec?.toDOM(node);

			expect(el?.style.marginLeft).toBe('48px');
		});

		it('does not set inline margin for indent 0', async () => {
			const { pm } = await initPlugin(new ListPlugin());
			const spec = pm.schemaRegistry.getNodeSpec('list_item');
			const node = createBlockNode('list_item', [createTextNode('item')], 'test', {
				listType: 'bullet',
				indent: 0,
			});
			const el = spec?.toDOM(node);

			expect(el?.style.marginLeft).toBe('');
		});

		it('creates DOM with checked attribute for checklist', async () => {
			const { pm } = await initPlugin(new ListPlugin());
			const spec = pm.schemaRegistry.getNodeSpec('list_item');
			const node = createBlockNode('list_item', [createTextNode('task')], 'test', {
				listType: 'checklist',
				indent: 0,
				checked: true,
			});
			const el = spec?.toDOM(node);

			expect(el?.getAttribute('data-checked')).toBe('true');
		});
	});

	describe('toggle commands', () => {
		it('toggleList:bullet converts paragraph to bullet list', async () => {
			const state = makeState([{ type: 'paragraph', text: 'item', id: 'b1' }]);
			const { pm, getState } = await initPlugin(new ListPlugin(), state);

			pm.executeCommand('toggleList:bullet');

			const block = getState().doc.children[0];
			expect(block?.type).toBe('list_item');
			expect(block?.attrs?.listType).toBe('bullet');
		});

		it('toggleList:ordered converts paragraph to ordered list', async () => {
			const state = makeState([{ type: 'paragraph', text: 'item', id: 'b1' }]);
			const { pm, getState } = await initPlugin(new ListPlugin(), state);

			pm.executeCommand('toggleList:ordered');
			expect(getState().doc.children[0]?.attrs?.listType).toBe('ordered');
		});

		it('toggleList:checklist converts paragraph to checklist', async () => {
			const state = makeState([{ type: 'paragraph', text: 'task', id: 'b1' }]);
			const { pm, getState } = await initPlugin(new ListPlugin(), state);

			pm.executeCommand('toggleList:checklist');

			const block = getState().doc.children[0];
			expect(block?.attrs?.listType).toBe('checklist');
			expect(block?.attrs?.checked).toBe(false);
		});

		it('toggling same list type reverts to paragraph', async () => {
			const state = makeState([
				{
					type: 'list_item',
					text: 'item',
					id: 'b1',
					attrs: { listType: 'bullet', indent: 0 },
				},
			]);
			const { pm, getState } = await initPlugin(new ListPlugin(), state);

			pm.executeCommand('toggleList:bullet');
			expect(getState().doc.children[0]?.type).toBe('paragraph');
		});

		it('toggling different list type changes type', async () => {
			const state = makeState([
				{
					type: 'list_item',
					text: 'item',
					id: 'b1',
					attrs: { listType: 'bullet', indent: 1 },
				},
			]);
			const { pm, getState } = await initPlugin(new ListPlugin(), state);

			pm.executeCommand('toggleList:ordered');
			expect(getState().doc.children[0]?.attrs?.listType).toBe('ordered');
			expect(getState().doc.children[0]?.attrs?.indent).toBe(1);
		});

		it('preserves text when toggling', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello World', id: 'b1' }]);
			const { pm, getState } = await initPlugin(new ListPlugin(), state);

			pm.executeCommand('toggleList:bullet');
			expect(getBlockText(getState().doc.children[0])).toBe('Hello World');
		});
	});

	describe('indent/outdent', () => {
		it('indentListItem increases indent', async () => {
			const state = makeState([
				{
					type: 'list_item',
					text: 'item',
					id: 'b1',
					attrs: { listType: 'bullet', indent: 0 },
				},
			]);
			const { pm, getState } = await initPlugin(new ListPlugin(), state);

			pm.executeCommand('indentListItem');
			expect(getState().doc.children[0]?.attrs?.indent).toBe(1);
		});

		it('outdentListItem decreases indent', async () => {
			const state = makeState([
				{
					type: 'list_item',
					text: 'item',
					id: 'b1',
					attrs: { listType: 'bullet', indent: 2 },
				},
			]);
			const { pm, getState } = await initPlugin(new ListPlugin(), state);

			pm.executeCommand('outdentListItem');
			expect(getState().doc.children[0]?.attrs?.indent).toBe(1);
		});

		it('indent does not exceed maxIndent', async () => {
			const state = makeState([
				{
					type: 'list_item',
					text: 'item',
					id: 'b1',
					attrs: { listType: 'bullet', indent: 4 },
				},
			]);
			const { pm, dispatch } = await initPlugin(new ListPlugin(), state);

			const result = pm.executeCommand('indentListItem');
			expect(result).toBe(false);
		});

		it('outdent does not go below 0', async () => {
			const state = makeState([
				{
					type: 'list_item',
					text: 'item',
					id: 'b1',
					attrs: { listType: 'bullet', indent: 0 },
				},
			]);
			const { pm } = await initPlugin(new ListPlugin(), state);

			const result = pm.executeCommand('outdentListItem');
			expect(result).toBe(false);
		});

		it('indent only works on list_item blocks', async () => {
			const state = makeState([{ type: 'paragraph', text: 'text', id: 'b1' }]);
			const { pm } = await initPlugin(new ListPlugin(), state);

			expect(pm.executeCommand('indentListItem')).toBe(false);
		});

		it('custom maxIndent is respected', async () => {
			const state = makeState([
				{
					type: 'list_item',
					text: 'item',
					id: 'b1',
					attrs: { listType: 'bullet', indent: 2 },
				},
			]);
			const { pm } = await initPlugin(new ListPlugin({ maxIndent: 2 }), state);

			expect(pm.executeCommand('indentListItem')).toBe(false);
		});
	});

	describe('checklist toggle', () => {
		it('toggleChecklistItem toggles checked state', async () => {
			const state = makeState([
				{
					type: 'list_item',
					text: 'task',
					id: 'b1',
					attrs: { listType: 'checklist', indent: 0, checked: false },
				},
			]);
			const { pm, getState } = await initPlugin(new ListPlugin(), state);

			pm.executeCommand('toggleChecklistItem');
			expect(getState().doc.children[0]?.attrs?.checked).toBe(true);
		});

		it('toggleChecklistItem does not work on non-checklist items', async () => {
			const state = makeState([
				{
					type: 'list_item',
					text: 'item',
					id: 'b1',
					attrs: { listType: 'bullet', indent: 0 },
				},
			]);
			const { pm } = await initPlugin(new ListPlugin(), state);

			expect(pm.executeCommand('toggleChecklistItem')).toBe(false);
		});
	});

	describe('keymap', () => {
		it('registers Tab and Shift-Tab keymaps', async () => {
			const { pm } = await initPlugin(new ListPlugin());
			const keymaps = pm.schemaRegistry.getKeymaps();
			expect(keymaps.length).toBeGreaterThan(0);

			const keymap = keymaps[0];
			expect(keymap?.Tab).toBeDefined();
			expect(keymap?.['Shift-Tab']).toBeDefined();
		});
	});

	describe('input rules', () => {
		it('registers input rules for enabled list types', async () => {
			const { pm } = await initPlugin(new ListPlugin());
			const rules = pm.schemaRegistry.getInputRules();
			expect(rules.length).toBe(3);
		});

		it('"- " triggers bullet list', async () => {
			const { pm } = await initPlugin(new ListPlugin());
			const rules = pm.schemaRegistry.getInputRules();
			const bulletRule = rules.find((r) => r.pattern.test('- '));
			expect(bulletRule).toBeDefined();
		});

		it('"* " triggers bullet list', async () => {
			const { pm } = await initPlugin(new ListPlugin());
			const rules = pm.schemaRegistry.getInputRules();
			const bulletRule = rules.find((r) => r.pattern.test('* '));
			expect(bulletRule).toBeDefined();
		});

		it('"1. " triggers ordered list', async () => {
			const { pm } = await initPlugin(new ListPlugin());
			const rules = pm.schemaRegistry.getInputRules();
			const orderedRule = rules.find((r) => r.pattern.test('1. '));
			expect(orderedRule).toBeDefined();
		});

		it('"[ ] " triggers checklist', async () => {
			const { pm } = await initPlugin(new ListPlugin());
			const rules = pm.schemaRegistry.getInputRules();
			const checkRule = rules.find((r) => r.pattern.test('[ ] '));
			expect(checkRule).toBeDefined();
		});

		it('input rule converts paragraph to list item', async () => {
			const state = makeState([{ type: 'paragraph', text: '- ', id: 'b1' }], 'b1', 2);
			const { pm } = await initPlugin(new ListPlugin(), state);

			const rules = pm.schemaRegistry.getInputRules();
			const bulletRule = rules.find((r) => r.pattern.test('- '));
			const match = '- '.match(bulletRule?.pattern ?? /$/);
			const tr = bulletRule?.handler(state, match, 0, 2);

			expect(tr).not.toBeNull();
			const newState = state.apply(tr);
			expect(newState.doc.children[0]?.type).toBe('list_item');
			expect(newState.doc.children[0]?.attrs?.listType).toBe('bullet');
		});
	});

	describe('toolbar items', () => {
		it('registers toolbar items for each enabled type', async () => {
			const { pm } = await initPlugin(new ListPlugin());
			expect(pm.schemaRegistry.getToolbarItem('list-bullet')).toBeDefined();
			expect(pm.schemaRegistry.getToolbarItem('list-ordered')).toBeDefined();
			expect(pm.schemaRegistry.getToolbarItem('list-checklist')).toBeDefined();
		});

		it('restricts toolbar items to configured types', async () => {
			const { pm } = await initPlugin(new ListPlugin({ types: ['bullet'] }));
			expect(pm.schemaRegistry.getToolbarItem('list-bullet')).toBeDefined();
			expect(pm.schemaRegistry.getToolbarItem('list-ordered')).toBeUndefined();
			expect(pm.schemaRegistry.getToolbarItem('list-checklist')).toBeUndefined();
		});

		it('toolbar item isActive works correctly', async () => {
			const state = makeState([
				{
					type: 'list_item',
					text: 'item',
					id: 'b1',
					attrs: { listType: 'bullet', indent: 0 },
				},
			]);
			const { pm } = await initPlugin(new ListPlugin(), state);

			const bulletItem = pm.schemaRegistry.getToolbarItem('list-bullet');
			const orderedItem = pm.schemaRegistry.getToolbarItem('list-ordered');

			expect(bulletItem?.isActive?.(state)).toBe(true);
			expect(orderedItem?.isActive?.(state)).toBe(false);
		});

		it('toolbar items have correct group', async () => {
			const { pm } = await initPlugin(new ListPlugin());
			const item = pm.schemaRegistry.getToolbarItem('list-bullet');
			expect(item?.group).toBe('block');
		});
	});

	describe('config', () => {
		it('restricts commands to configured types', async () => {
			const { pm } = await initPlugin(new ListPlugin({ types: ['bullet'] }));
			expect(pm.executeCommand('toggleList:bullet')).toBe(true);
			expect(pm.executeCommand('toggleList:ordered')).toBe(false);
			expect(pm.executeCommand('toggleList:checklist')).toBe(false);
		});

		it('does not register checklist command when checklist disabled', async () => {
			const { pm } = await initPlugin(new ListPlugin({ types: ['bullet', 'ordered'] }));
			expect(pm.executeCommand('toggleChecklistItem')).toBe(false);
		});
	});
});
