/**
 * Regression test for issue #152 — "Inserting a block object on an empty line
 * leaves a stray empty paragraph above it".
 *
 * Each test inserts a block object (table, horizontal rule, image, display
 * formula) into a document that is a single empty paragraph and asserts that the
 * blank line is consumed: the object becomes the first child and is NOT preceded
 * by an empty paragraph. The leading `children[0]` assertion is the one that
 * encodes the bug; `toHaveLength(2)` pins the expected `[object, paragraph]`.
 *
 * The fix is the shared `insertBlockObjectOnOwnLine` primitive in
 * `commands/BlockInsertion.ts`, which all four insert paths now route through.
 *
 * The final test guards the subtle invariant behind that primitive: the
 * "blank line" test is inline-aware, so a paragraph holding only an atomic inline
 * node (e.g. an inline formula) is NOT consumed — collapsing the check back to
 * `getBlockText() === ''` would silently delete that formula.
 */

import { describe, expect, it } from 'vitest';
import { createInlineNode, getBlockLength, getInlineChildren } from '../model/Document.js';
import { inlineType } from '../model/TypeBrands.js';
import { pluginHarness, stateBuilder } from '../test/TestUtils.js';
import { buildInsertDisplayMathTr } from './formula/FormulaCommands.js';
import { DISPLAY_MATH_TYPE, INLINE_MATH_TYPE } from './formula/FormulaTypes.js';
import { HorizontalRulePlugin } from './horizontal-rule/HorizontalRulePlugin.js';
import { ImagePlugin } from './image/ImagePlugin.js';
import { TablePlugin } from './table/TablePlugin.js';

describe('issue #152 — inserting a block object on an empty line', () => {
	it('insertTable consumes the empty paragraph (no blank line above the table)', async () => {
		const state = stateBuilder()
			.paragraph('', 'b1')
			.cursor('b1', 0)
			.schema(['paragraph', 'table', 'table_row', 'table_cell'], ['bold'])
			.build();
		const h = await pluginHarness(new TablePlugin(), state);

		h.executeCommand('insertTable');

		const children = h.getState().doc.children;
		expect(children[0]?.type).toBe('table');
		expect(children).toHaveLength(2);
		expect(children[1]?.type).toBe('paragraph');
	});

	it('insertHorizontalRule consumes the empty paragraph (no blank line above the rule)', async () => {
		const state = stateBuilder()
			.paragraph('', 'b1')
			.cursor('b1', 0)
			.schema(['paragraph', 'horizontal_rule'], ['bold'])
			.build();
		const h = await pluginHarness(new HorizontalRulePlugin(), state);

		h.executeCommand('insertHorizontalRule');

		const children = h.getState().doc.children;
		expect(children[0]?.type).toBe('horizontal_rule');
		expect(children).toHaveLength(2);
		expect(children[1]?.type).toBe('paragraph');
	});

	it('insertImage consumes the empty paragraph (no blank line above the image)', async () => {
		const state = stateBuilder()
			.paragraph('', 'b1')
			.cursor('b1', 0)
			.schema(['paragraph', 'image'], ['bold'])
			.build();
		const h = await pluginHarness(new ImagePlugin(), state);

		h.executeCommand('insertImage');

		const children = h.getState().doc.children;
		expect(children[0]?.type).toBe('image');
		expect(children).toHaveLength(2);
		expect(children[1]?.type).toBe('paragraph');
	});

	it('display formula insert consumes the empty paragraph (no blank line above the formula)', async () => {
		const state = stateBuilder()
			.paragraph('', 'b1')
			.cursor('b1', 0)
			.schema(['paragraph', DISPLAY_MATH_TYPE], ['bold'])
			.build();

		const tr = buildInsertDisplayMathTr(state, {
			mathml: '<math><mn>1</mn></math>',
			latex: '1',
			alt: 'one',
			fontSize: '',
		});
		expect(tr).not.toBeNull();
		if (!tr) return;

		const children = state.apply(tr).doc.children;
		expect(children[0]?.type).toBe(DISPLAY_MATH_TYPE);
		expect(children).toHaveLength(2);
		expect(children[1]?.type).toBe('paragraph');
	});

	it('does NOT consume a paragraph that holds only an inline node (no content loss)', () => {
		// A paragraph whose only child is an inline formula has an empty getBlockText
		// but is NOT a blank line — consuming it would silently delete the formula.
		// The emptiness test must be inline-aware (atoms have width 1), so this anchor
		// is preserved and the display formula is placed after it.
		const state = stateBuilder()
			.blockWithInlines(
				'paragraph',
				[
					createInlineNode(inlineType(INLINE_MATH_TYPE), {
						mathml: '<math><mi>x</mi></math>',
						latex: 'x',
						alt: 'x',
						fontSize: '',
					}),
				],
				'b1',
			)
			.cursor('b1', 1)
			.schema(['paragraph', DISPLAY_MATH_TYPE], ['bold'])
			.build();

		const tr = buildInsertDisplayMathTr(state, {
			mathml: '<math><mn>1</mn></math>',
			latex: '1',
			alt: 'one',
			fontSize: '',
		});
		expect(tr).not.toBeNull();
		if (!tr) return;

		const children = state.apply(tr).doc.children;
		expect(children).toHaveLength(3);
		const anchor = children[0];
		expect(anchor?.type).toBe('paragraph');
		if (!anchor) return;
		expect(getInlineChildren(anchor)).toHaveLength(1);
		expect(getBlockLength(anchor)).toBe(1);
		expect(children[1]?.type).toBe(DISPLAY_MATH_TYPE);
	});
});
