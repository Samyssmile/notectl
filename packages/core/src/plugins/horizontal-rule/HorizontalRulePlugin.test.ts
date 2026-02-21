import { describe, expect, it } from 'vitest';
import { isNodeSelection } from '../../model/Selection.js';
import {
	expectCommandDispatches,
	expectCommandRegistered,
	expectKeyBinding,
	expectNodeSpec,
	expectToolbarActive,
	expectToolbarItem,
} from '../../test/PluginTestUtils.js';
import { assertDefined, pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { HorizontalRulePlugin } from './HorizontalRulePlugin.js';

// --- Helpers ---

function makeState(
	blocks?: { type: string; text: string; id: string }[],
	cursorBlockId?: string,
	cursorOffset?: number,
) {
	const builder = stateBuilder();
	for (const b of blocks ?? [{ type: 'paragraph', text: '', id: 'b1' }]) {
		builder.block(b.type, b.text, b.id);
	}
	const bid: string = cursorBlockId ?? blocks?.[0]?.id ?? 'b1';
	builder.cursor(bid, cursorOffset ?? 0);
	builder.schema(['paragraph', 'horizontal_rule'], ['bold', 'italic', 'underline']);
	return builder.build();
}

// --- Tests ---

describe('HorizontalRulePlugin', () => {
	describe('registration', () => {
		it('registers with correct id, name, and priority', () => {
			const plugin = new HorizontalRulePlugin();
			expect(plugin.id).toBe('horizontal-rule');
			expect(plugin.name).toBe('Horizontal Rule');
			expect(plugin.priority).toBe(40);
		});
	});

	describe('NodeSpec', () => {
		it('registers horizontal_rule NodeSpec', async () => {
			const h = await pluginHarness(new HorizontalRulePlugin());
			expectNodeSpec(h, 'horizontal_rule');
		});

		it('NodeSpec creates <hr> element with data-block-id', async () => {
			const h = await pluginHarness(new HorizontalRulePlugin());
			const spec = h.getNodeSpec('horizontal_rule');
			assertDefined(spec);
			const { createBlockNode } = await import('../../model/Document.js');
			const el = spec.toDOM(createBlockNode('horizontal_rule', [], 'hr1'));
			expect(el?.tagName).toBe('HR');
			expect(el?.getAttribute('data-block-id')).toBe('hr1');
		});

		it('NodeSpec is marked as void', async () => {
			const h = await pluginHarness(new HorizontalRulePlugin());
			const spec = h.getNodeSpec('horizontal_rule');
			assertDefined(spec);
			expect(spec.isVoid).toBe(true);
		});

		it('toHTML returns <hr>', async () => {
			const h = await pluginHarness(new HorizontalRulePlugin());
			const spec = h.getNodeSpec('horizontal_rule');
			assertDefined(spec);
			expect(spec.toHTML?.()).toBe('<hr>');
		});

		it('parseHTML matches hr tag', async () => {
			const h = await pluginHarness(new HorizontalRulePlugin());
			const spec = h.getNodeSpec('horizontal_rule');
			assertDefined(spec);
			expect(spec.parseHTML).toEqual([{ tag: 'hr' }]);
		});
	});

	describe('commands', () => {
		it('registers insertHorizontalRule command', async () => {
			const h = await pluginHarness(new HorizontalRulePlugin());
			expectCommandRegistered(h, 'insertHorizontalRule');
		});

		it('insertHorizontalRule dispatches a transaction', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new HorizontalRulePlugin(), state);
			expectCommandDispatches(h, 'insertHorizontalRule');
		});

		it('inserts HR block + paragraph after current block', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new HorizontalRulePlugin(), state);

			h.executeCommand('insertHorizontalRule');

			const newState = h.getState();
			expect(newState.doc.children).toHaveLength(3);
			expect(newState.doc.children[0]?.type).toBe('paragraph');
			expect(newState.doc.children[1]?.type).toBe('horizontal_rule');
			expect(newState.doc.children[2]?.type).toBe('paragraph');
		});

		it('returns false on NodeSelection', async () => {
			const builder = stateBuilder();
			builder.block('horizontal_rule', '', 'hr1');
			builder.block('paragraph', '', 'b2');
			builder.schema(['paragraph', 'horizontal_rule'], []);
			const state = builder.nodeSelection('hr1').build();

			const h = await pluginHarness(new HorizontalRulePlugin(), state);
			const result: boolean = h.executeCommand('insertHorizontalRule');
			expect(result).toBe(false);
		});
	});

	describe('keymap', () => {
		it('registers Mod-Shift-H keymap', async () => {
			const h = await pluginHarness(new HorizontalRulePlugin());
			expectKeyBinding(h, 'Mod-Shift-H');
		});
	});

	describe('input rules', () => {
		it('registers one input rule', async () => {
			const h = await pluginHarness(new HorizontalRulePlugin());
			expect(h.getInputRules().length).toBe(1);
		});

		it('pattern matches "--- "', async () => {
			const h = await pluginHarness(new HorizontalRulePlugin());
			const rule = h.getInputRules()[0];
			expect(rule?.pattern.test('--- ')).toBe(true);
		});

		it('pattern matches "---- "', async () => {
			const h = await pluginHarness(new HorizontalRulePlugin());
			const rule = h.getInputRules()[0];
			expect(rule?.pattern.test('---- ')).toBe(true);
		});

		it('pattern does not match "-- "', async () => {
			const h = await pluginHarness(new HorizontalRulePlugin());
			const rule = h.getInputRules()[0];
			expect(rule?.pattern.test('-- ')).toBe(false);
		});

		it('handler converts paragraph to HR', async () => {
			const state = makeState([{ type: 'paragraph', text: '--- ', id: 'b1' }], 'b1', 4);
			const h = await pluginHarness(new HorizontalRulePlugin(), state);
			const rule = h.getInputRules()[0];

			const match = '--- '.match(rule?.pattern ?? /$/);
			const tr = rule?.handler(state, match, 0, 4);
			expect(tr).not.toBeNull();

			const newState = state.apply(tr);
			expect(newState.doc.children[0]?.type).toBe('horizontal_rule');
			expect(newState.doc.children[1]?.type).toBe('paragraph');
		});

		it('handler only applies on paragraph blocks', async () => {
			const state = makeState([{ type: 'horizontal_rule', text: '', id: 'b1' }], 'b1', 0);
			const h = await pluginHarness(new HorizontalRulePlugin(), state);
			const rule = h.getInputRules()[0];
			const match = '--- '.match(rule?.pattern ?? /$/);
			const tr = rule?.handler(state, match, 0, 4);
			expect(tr).toBeNull();
		});

		it('handler returns null on NodeSelection', async () => {
			const builder = stateBuilder();
			builder.block('horizontal_rule', '', 'hr1');
			builder.block('paragraph', '', 'b2');
			builder.schema(['paragraph', 'horizontal_rule'], []);
			const state = builder.nodeSelection('hr1').build();

			const h = await pluginHarness(new HorizontalRulePlugin(), state);
			const rule = h.getInputRules()[0];
			const match = '--- '.match(rule?.pattern ?? /$/);
			const tr = rule?.handler(state, match, 0, 4);
			expect(tr).toBeNull();
		});

		it('handler returns null on range selection', async () => {
			const state = stateBuilder()
				.paragraph('--- ', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 4 })
				.schema(['paragraph', 'horizontal_rule'], [])
				.build();

			const h = await pluginHarness(new HorizontalRulePlugin(), state);
			const rule = h.getInputRules()[0];
			const match = '--- '.match(rule?.pattern ?? /$/);
			const tr = rule?.handler(state, match, 0, 4);
			expect(tr).toBeNull();
		});
	});

	describe('toolbar item', () => {
		it('registers a horizontal-rule toolbar item', async () => {
			const h = await pluginHarness(new HorizontalRulePlugin());
			expectToolbarItem(h, 'horizontal-rule', {
				group: 'block',
				label: 'Horizontal Rule',
				command: 'insertHorizontalRule',
			});
		});

		it('isActive always returns false', async () => {
			const state = makeState([{ type: 'paragraph', text: 'text', id: 'b1' }]);
			const h = await pluginHarness(new HorizontalRulePlugin(), state);
			expectToolbarActive(h, 'horizontal-rule', false);
		});

		it('respects separatorAfter config', async () => {
			const h = await pluginHarness(new HorizontalRulePlugin({ separatorAfter: true }));
			expectToolbarItem(h, 'horizontal-rule', { separatorAfter: true });
		});
	});
});
