import { describe, expect, it } from 'vitest';
import {
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockText,
} from '../model/Document.js';
import { createCollapsedSelection } from '../model/Selection.js';
import { markType } from '../model/TypeBrands.js';
import { EditorState } from './EditorState.js';
import { HistoryManager } from './History.js';
import { TransactionBuilder } from './Transaction.js';

function makeInsertTr(blockId: string, offset: number, text: string, timestamp: number) {
	const sel = createCollapsedSelection(blockId, offset);
	const builder = new TransactionBuilder(sel, null, 'input');
	builder.insertText(blockId, offset, text, []);
	builder.setSelection(createCollapsedSelection(blockId, offset + text.length));

	const tr = builder.build();
	// Override timestamp for testing
	return {
		...tr,
		metadata: { ...tr.metadata, timestamp },
	};
}

describe('HistoryManager', () => {
	it('can undo a single transaction', () => {
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
		let state = EditorState.create({ doc, selection: createCollapsedSelection('b1', 0) });
		const history = new HistoryManager();

		const tr = makeInsertTr('b1', 0, 'hello', 1000);
		state = state.apply(tr);
		history.push(tr);

		expect(getBlockText(state.doc.children[0])).toBe('hello');
		expect(history.canUndo()).toBe(true);

		const result = history.undo(state);
		expect(result).not.toBeNull();
		expect(getBlockText(result?.state.doc.children[0])).toBe('');
		expect(result?.transaction.steps.length).toBeGreaterThan(0);
	});

	it('can redo after undo', () => {
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
		let state = EditorState.create({ doc, selection: createCollapsedSelection('b1', 0) });
		const history = new HistoryManager();

		const tr = makeInsertTr('b1', 0, 'hello', 1000);
		state = state.apply(tr);
		history.push(tr);

		state = history.undo(state)?.state ?? state;
		expect(history.canRedo()).toBe(true);

		const redoResult = history.redo(state);
		state = redoResult?.state ?? state;
		expect(getBlockText(state.doc.children[0])).toBe('hello');
		expect(redoResult?.transaction.steps.length).toBeGreaterThan(0);
	});

	it('groups rapid input transactions', () => {
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
		let state = EditorState.create({ doc, selection: createCollapsedSelection('b1', 0) });
		const history = new HistoryManager({ groupTimeoutMs: 500 });

		// Type characters rapidly (within 500ms)
		for (let i = 0; i < 5; i++) {
			const offset = i;
			const tr = makeInsertTr('b1', offset, String.fromCharCode(97 + i), 1000 + i * 100);
			state = state.apply(tr);
			history.push(tr);
		}

		// Should be grouped into one undo
		expect(getBlockText(state.doc.children[0])).toBe('abcde');
		state = history.undo(state)?.state ?? state;
		expect(getBlockText(state.doc.children[0])).toBe('');
	});

	it('splits groups after timeout', () => {
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
		let state = EditorState.create({ doc, selection: createCollapsedSelection('b1', 0) });
		const history = new HistoryManager({ groupTimeoutMs: 500 });

		const tr1 = makeInsertTr('b1', 0, 'a', 1000);
		state = state.apply(tr1);
		history.push(tr1);

		// 600ms gap — new group
		const tr2 = makeInsertTr('b1', 1, 'b', 1600);
		state = state.apply(tr2);
		history.push(tr2);

		expect(getBlockText(state.doc.children[0])).toBe('ab');

		// First undo removes 'b'
		state = history.undo(state)?.state ?? state;
		expect(getBlockText(state.doc.children[0])).toBe('a');

		// Second undo removes 'a'
		state = history.undo(state)?.state ?? state;
		expect(getBlockText(state.doc.children[0])).toBe('');
	});

	it('clears redo stack on new input', () => {
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
		let state = EditorState.create({ doc, selection: createCollapsedSelection('b1', 0) });
		const history = new HistoryManager();

		const tr1 = makeInsertTr('b1', 0, 'a', 1000);
		state = state.apply(tr1);
		history.push(tr1);

		state = history.undo(state)?.state ?? state;
		expect(history.canRedo()).toBe(true);

		// New input clears redo
		const tr2 = makeInsertTr('b1', 0, 'b', 2000);
		state = state.apply(tr2);
		history.push(tr2);
		expect(history.canRedo()).toBe(false);
	});

	it('enforces max depth', () => {
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
		let state = EditorState.create({ doc, selection: createCollapsedSelection('b1', 0) });
		const history = new HistoryManager({ maxDepth: 3 });

		for (let i = 0; i < 5; i++) {
			const tr = makeInsertTr('b1', i, 'x', 1000 + i * 1000);
			state = state.apply(tr);
			history.push(tr);
		}

		// Should only be able to undo 3 times
		let undoCount = 0;
		while (history.canUndo()) {
			state = history.undo(state)?.state ?? state;
			undoCount++;
		}
		expect(undoCount).toBe(3);
	});

	it('returns null from undo/redo when stacks empty', () => {
		const state = EditorState.create();
		const history = new HistoryManager();

		expect(history.undo(state)).toBeNull();
		expect(history.redo(state)).toBeNull();
		expect(history.canUndo()).toBe(false);
		expect(history.canRedo()).toBe(false);
	});

	describe('redo selection correctness', () => {
		it('restores correct cursor position after redo (single transaction)', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});
			const history = new HistoryManager();

			// Type "hello" — cursor moves from 0 to 5
			const tr = makeInsertTr('b1', 0, 'hello', 1000);
			state = state.apply(tr);
			history.push(tr);

			expect(state.selection.head.offset).toBe(5);

			// Undo — cursor should return to 0
			const undoResult = history.undo(state);
			state = undoResult?.state ?? state;
			expect(state.selection.head.offset).toBe(0);

			// Redo — cursor should be back at 5
			const redoResult = history.redo(state);
			state = redoResult?.state ?? state;

			expect(state.selection.head.blockId).toBe('b1');
			expect(state.selection.head.offset).toBe(5);
			expect(redoResult?.transaction.selectionAfter.head.offset).toBe(5);
			expect(redoResult?.transaction.selectionBefore.head.offset).toBe(0);
		});

		it('restores correct cursor position after redo with grouped transactions', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});
			const history = new HistoryManager({ groupTimeoutMs: 500 });

			// Type "a", "b", "c" rapidly — grouped into one undo group
			for (let i = 0; i < 3; i++) {
				const tr = makeInsertTr('b1', i, String.fromCharCode(97 + i), 1000 + i * 100);
				state = state.apply(tr);
				history.push(tr);
			}

			expect(getBlockText(state.doc.children[0])).toBe('abc');
			expect(state.selection.head.offset).toBe(3);

			// Undo the whole group — cursor should go back to 0
			const undoResult = history.undo(state);
			state = undoResult?.state ?? state;
			expect(getBlockText(state.doc.children[0])).toBe('');
			expect(state.selection.head.offset).toBe(0);

			// Redo the group — cursor should be at 3
			const redoResult = history.redo(state);
			state = redoResult?.state ?? state;

			expect(getBlockText(state.doc.children[0])).toBe('abc');
			expect(state.selection.head.offset).toBe(3);
			expect(redoResult?.transaction.selectionAfter.head.offset).toBe(3);
			expect(redoResult?.transaction.selectionBefore.head.offset).toBe(0);
		});

		it('maintains correct selections through multiple undo/redo cycles', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});
			const history = new HistoryManager();

			// Type "hello"
			const tr = makeInsertTr('b1', 0, 'hello', 1000);
			state = state.apply(tr);
			history.push(tr);

			// Cycle: undo → redo → undo → redo
			for (let cycle = 0; cycle < 3; cycle++) {
				const undoResult = history.undo(state);
				state = undoResult?.state ?? state;
				expect(state.selection.head.offset).toBe(0);
				expect(getBlockText(state.doc.children[0])).toBe('');

				const redoResult = history.redo(state);
				state = redoResult?.state ?? state;
				expect(state.selection.head.offset).toBe(5);
				expect(getBlockText(state.doc.children[0])).toBe('hello');
			}
		});

		it('redo selectionBefore reflects actual state selection, not original transaction selection', () => {
			// This test verifies the behavior when the cursor is moved
			// between undo and redo (e.g. user clicks somewhere else).
			// The redo transaction's selectionBefore should reflect the
			// ACTUAL state selection, not the original transaction's
			// selectionBefore.
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('existing')], 'b1'),
			]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 3),
			});
			const history = new HistoryManager();

			// Insert "XY" at offset 3 — cursor moves to 5
			const sel = createCollapsedSelection('b1', 3);
			const builder = new TransactionBuilder(sel, null, 'input');
			builder.insertText('b1', 3, 'XY', []);
			builder.setSelection(createCollapsedSelection('b1', 5));
			const tr = {
				...builder.build(),
				metadata: { origin: 'input' as const, timestamp: 1000 },
			};

			state = state.apply(tr);
			history.push(tr);
			expect(getBlockText(state.doc.children[0])).toBe('exiXYsting');
			expect(state.selection.head.offset).toBe(5);

			// Undo — restores "existing", cursor at 3
			state = history.undo(state)?.state ?? state;
			expect(getBlockText(state.doc.children[0])).toBe('existing');
			expect(state.selection.head.offset).toBe(3);

			// Simulate user clicking to move cursor to offset 7
			// (between undo and redo, cursor moves without history)
			const movedState = EditorState.create({
				doc: state.doc,
				selection: createCollapsedSelection('b1', 7),
				schema: state.schema,
			});

			// Redo with cursor at different position
			const redoResult = history.redo(movedState);

			// Document should be correctly restored
			expect(getBlockText(redoResult?.state.doc.children[0])).toBe('exiXYsting');

			// selectionAfter should be the original transaction's target: offset 5
			expect(redoResult?.state.selection.head.offset).toBe(5);
			expect(redoResult?.transaction.selectionAfter.head.offset).toBe(5);

			// selectionBefore reflects the ACTUAL state before redo (offset 7),
			// NOT the original transaction's selectionBefore (offset 3).
			// The bug claim says this should be offset 3 (the "original selection"),
			// but the current code uses state.selection (offset 7).
			expect(redoResult?.transaction.selectionBefore.head.offset).toBe(7);
		});

		it('undo transaction selectionBefore matches original selectionAfter', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});
			const history = new HistoryManager();

			const tr = makeInsertTr('b1', 0, 'hello', 1000);
			state = state.apply(tr);
			history.push(tr);

			// Before undo, selection is at 5 (= original tr.selectionAfter)
			const undoResult = history.undo(state);

			// The undo summary transaction's selectionBefore should be
			// the state's selection before undo (= offset 5)
			expect(undoResult?.transaction.selectionBefore.head.offset).toBe(5);
			// selectionAfter should be the restored position (= offset 0)
			expect(undoResult?.transaction.selectionAfter.head.offset).toBe(0);
		});
	});

	describe('non-document transactions', () => {
		it('does not push selection-only transactions (zero steps)', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});
			const history = new HistoryManager();

			// A movement transaction with no steps at all
			const sel = createCollapsedSelection('b1', 0);
			const builder = new TransactionBuilder(sel, null, 'input');
			builder.setSelection(createCollapsedSelection('b1', 3));
			const tr = builder.build();

			history.push(tr);
			expect(history.canUndo()).toBe(false);
		});

		it('does not push setStoredMarks-only transactions', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});
			const history = new HistoryManager();

			// A transaction with only a setStoredMarks step (e.g. toggling bold on collapsed selection)
			const sel = createCollapsedSelection('b1', 0);
			const builder = new TransactionBuilder(sel, null, 'input');
			builder.setStoredMarks([{ type: markType('bold') }], null);
			const tr = builder.build();

			history.push(tr);
			expect(history.canUndo()).toBe(false);
		});

		it('still pushes transactions with document-modifying steps', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});
			const history = new HistoryManager();

			const tr = makeInsertTr('b1', 0, 'x', 1000);
			history.push(tr);
			expect(history.canUndo()).toBe(true);
		});

		it('does not push transactions with only setStoredMarks + selection change', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});
			const history = new HistoryManager();

			// Movement transaction: setStoredMarks + selection change
			const sel = createCollapsedSelection('b1', 0);
			const builder = new TransactionBuilder(sel, null, 'input');
			builder.setSelection(createCollapsedSelection('b1', 5));
			builder.setStoredMarks(null, [{ type: markType('bold') }]);
			const tr = builder.build();

			history.push(tr);
			expect(history.canUndo()).toBe(false);
		});
	});
});
