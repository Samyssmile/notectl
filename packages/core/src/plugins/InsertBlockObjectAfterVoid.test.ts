/**
 * Regression test for issue #158 — "Inserting a block object right after an
 * image or display formula either drops the insert or leaves a blank line".
 *
 * After inserting a void object (image, display formula) the selection rests on
 * that block as a node selection. Inserting the next block object right away
 * exposed two defects sharing one root cause (a node selection on a void block):
 *
 * - Part A: `insertHorizontalRule` and `insertTable` bailed on any non-text
 *   selection, so the action was silently discarded. The document stayed
 *   `[image, paragraph]` instead of `[image, table, paragraph]`.
 * - Part B: a void object already owns a trailing empty paragraph as its escape
 *   line. `insertBlockObjectOnOwnLine` appended a second one, leaving a stray
 *   blank line: `[image, image, paragraph, paragraph]` instead of
 *   `[image, image, paragraph]`.
 *
 * Each test starts from `[void, emptyParagraph]` with a node selection on the
 * void block, exactly the state the editor leaves after inserting the first
 * object. The schema wires `getNodeSpec` so `isVoidBlock` reports the anchor as
 * void, mirroring how production derives its schema via `schemaFromRegistry`.
 */

import { describe, expect, it } from 'vitest';
import type { NodeSpec } from '../model/NodeSpec.js';
import { type StateBuilder, pluginHarness, stateBuilder } from '../test/TestUtils.js';
import { DISPLAY_MATH_TYPE } from './formula/FormulaTypes.js';
import { HorizontalRulePlugin } from './horizontal-rule/HorizontalRulePlugin.js';
import { ImagePlugin } from './image/ImagePlugin.js';
import { TablePlugin } from './table/TablePlugin.js';

/** Reports the given node types as void, matching the production schema. */
function voidSchema(voidTypes: readonly string[]): (type: string) => NodeSpec | undefined {
	return (type: string): NodeSpec | undefined =>
		voidTypes.includes(type) ? ({ isVoid: true } as unknown as NodeSpec) : undefined;
}

/** Builds `[void, emptyParagraph]` with a node selection on the void block. */
function builderWithSelectedVoid(voidType: string, nodeTypes: string[]): StateBuilder {
	return stateBuilder()
		.voidBlock(voidType, 'v1')
		.paragraph('', 'p1')
		.nodeSelection('v1')
		.schema(nodeTypes, ['bold'], voidSchema([voidType]));
}

describe('issue #158 — inserting a block object after a node-selected void block', () => {
	// --- Part A: the insert must not be silently dropped ---

	it('insertTable lands after a node-selected image', async () => {
		const state = builderWithSelectedVoid('image', [
			'paragraph',
			'image',
			'table',
			'table_row',
			'table_cell',
		]).build();
		const h = await pluginHarness(new TablePlugin(), state);

		h.executeCommand('insertTable');

		expect(h.getState().doc.children.map((c) => c.type)).toEqual(['image', 'table', 'paragraph']);
	});

	it('insertHorizontalRule lands after a node-selected image', async () => {
		const state = builderWithSelectedVoid('image', [
			'paragraph',
			'image',
			'horizontal_rule',
		]).build();
		const h = await pluginHarness(new HorizontalRulePlugin(), state);

		h.executeCommand('insertHorizontalRule');

		expect(h.getState().doc.children.map((c) => c.type)).toEqual([
			'image',
			'horizontal_rule',
			'paragraph',
		]);
	});

	it('insertTable lands after a node-selected display formula', async () => {
		const state = builderWithSelectedVoid(DISPLAY_MATH_TYPE, [
			'paragraph',
			DISPLAY_MATH_TYPE,
			'table',
			'table_row',
			'table_cell',
		]).build();
		const h = await pluginHarness(new TablePlugin(), state);

		h.executeCommand('insertTable');

		expect(h.getState().doc.children.map((c) => c.type)).toEqual([
			DISPLAY_MATH_TYPE,
			'table',
			'paragraph',
		]);
	});

	// --- Part B: no stray blank line stacks up ---

	it('inserting a second image reuses the trailing paragraph (no blank line)', async () => {
		const state = builderWithSelectedVoid('image', ['paragraph', 'image']).build();
		const h = await pluginHarness(new ImagePlugin(), state);

		h.executeCommand('insertImage');

		expect(h.getState().doc.children.map((c) => c.type)).toEqual(['image', 'image', 'paragraph']);
	});

	it('inserting a horizontal rule after an image reuses the trailing paragraph', async () => {
		const state = builderWithSelectedVoid('image', [
			'paragraph',
			'image',
			'horizontal_rule',
		]).build();
		const h = await pluginHarness(new HorizontalRulePlugin(), state);

		h.executeCommand('insertHorizontalRule');

		const children = h.getState().doc.children;
		expect(children).toHaveLength(3);
		expect(children[2]?.type).toBe('paragraph');
	});
});
