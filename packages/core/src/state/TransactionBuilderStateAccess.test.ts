/**
 * Fix Verification: TransactionBuilder with state access.
 *
 * TransactionBuilder now accepts an optional Document at construction.
 * When provided (via state.transaction()), convenience methods like
 * deleteTextAt() and mergeBlocksAt() auto-derive undo metadata,
 * eliminating error-prone boilerplate.
 *
 * @see Transaction.ts (TransactionBuilder)
 */

import { describe, expect, it } from 'vitest';
import {
	type Mark,
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockText,
	getTextChildren,
} from '../model/Document.js';
import { createCollapsedSelection } from '../model/Selection.js';
import { EditorState } from './EditorState.js';
import { HistoryManager } from './History.js';
import { TransactionBuilder } from './Transaction.js';

// --- Helpers ---

function createStateWithText(text: string, marks: readonly Mark[] = []) {
	const doc = createDocument([createBlockNode('paragraph', [createTextNode(text, marks)], 'b1')]);
	return EditorState.create({
		doc,
		selection: createCollapsedSelection('b1', text.length),
	});
}

function createTwoBlockState(textA: string, textB: string) {
	const doc = createDocument([
		createBlockNode('paragraph', [createTextNode(textA)], 'b1'),
		createBlockNode('paragraph', [createTextNode(textB)], 'b2'),
	]);
	return EditorState.create({
		doc,
		selection: createCollapsedSelection('b2', 0),
	});
}

// --- Tests ---

describe('Fix Verification: TransactionBuilder with state access', () => {
	describe('deleteTextAt auto-derives undo metadata', () => {
		it('deleteTextAt correctly derives deletedText and undoes cleanly', () => {
			let state = createStateWithText('hello world');
			const history = new HistoryManager();

			const tr = state
				.transaction('input')
				.deleteTextAt('b1', 5, 11)
				.setSelection(createCollapsedSelection('b1', 5))
				.build();

			state = state.apply(tr);
			history.push(tr);
			expect(getBlockText(state.doc.children[0])).toBe('hello');

			// Undo restores correctly — auto-derived deletedText is correct
			state = history.undo(state)?.state ?? state;
			expect(getBlockText(state.doc.children[0])).toBe('hello world');
		});

		it('deleteTextAt preserves marks on undo', () => {
			const boldMark: Mark = { type: 'bold' };
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('bold', [boldMark]), createTextNode(' plain')],
					'b1',
				),
			]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 4),
			});
			const history = new HistoryManager();

			const tr = state
				.transaction('input')
				.deleteTextAt('b1', 0, 4)
				.setSelection(createCollapsedSelection('b1', 0))
				.build();

			state = state.apply(tr);
			history.push(tr);
			expect(getBlockText(state.doc.children[0])).toBe(' plain');

			// Undo restores with correct marks — auto-derived from document
			state = history.undo(state)?.state ?? state;
			const children = getTextChildren(state.doc.children[0]);
			expect(children).toHaveLength(2);
			expect(children[0]?.text).toBe('bold');
			expect(children[0]?.marks).toEqual([boldMark]);
			expect(children[1]?.text).toBe(' plain');
		});
	});

	describe('mergeBlocksAt auto-derives targetLengthBefore', () => {
		it('mergeBlocksAt correctly derives targetLengthBefore and undoes cleanly', () => {
			let state = createTwoBlockState('hello', ' world');
			const history = new HistoryManager();

			const tr = state
				.transaction('input')
				.mergeBlocksAt('b1', 'b2')
				.setSelection(createCollapsedSelection('b1', 5))
				.build();

			state = state.apply(tr);
			history.push(tr);
			expect(state.doc.children).toHaveLength(1);
			expect(getBlockText(state.doc.children[0])).toBe('hello world');

			// Undo splits at the correct position
			state = history.undo(state)?.state ?? state;
			expect(state.doc.children).toHaveLength(2);
			expect(getBlockText(state.doc.children[0])).toBe('hello');
			expect(getBlockText(state.doc.children[1])).toBe(' world');
		});
	});

	describe('manual methods still work (backward compat)', () => {
		it('manual deleteText with correct data still works', () => {
			let state = createStateWithText('hello world');
			const history = new HistoryManager();

			const tr = new TransactionBuilder(state.selection, null, 'input')
				.deleteText('b1', 5, 11, ' world', [])
				.setSelection(createCollapsedSelection('b1', 5))
				.build();

			state = state.apply(tr);
			history.push(tr);
			expect(getBlockText(state.doc.children[0])).toBe('hello');

			state = history.undo(state)?.state ?? state;
			expect(getBlockText(state.doc.children[0])).toBe('hello world');
		});

		it('manual mergeBlocks with correct data still works', () => {
			let state = createTwoBlockState('hello', ' world');
			const history = new HistoryManager();

			const tr = new TransactionBuilder(state.selection, null, 'input')
				.mergeBlocks('b1', 'b2', 5)
				.setSelection(createCollapsedSelection('b1', 5))
				.build();

			state = state.apply(tr);
			history.push(tr);
			expect(state.doc.children).toHaveLength(1);

			state = history.undo(state)?.state ?? state;
			expect(state.doc.children).toHaveLength(2);
			expect(getBlockText(state.doc.children[0])).toBe('hello');
		});
	});

	describe('deleteTextAt without document throws', () => {
		it('throws when called on a builder without document', () => {
			const sel = createCollapsedSelection('b1', 5);
			const builder = new TransactionBuilder(sel, null, 'input');

			expect(() => builder.deleteTextAt('b1', 0, 5)).toThrow('deleteTextAt requires a document');
		});
	});

	describe('mergeBlocksAt without document throws', () => {
		it('throws when called on a builder without document', () => {
			const sel = createCollapsedSelection('b1', 0);
			const builder = new TransactionBuilder(sel, null, 'input');

			expect(() => builder.mergeBlocksAt('b1', 'b2')).toThrow('mergeBlocksAt requires a document');
		});
	});

	describe('working document tracks multi-step mutations', () => {
		it('deleteTextAt works after a preceding insertText step', () => {
			let state = createStateWithText('hello');
			const history = new HistoryManager();

			// Insert " world" then delete "hello" — workingDoc must track both
			const tr = state
				.transaction('input')
				.insertText('b1', 5, ' world', [])
				.deleteTextAt('b1', 0, 5)
				.setSelection(createCollapsedSelection('b1', 0))
				.build();

			state = state.apply(tr);
			history.push(tr);
			expect(getBlockText(state.doc.children[0])).toBe(' world');

			state = history.undo(state)?.state ?? state;
			expect(getBlockText(state.doc.children[0])).toBe('hello');
		});
	});
});
