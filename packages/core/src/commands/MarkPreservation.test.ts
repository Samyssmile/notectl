/**
 * Tests to verify the 3 P0 findings from REVIEW.md
 */

import { describe, expect, it } from 'vitest';
import {
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockText,
	getTextChildren,
} from '../model/Document.js';
import { createCollapsedSelection, createSelection } from '../model/Selection.js';
import { EditorState } from '../state/EditorState.js';
import { HistoryManager } from '../state/History.js';
import { invertTransaction } from '../state/Transaction.js';
import {
	deleteSelectionCommand,
	deleteSoftLineBackward,
	deleteWordBackward,
	insertTextCommand,
} from './Commands.js';

// ============================================================================
// P0 2.1: DeleteTextStep loses Mark information on multi-node ranges
// ============================================================================

describe('P0 2.1: DeleteTextStep mark information loss on undo', () => {
	it('undo of same-block selection delete should restore per-node marks', () => {
		// Create: "bold" (bold) + "normal" (no marks) in one block
		const doc = createDocument([
			createBlockNode(
				'paragraph',
				[createTextNode('bold', [{ type: 'bold' }]), createTextNode('normal', [])],
				'b1',
			),
		]);
		const state = EditorState.create({
			doc,
			selection: createSelection(
				{ blockId: 'b1', offset: 0 },
				{ blockId: 'b1', offset: 10 }, // select "boldnormal"
			),
		});

		// Delete the selection
		const deleteTr = deleteSelectionCommand(state);
		expect(deleteTr).not.toBeNull();

		const afterDelete = state.apply(deleteTr);
		expect(getBlockText(afterDelete.doc.children[0])).toBe('');

		// Undo: invert and apply the transaction
		const undoTr = invertTransaction(deleteTr);
		const afterUndo = afterDelete.apply(undoTr);

		const restoredBlock = afterUndo.doc.children[0];
		expect(getBlockText(restoredBlock)).toBe('boldnormal');

		// BUG CHECK: After undo, "bold" should have bold marks and "normal" should not.
		// If the bug exists, ALL text will have bold marks (or no marks).
		const children = getTextChildren(restoredBlock);

		// The restored text should have 2 separate TextNodes with different marks
		// If bug exists: single TextNode "boldnormal" with [bold] marks
		const hasBoldPartCorrect = children.some(
			(c) => c.text.includes('bold') && c.marks.some((m) => m.type === 'bold'),
		);
		const hasNormalPartCorrect = children.some(
			(c) => c.text.includes('normal') && c.marks.length === 0,
		);

		expect(hasBoldPartCorrect).toBe(true);
		// This assertion will FAIL if the bug exists — "normal" gets bold marks too
		expect(hasNormalPartCorrect).toBe(true);
	});

	it('undo of word deletion across mark boundary should restore correct marks', () => {
		// "hel" (bold) + "lo " (no marks) in one block, cursor at offset 6 (after "hello ")
		// Actually let's do: "hello" (bold) + " world" (no marks), cursor at end
		// deleteWordBackward from offset 11 should delete "world" (offsets 6-11)
		// But that doesn't cross mark boundary. Let's pick better:
		//
		// "he" (bold) + "llo" (no marks), cursor at offset 5
		// deleteWordBackward from offset 5 deletes "hello" (entire word, offsets 0-5)
		// This crosses the mark boundary!
		const doc = createDocument([
			createBlockNode(
				'paragraph',
				[createTextNode('he', [{ type: 'bold' }]), createTextNode('llo', [])],
				'b1',
			),
		]);
		const state = EditorState.create({
			doc,
			selection: createCollapsedSelection('b1', 5),
		});

		const deleteTr = deleteWordBackward(state);
		expect(deleteTr).not.toBeNull();

		const afterDelete = state.apply(deleteTr);
		expect(getBlockText(afterDelete.doc.children[0])).toBe('');

		// Undo
		const undoTr = invertTransaction(deleteTr);
		const afterUndo = afterDelete.apply(undoTr);
		const restoredBlock = afterUndo.doc.children[0];

		expect(getBlockText(restoredBlock)).toBe('hello');

		// BUG CHECK: "he" should be bold, "llo" should not
		// deleteWordBackward captures marksAtPos at wordStart (offset 0), which is bold.
		// So the entire "hello" gets restored with bold marks.
		const textChildren = getTextChildren(restoredBlock);
		const allBold = textChildren.every(
			(c) => c.text.length === 0 || c.marks.some((m) => m.type === 'bold'),
		);
		const hasUnmarkedPart = textChildren.some(
			(c) => c.text.includes('llo') && c.marks.length === 0,
		);

		// If bug exists: allBold is true and hasUnmarkedPart is false
		expect(hasUnmarkedPart).toBe(true);
	});

	it('undo of line deletion across multiple mark boundaries should restore all marks', () => {
		// "AB" (bold+italic) + "CD" (italic) + "EF" (no marks)
		// deleteSoftLineBackward from offset 6 deletes everything
		const doc = createDocument([
			createBlockNode(
				'paragraph',
				[
					createTextNode('AB', [{ type: 'bold' }, { type: 'italic' }]),
					createTextNode('CD', [{ type: 'italic' }]),
					createTextNode('EF', []),
				],
				'b1',
			),
		]);
		const state = EditorState.create({
			doc,
			selection: createCollapsedSelection('b1', 6),
		});

		const deleteTr = deleteSoftLineBackward(state);
		const afterDelete = state.apply(deleteTr);
		expect(getBlockText(afterDelete.doc.children[0])).toBe('');

		// Undo
		const undoTr = invertTransaction(deleteTr);
		const afterUndo = afterDelete.apply(undoTr);
		const restoredBlock = afterUndo.doc.children[0];

		expect(getBlockText(restoredBlock)).toBe('ABCDEF');

		// BUG CHECK: Should have 3 segments with different marks
		// deleteSoftLineBackward uses getBlockMarksAtOffset(block, 0) = [bold, italic]
		// So the ENTIRE "ABCDEF" gets restored with [bold, italic] marks
		const hasCorrectSegments = getTextChildren(restoredBlock).some(
			(c) => c.text === 'EF' && c.marks.length === 0,
		);

		// This will FAIL if the bug exists
		expect(hasCorrectSegments).toBe(true);
	});
});

