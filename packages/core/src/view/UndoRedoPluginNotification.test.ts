/**
 * Fix Verification: Undo/Redo delivers actual Transaction steps to plugin callbacks.
 *
 * EditorView.undo() and EditorView.redo() now pass the real transaction
 * (with all inverted/re-applied steps) to stateChangeCallbacks, so plugins
 * can inspect what actually changed.
 *
 * @see History.ts (HistoryResult)
 * @see EditorView.ts (undo/redo)
 */

import { describe, expect, it } from 'vitest';
import {
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockText,
} from '../model/Document.js';
import { createCollapsedSelection } from '../model/Selection.js';
import { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { TransactionBuilder } from '../state/Transaction.js';
import type { StateChangeCallback } from './EditorView.js';
import { EditorView } from './EditorView.js';

// --- Helpers ---

function createTestView() {
	const container = document.createElement('div');
	const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
	const state = EditorState.create({
		doc,
		selection: createCollapsedSelection('b1', 0),
	});

	const receivedTransactions: Transaction[] = [];
	const onStateChange: StateChangeCallback = (_old, _new, tr) => {
		receivedTransactions.push(tr);
	};

	const view = new EditorView(container, {
		state,
		onStateChange,
	});

	return { container, view, receivedTransactions };
}

function makeInsertTransaction(blockId: string, offset: number, text: string): Transaction {
	return new TransactionBuilder(createCollapsedSelection(blockId, offset), null, 'input')
		.insertText(blockId, offset, text, [])
		.setSelection(createCollapsedSelection(blockId, offset + text.length))
		.build();
}

// --- Tests ---

describe('Fix Verification: Undo/Redo plugin notification', () => {
	describe('normal dispatch', () => {
		it('passes the actual transaction steps to stateChangeCallbacks', () => {
			const { view, receivedTransactions } = createTestView();
			const tr = makeInsertTransaction('b1', 0, 'hello');

			view.dispatch(tr);

			expect(receivedTransactions).toHaveLength(1);
			expect(receivedTransactions[0].steps.length).toBeGreaterThan(0);
			expect(receivedTransactions[0].steps[0]?.type).toBe('insertText');

			view.destroy();
		});
	});

	describe('undo notification', () => {
		it('undo passes actual steps to stateChangeCallbacks', () => {
			const { view, receivedTransactions } = createTestView();

			view.dispatch(makeInsertTransaction('b1', 0, 'hello'));
			expect(getBlockText(view.getState().doc.children[0])).toBe('hello');

			receivedTransactions.length = 0;
			view.undo();

			expect(getBlockText(view.getState().doc.children[0])).toBe('');

			expect(receivedTransactions).toHaveLength(1);
			expect(receivedTransactions[0].steps.length).toBeGreaterThan(0);
			// Undo of insertText is a deleteText step
			expect(receivedTransactions[0].steps[0]?.type).toBe('deleteText');

			view.destroy();
		});

		it('undo transaction metadata says "history" and carries step details', () => {
			const { view, receivedTransactions } = createTestView();

			view.dispatch(makeInsertTransaction('b1', 0, 'test'));
			receivedTransactions.length = 0;
			view.undo();

			const undoTr = receivedTransactions[0];
			expect(undoTr.metadata.origin).toBe('history');
			expect(undoTr.steps.length).toBeGreaterThan(0);

			view.destroy();
		});

		it('plugins can detect which blocks were affected by undo', () => {
			const { view, receivedTransactions } = createTestView();

			view.dispatch(makeInsertTransaction('b1', 0, 'hello'));
			receivedTransactions.length = 0;
			view.undo();

			const undoTr = receivedTransactions[0];

			const affectedBlockIds = undoTr.steps
				.filter((s) => 'blockId' in s)
				.map((s) => (s as { blockId: string }).blockId);

			expect(affectedBlockIds).toContain('b1');

			view.destroy();
		});
	});

	describe('redo notification', () => {
		it('redo passes actual steps to stateChangeCallbacks', () => {
			const { view, receivedTransactions } = createTestView();

			view.dispatch(makeInsertTransaction('b1', 0, 'hello'));
			view.undo();
			expect(getBlockText(view.getState().doc.children[0])).toBe('');

			receivedTransactions.length = 0;
			view.redo();

			expect(getBlockText(view.getState().doc.children[0])).toBe('hello');

			expect(receivedTransactions).toHaveLength(1);
			expect(receivedTransactions[0].steps.length).toBeGreaterThan(0);
			// Redo re-applies the original insertText step
			expect(receivedTransactions[0].steps[0]?.type).toBe('insertText');

			view.destroy();
		});

		it('redo transaction metadata says "history" and carries step details', () => {
			const { view, receivedTransactions } = createTestView();

			view.dispatch(makeInsertTransaction('b1', 0, 'data'));
			view.undo();
			receivedTransactions.length = 0;
			view.redo();

			const redoTr = receivedTransactions[0];
			expect(redoTr.metadata.origin).toBe('history');
			expect(redoTr.steps.length).toBeGreaterThan(0);

			view.destroy();
		});
	});

	describe('selection tracking during undo/redo', () => {
		it('undo transaction carries correct selection information', () => {
			const { view, receivedTransactions } = createTestView();

			view.dispatch(makeInsertTransaction('b1', 0, 'hello'));
			const stateAfterInsert = view.getState();

			receivedTransactions.length = 0;
			view.undo();

			const undoTr = receivedTransactions[0];
			expect(undoTr.selectionBefore).toEqual(stateAfterInsert.selection);
			expect(undoTr.selectionAfter).toEqual(view.getState().selection);

			view.destroy();
		});
	});
});
