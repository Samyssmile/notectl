/**
 * Regression tests for issue #162: deleting an inline node (math formula or
 * hard break) with Backspace, Delete, or a range selection must be undoable.
 *
 * The defect was that the delete-inversion data (`deletedSegments`) only
 * captured text, so the inverse `insertText` restored nothing for the inline
 * node and the content was lost permanently. The redo path additionally
 * undercounted the re-inserted width (inline nodes are width 1 but contribute
 * nothing to the plain-text length), so redoing a mixed text+inline delete left
 * stray content behind.
 */

import { describe, expect, it } from 'vitest';
import { deleteSelectionCommand } from '../commands/Commands.js';
import { deleteBackward, deleteForward } from '../commands/DeleteCommands.js';
import {
	type BlockNode,
	type InlineNode,
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
	getBlockText,
	getInlineChildren,
	inlineSegment,
	isInlineNode,
	textSegment,
} from '../model/Document.js';
import { createCollapsedSelection, createSelection } from '../model/Selection.js';
import { blockId, inlineType, nodeType } from '../model/TypeBrands.js';
import { EditorState } from './EditorState.js';
import { HistoryManager } from './History.js';
import type { ShiftMap } from './Mapping.js';
import { getStepMap } from './StepHandlers.js';
import type { DeleteTextStep, InsertTextStep } from './Steps.js';
import { invertStep } from './Transaction.js';

const B1 = blockId('b1');

function inlineNodesOf(block: BlockNode): readonly InlineNode[] {
	return getInlineChildren(block).filter((c): c is InlineNode => isInlineNode(c));
}

function firstBlock(state: EditorState): BlockNode {
	const block = state.doc.children[0];
	if (!block) throw new Error('expected a block');
	return block;
}

/** Builds a single-paragraph state from the given inline children. */
function stateOf(
	children: readonly (ReturnType<typeof createTextNode> | InlineNode)[],
): EditorState {
	const block = createBlockNode(nodeType('paragraph'), children, B1);
	return EditorState.create({ doc: createDocument([block]) });
}

describe('inline node deletion is undoable (#162)', () => {
	it('restores an inline formula deleted with Backspace, with its LaTeX source', () => {
		const formula = createInlineNode(inlineType('inline_math'), { latex: 'z^2' });
		const base = stateOf([createTextNode('a'), formula, createTextNode('b')]);
		// Caret right after the formula: a=[0,1) formula=[1,2) b=[2,3).
		const state = base.withSelection(createCollapsedSelection(B1, 2));
		const history = new HistoryManager();

		const tr = deleteBackward(state);
		expect(tr).not.toBeNull();
		if (!tr) return;
		const afterDelete = state.apply(tr);
		history.push(tr);

		expect(getBlockText(firstBlock(afterDelete))).toBe('ab');
		expect(inlineNodesOf(firstBlock(afterDelete))).toHaveLength(0);

		const undone = history.undo(afterDelete)?.state ?? afterDelete;
		const restored = inlineNodesOf(firstBlock(undone));
		expect(restored).toHaveLength(1);
		expect(restored[0]?.inlineType).toBe('inline_math');
		expect(restored[0]?.attrs.latex).toBe('z^2');
		expect(getBlockText(firstBlock(undone))).toBe('ab');
	});

	it('restores an inline formula deleted with forward Delete', () => {
		const formula = createInlineNode(inlineType('inline_math'), { latex: 'x+1' });
		const base = stateOf([createTextNode('a'), formula, createTextNode('b')]);
		// Caret right before the formula (offset 1).
		const state = base.withSelection(createCollapsedSelection(B1, 1));
		const history = new HistoryManager();

		const tr = deleteForward(state);
		expect(tr).not.toBeNull();
		if (!tr) return;
		const afterDelete = state.apply(tr);
		history.push(tr);
		expect(inlineNodesOf(firstBlock(afterDelete))).toHaveLength(0);

		const undone = history.undo(afterDelete)?.state ?? afterDelete;
		const restored = inlineNodesOf(firstBlock(undone));
		expect(restored).toHaveLength(1);
		expect(restored[0]?.attrs.latex).toBe('x+1');
	});

	it('restores a hard break deleted with Backspace', () => {
		const hardBreak = createInlineNode(inlineType('hard_break'));
		const base = stateOf([createTextNode('one'), hardBreak, createTextNode('two')]);
		// Caret at the start of "two" (offset 4): one=[0,3) br=[3,4) two=[4,7).
		const state = base.withSelection(createCollapsedSelection(B1, 4));
		const history = new HistoryManager();

		const tr = deleteBackward(state);
		expect(tr).not.toBeNull();
		if (!tr) return;
		const afterDelete = state.apply(tr);
		history.push(tr);
		expect(inlineNodesOf(firstBlock(afterDelete))).toHaveLength(0);
		expect(getBlockText(firstBlock(afterDelete))).toBe('onetwo');

		const undone = history.undo(afterDelete)?.state ?? afterDelete;
		const restored = inlineNodesOf(firstBlock(undone));
		expect(restored).toHaveLength(1);
		expect(restored[0]?.inlineType).toBe('hard_break');
		expect(getBlockText(firstBlock(undone))).toBe('onetwo');
	});

	it('round-trips a mixed text+inline range delete through undo and redo', () => {
		const formula = createInlineNode(inlineType('inline_math'), { latex: 'a^2' });
		const base = stateOf([createTextNode('a'), formula, createTextNode('b')]);
		// Select the formula plus the trailing "b": range [1, 3).
		const state = base.withSelection(
			createSelection({ blockId: B1, offset: 1 }, { blockId: B1, offset: 3 }),
		);
		const history = new HistoryManager();

		const tr = deleteSelectionCommand(state);
		expect(tr).not.toBeNull();
		if (!tr) return;
		const afterDelete = state.apply(tr);
		history.push(tr);
		expect(getBlockText(firstBlock(afterDelete))).toBe('a');
		expect(inlineNodesOf(firstBlock(afterDelete))).toHaveLength(0);

		// Undo restores both the inline node and the trailing text.
		const undone = history.undo(afterDelete)?.state ?? afterDelete;
		expect(getBlockText(firstBlock(undone))).toBe('ab');
		expect(inlineNodesOf(firstBlock(undone))).toHaveLength(1);

		// Redo must remove the whole range again, not just the inline node.
		const redone = history.redo(undone)?.state ?? undone;
		expect(getBlockText(firstBlock(redone))).toBe('a');
		expect(inlineNodesOf(firstBlock(redone))).toHaveLength(0);
	});
});

describe('insertText width accounts for inline segments (#162)', () => {
	// "b" is 1 char of plain text, but the formula adds a second unit of width.
	const formula = createInlineNode(inlineType('inline_math'), { latex: 'q' });
	const step: InsertTextStep = {
		type: 'insertText',
		blockId: B1,
		offset: 1,
		text: 'b',
		marks: [],
		segments: [inlineSegment(formula), textSegment('b')],
	};
	const doc = createDocument([createBlockNode(nodeType('paragraph'), [createTextNode('a')], B1)]);

	it('forward position map reports the segment width, not the text length', () => {
		const map = getStepMap(doc, step) as ShiftMap;
		expect(map.type).toBe('shift');
		expect(map.newLen).toBe(2);
	});

	it('inverse delete spans the full segment width', () => {
		const inverse = invertStep(step) as DeleteTextStep;
		expect(inverse.type).toBe('deleteText');
		expect(inverse.from).toBe(1);
		expect(inverse.to).toBe(3);
	});
});