// ============================================================================
// P0 2.2: insertTextCommand — wrong offset on cross-block selection
// ============================================================================

describe('P0 2.2: insertTextCommand cross-block selection offset bug', () => {
	it('forward cross-block selection: text should be inserted at from-position', () => {
		// Block b1: "Hello World" (anchor at offset 8 = after "Hello Wo")
		// Block b2: "Goodbye"     (head at offset 3 = after "Goo")
		// Expected: delete "rld" from b1, delete "Goo" from b2, merge, insert at offset 8
		// Result should be: "Hello Wo[X]dbye"
		const doc = createDocument([
			createBlockNode('paragraph', [createTextNode('Hello World')], 'b1'),
			createBlockNode('paragraph', [createTextNode('Goodbye')], 'b2'),
		]);
		const state = EditorState.create({
			doc,
			selection: createSelection(
				{ blockId: 'b1', offset: 8 }, // anchor in first block
				{ blockId: 'b2', offset: 3 }, // head in second block
			),
		});

		const tr = insertTextCommand(state, 'X');
		const newState = state.apply(tr);

		// After deletion + merge + insert, first block should be "Hello WoXdbye"
		const resultText = getBlockText(newState.doc.children[0]);
		expect(resultText).toBe('Hello WoXdbye');
	});

	it('backward cross-block selection: text should be inserted at from-position', () => {
		// Same blocks, but selection is backward:
		// anchor in b2 at offset 3, head in b1 at offset 8
		// "from" is b1:8, "to" is b2:3
		// After delete+merge, should insert at b1:8
		// Result: "Hello WoXdbye"
		const doc = createDocument([
			createBlockNode('paragraph', [createTextNode('Hello World')], 'b1'),
			createBlockNode('paragraph', [createTextNode('Goodbye')], 'b2'),
		]);
		const state = EditorState.create({
			doc,
			selection: createSelection(
				{ blockId: 'b2', offset: 3 }, // anchor in second block (backward)
				{ blockId: 'b1', offset: 8 }, // head in first block
			),
		});

		const tr = insertTextCommand(state, 'X');
		const newState = state.apply(tr);

		// Even with backward selection, result should be the same: "Hello WoXdbye"
		const resultText = getBlockText(newState.doc.children[0]);
		expect(resultText).toBe('Hello WoXdbye');
	});

	it('same-block selection with Math.min works correctly (no bug)', () => {
		// Verify that same-block selections still work fine
		const doc = createDocument([
			createBlockNode('paragraph', [createTextNode('Hello World')], 'b1'),
		]);
		const state = EditorState.create({
			doc,
			selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
		});

		const tr = insertTextCommand(state, 'Hi');
		const newState = state.apply(tr);
		expect(getBlockText(newState.doc.children[0])).toBe('Hi World');
	});
});

// ============================================================================
// P0 2.4: replaceState() destroys History
// ============================================================================

describe('P0 2.4: History survives content replacement', () => {
	it('undo history is preserved after HistoryManager.undo cycle (baseline)', () => {
		// Baseline: verify that undo works normally
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
		const state = EditorState.create({
			doc,
			selection: createCollapsedSelection('b1', 5),
		});

		const history = new HistoryManager();

		// Type some text
		const tr = insertTextCommand(state, ' world');
		const state2 = state.apply(tr);
		history.push(tr);

		expect(history.canUndo()).toBe(true);

		// Undo
		const undoResult = history.undo(state2);
		expect(undoResult).not.toBeNull();
		expect(getBlockText(undoResult?.state.doc.children[0])).toBe('hello');
	});

	it('demonstrates that creating a new EditorView (replaceState pattern) loses history', () => {
		// This test documents the behavior: if you create a new HistoryManager
		// (as replaceState does via new EditorView), previous history is lost.
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
		const state = EditorState.create({
			doc,
			selection: createCollapsedSelection('b1', 5),
		});

		const history1 = new HistoryManager();

		// Type some text
		const tr = insertTextCommand(state, ' world');
		const state2 = state.apply(tr);
		history1.push(tr);

		expect(history1.canUndo()).toBe(true);

		// Simulate replaceState: create new HistoryManager (like new EditorView does)
		const history2 = new HistoryManager();

		// The new history has no entries — all undo capability is lost
		expect(history2.canUndo()).toBe(false);

		// This documents the behavior: setJSON/setHTML resets undo history
		// Whether this is a "bug" or "by design" depends on the intended API semantics.
		// For a "load document" operation it may be acceptable.
		// For incremental content updates it's problematic.
	});
});
