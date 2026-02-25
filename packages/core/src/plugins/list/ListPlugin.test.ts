import { describe, expect, it } from 'vitest';
import { createBlockNode, createTextNode, getBlockText } from '../../model/Document.js';
import {
	expectKeyBinding,
	expectToolbarActive,
	expectToolbarItem,
} from '../../test/PluginTestUtils.js';
import { pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { ListPlugin } from './ListPlugin.js';

// --- Helpers ---

function makeState(
	blocks: {
		type: string;
		text: string;
		id: string;
		attrs?: Record<string, string | number | boolean>;
	}[],
	cursorBlockId?: string,
	cursorOffset?: number,
) {
	const builder = stateBuilder();
	for (const b of blocks) {
		builder.block(b.type, b.text, b.id, { attrs: b.attrs });
	}
	builder.cursor(cursorBlockId ?? blocks[0]?.id ?? '', cursorOffset ?? 0);
	builder.schema(['paragraph', 'list_item'], ['bold', 'italic', 'underline']);
	return builder.build();
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
			const h = await pluginHarness(new ListPlugin());
			expect(h.getNodeSpec('list_item')).toBeDefined();
		});

		it('creates DOM with correct attributes for bullet list', async () => {
			const h = await pluginHarness(new ListPlugin());
			const spec = h.getNodeSpec('list_item');
			const node = createBlockNode('list_item', [createTextNode('item')], 'test', {
				listType: 'bullet',
				indent: 0,
			});
			const el = spec?.toDOM(node);

			expect(el?.tagName).toBe('LI');
			expect(el?.getAttribute('role')).toBe('listitem');
			expect(el?.getAttribute('data-block-id')).toBe('test');
			expect(el?.getAttribute('data-list-type')).toBe('bullet');
			expect(el?.getAttribute('data-indent')).toBe('0');
			expect(el?.className).toContain('notectl-list-item--bullet');
		});

		it('creates DOM with indent margin', async () => {
			const h = await pluginHarness(new ListPlugin());
			const spec = h.getNodeSpec('list_item');
			const node = createBlockNode('list_item', [createTextNode('item')], 'test', {
				listType: 'bullet',
				indent: 2,
			});
			const el = spec?.toDOM(node);

			expect(el?.style.marginLeft).toBe('48px');
		});

		it('does not set inline margin for indent 0', async () => {
			const h = await pluginHarness(new ListPlugin());
			const spec = h.getNodeSpec('list_item');
			const node = createBlockNode('list_item', [createTextNode('item')], 'test', {
				listType: 'bullet',
				indent: 0,
			});
			const el = spec?.toDOM(node);

			expect(el?.style.marginLeft).toBe('');
		});

		it('creates DOM with checked attribute for checklist', async () => {
			const h = await pluginHarness(new ListPlugin());
			const spec = h.getNodeSpec('list_item');
			const node = createBlockNode('list_item', [createTextNode('task')], 'test', {
				listType: 'checklist',
				indent: 0,
				checked: true,
			});
			const el = spec?.toDOM(node);

			expect(el?.getAttribute('data-checked')).toBe('true');
			expect(el?.getAttribute('aria-checked')).toBe('true');
		});

		it('wrapper returns ul for bullet list', async () => {
			const h = await pluginHarness(new ListPlugin());
			const spec = h.getNodeSpec('list_item');
			const node = createBlockNode('list_item', [createTextNode('item')], 'test', {
				listType: 'bullet',
				indent: 0,
			});
			const wrapper = spec?.wrapper?.(node);

			expect(wrapper?.tag).toBe('ul');
			expect(wrapper?.key).toBe('list-bullet');
			expect(wrapper?.attrs?.role).toBe('list');
		});

		it('wrapper returns ol for ordered list', async () => {
			const h = await pluginHarness(new ListPlugin());
			const spec = h.getNodeSpec('list_item');
			const node = createBlockNode('list_item', [createTextNode('item')], 'test', {
				listType: 'ordered',
				indent: 0,
			});
			const wrapper = spec?.wrapper?.(node);

			expect(wrapper?.tag).toBe('ol');
			expect(wrapper?.key).toBe('list-ordered');
		});

		it('wrapper returns ul for checklist', async () => {
			const h = await pluginHarness(new ListPlugin());
			const spec = h.getNodeSpec('list_item');
			const node = createBlockNode('list_item', [createTextNode('task')], 'test', {
				listType: 'checklist',
				indent: 0,
				checked: false,
			});
			const wrapper = spec?.wrapper?.(node);

			expect(wrapper?.tag).toBe('ul');
			expect(wrapper?.key).toBe('list-checklist');
		});
	});

	describe('toggle commands', () => {
		it('toggleList:bullet converts paragraph to bullet list', async () => {
			const state = makeState([{ type: 'paragraph', text: 'item', id: 'b1' }]);
			const h = await pluginHarness(new ListPlugin(), state);

			h.executeCommand('toggleList:bullet');

			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('list_item');
			expect(block?.attrs?.listType).toBe('bullet');
		});

		it('toggleList:ordered converts paragraph to ordered list', async () => {
			const state = makeState([{ type: 'paragraph', text: 'item', id: 'b1' }]);
			const h = await pluginHarness(new ListPlugin(), state);

			h.executeCommand('toggleList:ordered');
			expect(h.getState().doc.children[0]?.attrs?.listType).toBe('ordered');
		});

		it('toggleList:checklist converts paragraph to checklist', async () => {
			const state = makeState([{ type: 'paragraph', text: 'task', id: 'b1' }]);
			const h = await pluginHarness(new ListPlugin(), state);

			h.executeCommand('toggleList:checklist');

			const block = h.getState().doc.children[0];
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
			const h = await pluginHarness(new ListPlugin(), state);

			h.executeCommand('toggleList:bullet');
			expect(h.getState().doc.children[0]?.type).toBe('paragraph');
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
			const h = await pluginHarness(new ListPlugin(), state);

			h.executeCommand('toggleList:ordered');
			expect(h.getState().doc.children[0]?.attrs?.listType).toBe('ordered');
			expect(h.getState().doc.children[0]?.attrs?.indent).toBe(1);
		});

		it('preserves text when toggling', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello World', id: 'b1' }]);
			const h = await pluginHarness(new ListPlugin(), state);

			h.executeCommand('toggleList:bullet');
			expect(getBlockText(h.getState().doc.children[0])).toBe('Hello World');
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
			const h = await pluginHarness(new ListPlugin(), state);

			h.executeCommand('indentListItem');
			expect(h.getState().doc.children[0]?.attrs?.indent).toBe(1);
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
			const h = await pluginHarness(new ListPlugin(), state);

			h.executeCommand('outdentListItem');
			expect(h.getState().doc.children[0]?.attrs?.indent).toBe(1);
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
			const h = await pluginHarness(new ListPlugin(), state);

			const result = h.executeCommand('indentListItem');
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
			const h = await pluginHarness(new ListPlugin(), state);

			const result = h.executeCommand('outdentListItem');
			expect(result).toBe(false);
		});

		it('indent only works on list_item blocks', async () => {
			const state = makeState([{ type: 'paragraph', text: 'text', id: 'b1' }]);
			const h = await pluginHarness(new ListPlugin(), state);

			expect(h.executeCommand('indentListItem')).toBe(false);
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
			const h = await pluginHarness(new ListPlugin({ maxIndent: 2 }), state);

			expect(h.executeCommand('indentListItem')).toBe(false);
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
			const h = await pluginHarness(new ListPlugin(), state);

			h.executeCommand('toggleChecklistItem');
			expect(h.getState().doc.children[0]?.attrs?.checked).toBe(true);
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
			const h = await pluginHarness(new ListPlugin(), state);

			expect(h.executeCommand('toggleChecklistItem')).toBe(false);
		});

		it('toggleChecklistItem is blocked in readonly mode', async () => {
			const state = makeState([
				{
					type: 'list_item',
					text: 'task',
					id: 'b1',
					attrs: { listType: 'checklist', indent: 0, checked: false },
				},
			]);
			const h = await pluginHarness(new ListPlugin(), state);
			h.pm.setReadOnly(true);

			expect(h.executeCommand('toggleChecklistItem')).toBe(false);
			expect(h.getState().doc.children[0]?.attrs?.checked).toBe(false);
		});

		it('toggleChecklistItem works in readonly with interactiveCheckboxes', async () => {
			const state = makeState([
				{
					type: 'list_item',
					text: 'task',
					id: 'b1',
					attrs: { listType: 'checklist', indent: 0, checked: false },
				},
			]);
			const h = await pluginHarness(new ListPlugin({ interactiveCheckboxes: true }), state);
			h.pm.setReadOnly(true);

			h.executeCommand('toggleChecklistItem');
			expect(h.getState().doc.children[0]?.attrs?.checked).toBe(true);
		});

		it('toggleChecklistItem works in non-readonly mode (regression)', async () => {
			const state = makeState([
				{
					type: 'list_item',
					text: 'task',
					id: 'b1',
					attrs: { listType: 'checklist', indent: 0, checked: false },
				},
			]);
			const h = await pluginHarness(new ListPlugin(), state);

			h.executeCommand('toggleChecklistItem');
			expect(h.getState().doc.children[0]?.attrs?.checked).toBe(true);
		});
	});

	describe('keymap', () => {
		it('registers Tab and Shift-Tab keymaps', async () => {
			const h = await pluginHarness(new ListPlugin());
			expectKeyBinding(h, 'Tab');
			expectKeyBinding(h, 'Shift-Tab');
		});
	});

	describe('input rules', () => {
		it('registers input rules for enabled list types', async () => {
			const h = await pluginHarness(new ListPlugin());
			const rules = h.getInputRules();
			expect(rules.length).toBe(3);
		});

		it('"- " triggers bullet list', async () => {
			const h = await pluginHarness(new ListPlugin());
			const rules = h.getInputRules();
			const bulletRule = rules.find((r) => r.pattern.test('- '));
			expect(bulletRule).toBeDefined();
		});

		it('"* " triggers bullet list', async () => {
			const h = await pluginHarness(new ListPlugin());
			const rules = h.getInputRules();
			const bulletRule = rules.find((r) => r.pattern.test('* '));
			expect(bulletRule).toBeDefined();
		});

		it('"1. " triggers ordered list', async () => {
			const h = await pluginHarness(new ListPlugin());
			const rules = h.getInputRules();
			const orderedRule = rules.find((r) => r.pattern.test('1. '));
			expect(orderedRule).toBeDefined();
		});

		it('"[ ] " triggers checklist', async () => {
			const h = await pluginHarness(new ListPlugin());
			const rules = h.getInputRules();
			const checkRule = rules.find((r) => r.pattern.test('[ ] '));
			expect(checkRule).toBeDefined();
		});

		it('input rule converts paragraph to list item', async () => {
			const state = makeState([{ type: 'paragraph', text: '- ', id: 'b1' }], 'b1', 2);
			const h = await pluginHarness(new ListPlugin(), state);

			const rules = h.getInputRules();
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
			const h = await pluginHarness(new ListPlugin());
			expect(h.getToolbarItem('list-bullet')).toBeDefined();
			expect(h.getToolbarItem('list-ordered')).toBeDefined();
			expect(h.getToolbarItem('list-checklist')).toBeDefined();
		});

		it('restricts toolbar items to configured types', async () => {
			const h = await pluginHarness(new ListPlugin({ types: ['bullet'] }));
			expect(h.getToolbarItem('list-bullet')).toBeDefined();
			expect(h.getToolbarItem('list-ordered')).toBeUndefined();
			expect(h.getToolbarItem('list-checklist')).toBeUndefined();
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
			const h = await pluginHarness(new ListPlugin(), state);
			expectToolbarActive(h, 'list-bullet', true);
			expectToolbarActive(h, 'list-ordered', false);
		});

		it('toolbar items have correct group', async () => {
			const h = await pluginHarness(new ListPlugin());
			expectToolbarItem(h, 'list-bullet', { group: 'block' });
		});
	});

	describe('config', () => {
		it('restricts commands to configured types', async () => {
			const h = await pluginHarness(new ListPlugin({ types: ['bullet'] }));
			expect(h.executeCommand('toggleList:bullet')).toBe(true);
			expect(h.executeCommand('toggleList:ordered')).toBe(false);
			expect(h.executeCommand('toggleList:checklist')).toBe(false);
		});

		it('does not register checklist command when checklist disabled', async () => {
			const h = await pluginHarness(new ListPlugin({ types: ['bullet', 'ordered'] }));
			expect(h.executeCommand('toggleChecklistItem')).toBe(false);
		});
	});
});
