/**
 * Regression test for issue #163 — "Typing right after inserting an image or
 * display formula adds an extra empty paragraph".
 *
 * A void block at the document root always owns a trailing empty paragraph as
 * its escape line (#152/#158). While that void is node-selected, the text-input
 * path (`insertTextCommand`) and the Enter path (`splitBlockCommand`) used to
 * append a *second* paragraph instead of reusing the existing trailing one,
 * leaving the first typed character in a fresh paragraph and the original escape
 * line orphaned and empty below it: `[image, paragraph, paragraph]` instead of
 * `[image, paragraph]`.
 *
 * The node selection is reachable both by inserting a void (the editor selects
 * it) and by clicking it, so the same defect is hit by insert-then-type,
 * click-then-type, and Enter-while-selected. The fix reuses the existing trailing
 * empty paragraph; it falls back to creating one only when there is none (e.g. a
 * non-empty sibling, or the void is the last block). Exercised here at the
 * command level plus through a real image insert.
 */

import { describe, expect, it } from 'vitest';
import { insertTextCommand, splitBlockCommand } from '../commands/Commands.js';
import { getBlockText } from '../model/Document.js';
import type { NodeSpec } from '../model/NodeSpec.js';
import { isCollapsed } from '../model/Selection.js';
import { type StateBuilder, pluginHarness, stateBuilder } from '../test/TestUtils.js';
import { DISPLAY_MATH_TYPE } from './formula/FormulaTypes.js';
import { ImagePlugin } from './image/ImagePlugin.js';

/** Reports the given node types as void, matching the production schema. */
function voidSchema(voidTypes: readonly string[]): (type: string) => NodeSpec | undefined {
	return (type: string): NodeSpec | undefined =>
		voidTypes.includes(type) ? ({ isVoid: true } as unknown as NodeSpec) : undefined;
}

/** Builds `[void, trailingParagraph]` with a node selection on the void block. */
function selectedVoidWithTrailing(voidType: string, trailingText = ''): StateBuilder {
	return stateBuilder()
		.voidBlock(voidType, 'v1')
		.paragraph(trailingText, 'p1')
		.nodeSelection('v1')
		.schema(['paragraph', voidType], [], voidSchema([voidType]));
}

describe('issue #163 — typing after a node-selected void must not add a stray paragraph', () => {
	it('typing reuses the trailing paragraph after a node-selected image', () => {
		const state = selectedVoidWithTrailing('image').build();

		const next = state.apply(insertTextCommand(state, 'caption', 'input'));

		expect(next.doc.children.map((c) => c.type)).toEqual(['image', 'paragraph']);
		const trailing = next.doc.children[1];
		expect(trailing && getBlockText(trailing)).toBe('caption');
	});

	it('typing reuses the trailing paragraph after a node-selected display formula', () => {
		const state = selectedVoidWithTrailing(DISPLAY_MATH_TYPE).build();

		const next = state.apply(insertTextCommand(state, 'y', 'input'));

		expect(next.doc.children.map((c) => c.type)).toEqual([DISPLAY_MATH_TYPE, 'paragraph']);
		const trailing = next.doc.children[1];
		expect(trailing && getBlockText(trailing)).toBe('y');
	});

	it('leaves a collapsed cursor at the end of the reused paragraph', () => {
		const state = selectedVoidWithTrailing('image').build();

		const next = state.apply(insertTextCommand(state, 'caption', 'input'));

		const trailing = next.doc.children[1];
		expect(isCollapsed(next.selection)).toBe(true);
		if (isCollapsed(next.selection)) {
			expect(next.selection.anchor.blockId).toBe(trailing?.id);
			expect(next.selection.anchor.offset).toBe('caption'.length);
		}
	});

	it('pressing Enter reuses the trailing paragraph after a node-selected void', () => {
		const state = selectedVoidWithTrailing('image').build();

		const tr = splitBlockCommand(state);
		expect(tr).not.toBeNull();
		const next = state.apply(tr as NonNullable<typeof tr>);

		expect(next.doc.children.map((c) => c.type)).toEqual(['image', 'paragraph']);
		const trailing = next.doc.children[1];
		expect(isCollapsed(next.selection)).toBe(true);
		if (isCollapsed(next.selection)) {
			expect(next.selection.anchor.blockId).toBe(trailing?.id);
			expect(next.selection.anchor.offset).toBe(0);
		}
	});

	it('inserting a real image then typing leaves a single trailing paragraph', async () => {
		const initial = stateBuilder()
			.paragraph('', 'b1')
			.cursor('b1', 0)
			.schema(['paragraph', 'image'], [], voidSchema(['image']))
			.build();
		const h = await pluginHarness(new ImagePlugin(), initial);

		h.executeCommand('insertImage');
		h.dispatch(insertTextCommand(h.getState(), 'caption', 'input'));

		expect(h.getState().doc.children.map((c) => c.type)).toEqual(['image', 'paragraph']);
		const trailing = h.getState().doc.children[1];
		expect(trailing && getBlockText(trailing)).toBe('caption');
	});

	// --- Controls: the fallback (create a new paragraph) must be preserved ---

	it('creates a new paragraph when the trailing sibling is not empty', () => {
		const state = selectedVoidWithTrailing('image', 'kept').build();

		const next = state.apply(insertTextCommand(state, 'x', 'input'));

		expect(next.doc.children.map((c) => c.type)).toEqual(['image', 'paragraph', 'paragraph']);
		const inserted = next.doc.children[1];
		const kept = next.doc.children[2];
		expect(inserted && getBlockText(inserted)).toBe('x');
		expect(kept && getBlockText(kept)).toBe('kept');
	});

	it('creates a trailing paragraph when the void is the last block', () => {
		const state = stateBuilder()
			.voidBlock('image', 'v1')
			.nodeSelection('v1')
			.schema(['paragraph', 'image'], [], voidSchema(['image']))
			.build();

		const next = state.apply(insertTextCommand(state, 'x', 'input'));

		expect(next.doc.children.map((c) => c.type)).toEqual(['image', 'paragraph']);
		const trailing = next.doc.children[1];
		expect(trailing && getBlockText(trailing)).toBe('x');
	});
});
