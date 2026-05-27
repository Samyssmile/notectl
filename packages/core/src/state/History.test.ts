import { describe, expect, it } from 'vitest';
import { insertTextCommand } from '../commands/Commands.js';
import { toggleBold } from '../commands/MarkCommands.js';
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
import { Mapping } from './Mapping.js';
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

		it('restores stored marks when undoing text input', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});
			const history = new HistoryManager();

			const toggleTr = toggleBold(state);
			expect(toggleTr).not.toBeNull();
			if (!toggleTr) return;
			state = state.apply(toggleTr);
			expect(state.storedMarks).toEqual([{ type: markType('bold') }]);

			const tr = insertTextCommand(state, 'a');
			state = state.apply(tr);
			history.push(tr);

			const undoResult = history.undo(state);
			expect(undoResult).not.toBeNull();
			expect(undoResult?.state.storedMarks).toEqual([{ type: markType('bold') }]);
		});
	});

	describe('selection mapping through intervening transactions', () => {
		it('folds restored selection through intervening transaction added via push', () => {
			// Scenario: User types "hello" at the end. Then an external transaction
			// inserts "X" at offset 0. Undo of the user's typing should restore the
			// cursor at offset 1 (where it was relative to "X"), not offset 0
			// (its literal numeric value).
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});
			const history = new HistoryManager();

			// User typing
			const userTr = makeInsertTr('b1', 0, 'hello', 1000);
			state = state.apply(userTr);
			history.push(userTr);

			// External transaction: insert "X" at offset 0
			const extSel = createCollapsedSelection('b1', 0);
			const builder = new TransactionBuilder(extSel, null, 'api', state.doc);
			builder.insertText('b1', 0, 'X', []);
			// External transactions usually also update the cursor; pretend they
			// land it at the very end.
			builder.setSelection(createCollapsedSelection('b1', 6));
			const externalTr = builder.build();
			state = state.apply(externalTr);
			history.push(externalTr);

			expect(getBlockText(state.doc.children[0])).toBe('Xhello');

			// Undo: the user's group is now the SECOND-to-last on the stack.
			// undo() pops the external transaction first (linear undo). To exercise
			// the intervening-mapping logic on the user's group, undo twice.
			let result = history.undo(state);
			state = result?.state ?? state;
			expect(getBlockText(state.doc.children[0])).toBe('hello');

			// Now undo again — popping the user's group. The selectionBefore was
			// {b1, 0}. After the external transaction shifted things, the cursor
			// should still resolve to a sensible offset.
			result = history.undo(state);
			state = result?.state ?? state;
			expect(getBlockText(state.doc.children[0])).toBe('');
			expect(state.selection.head.blockId).toBe('b1');
			expect(state.selection.head.offset).toBe(0);
		});

		it('uses recordIntervening for out-of-band mappings', () => {
			// Out-of-band transactions never reach push (e.g. collab updates the
			// user is not supposed to undo). The caller signals their mapping via
			// recordIntervening so subsequent undos rebase *both* the inverse
			// steps and the restored selection through it.
			//
			// We exercise a real content-changing intervening edit: an external
			// insertion that shifts every offset in the user's block. The
			// undo's inverse delete must rebase to the new offset, the doc must
			// retain the agent's insertion, and the cursor must follow.
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello world')], 'b1'),
			]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 5),
			});
			const history = new HistoryManager();

			// User: insert "!" at offset 5 ("hello! world"), cursor at 6.
			const sel = createCollapsedSelection('b1', 5);
			const builder = new TransactionBuilder(sel, null, 'input', state.doc);
			builder.insertText('b1', 5, '!', []);
			builder.setSelection(createCollapsedSelection('b1', 6));
			const tr = { ...builder.build(), metadata: { origin: 'input' as const, timestamp: 1000 } };
			state = state.apply(tr);
			history.push(tr);
			expect(getBlockText(state.doc.children[0])).toBe('hello! world');

			// Out-of-band: an agent inserts "Z" at offset 0 ("Zhello! world").
			const agentBuilder = new TransactionBuilder(
				createCollapsedSelection('b1', 0),
				null,
				'api',
				state.doc,
			);
			agentBuilder.insertText('b1', 0, 'Z', []);
			const agentTr = agentBuilder.build();
			state = state.apply(agentTr);
			history.recordIntervening(agentTr.mapping);
			expect(getBlockText(state.doc.children[0])).toBe('Zhello! world');

			// Undo the user's typing — the inverse delete must be rebased from
			// [5, 6) to [6, 7) so it removes "!" rather than the "o" of "hello".
			const result = history.undo(state);
			expect(result).not.toBeNull();
			state = result?.state ?? state;
			expect(getBlockText(state.doc.children[0])).toBe('Zhello world');
			// The pre-tr cursor at {b1, 5} survives the agent's shift to {b1, 6}.
			expect(state.selection.head.blockId).toBe('b1');
			expect(state.selection.head.offset).toBe(6);
		});

		it('does nothing when interveningMapping is empty (no out-of-band edits)', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});
			const history = new HistoryManager();

			const tr = makeInsertTr('b1', 0, 'hello', 1000);
			state = state.apply(tr);
			history.push(tr);

			const result = history.undo(state);
			state = result?.state ?? state;

			// Cursor returns to the original literal position — no mapping needed.
			expect(state.selection.head.offset).toBe(0);
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

	// --- Issue #129: undo under recordIntervening rebases inverse steps ---
	//
	// The original issue and its acceptance criteria. Each test exercises a
	// concrete intervening-edit shape and asserts both the resulting document
	// content AND the cursor — covering criteria 1-6 verbatim, plus the
	// "abandon" path for irrecoverable conflicts.
	describe('step rebasing under recordIntervening (issue #129)', () => {
		// AC 1: the original vitest snippet from the issue.
		it('undo after intervening insert preserves the user value', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 5),
			});
			const history = new HistoryManager();

			const tr1Builder = new TransactionBuilder(
				createCollapsedSelection('b1', 5),
				null,
				'input',
				state.doc,
			);
			tr1Builder.insertText('b1', 5, 'X', []);
			tr1Builder.setSelection(createCollapsedSelection('b1', 6));
			const tr1 = tr1Builder.build();
			state = state.apply(tr1);
			history.push(tr1);

			const tr2Builder = new TransactionBuilder(state.selection, null, 'api', state.doc);
			tr2Builder.insertText('b1', 0, 'Z', []);
			tr2Builder.setSelection(state.selection);
			const tr2 = tr2Builder.build();
			state = state.apply(tr2);
			history.recordIntervening(tr2.mapping);

			const undone = history.undo(state);
			expect(undone).not.toBeNull();
			expect(getBlockText(undone?.state.doc.children[0])).toBe('Zhello');
		});

		// AC 2: insertion BEFORE the user's edit shifts the inverse delete right.
		it('intervening insert BEFORE the edit shifts the inverse right', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello world')], 'b1'),
			]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 5),
			});
			const history = new HistoryManager();

			// User: insert "!" at offset 5.
			const userB = new TransactionBuilder(state.selection, null, 'input', state.doc);
			userB.insertText('b1', 5, '!', []);
			userB.setSelection(createCollapsedSelection('b1', 6));
			const userTr = userB.build();
			state = state.apply(userTr);
			history.push(userTr);
			expect(getBlockText(state.doc.children[0])).toBe('hello! world');

			// Agent: insert "AGENT-" at offset 0 (6 chars before the user's edit).
			const agentB = new TransactionBuilder(
				createCollapsedSelection('b1', 0),
				null,
				'api',
				state.doc,
			);
			agentB.insertText('b1', 0, 'AGENT-', []);
			const agentTr = agentB.build();
			state = state.apply(agentTr);
			history.recordIntervening(agentTr.mapping);
			expect(getBlockText(state.doc.children[0])).toBe('AGENT-hello! world');

			// Undo deletes the "!" — now at offset 11, not 5.
			const undone = history.undo(state);
			expect(undone).not.toBeNull();
			expect(getBlockText(undone?.state.doc.children[0])).toBe('AGENT-hello world');
		});

		// AC 3: insertion AFTER the user's edit leaves their range alone.
		it('intervening insert AFTER the edit leaves the inverse range alone', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello world')], 'b1'),
			]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 5),
			});
			const history = new HistoryManager();

			const userB = new TransactionBuilder(state.selection, null, 'input', state.doc);
			userB.insertText('b1', 5, '!', []);
			userB.setSelection(createCollapsedSelection('b1', 6));
			const userTr = userB.build();
			state = state.apply(userTr);
			history.push(userTr);

			// Agent inserts at end of doc, well past the user's edit.
			const agentB = new TransactionBuilder(
				createCollapsedSelection('b1', 12),
				null,
				'api',
				state.doc,
			);
			agentB.insertText('b1', 12, '!!', []);
			const agentTr = agentB.build();
			state = state.apply(agentTr);
			history.recordIntervening(agentTr.mapping);
			expect(getBlockText(state.doc.children[0])).toBe('hello! world!!');

			const undone = history.undo(state);
			expect(undone).not.toBeNull();
			expect(getBlockText(undone?.state.doc.children[0])).toBe('hello world!!');
		});

		// AC 4: deletion covering the user's edit point abandons the group.
		it('intervening deleteText covering the edit invalidates the group', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello world')], 'b1'),
			]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 5),
			});
			const history = new HistoryManager();

			// User inserts "!" at offset 5.
			const userB = new TransactionBuilder(state.selection, null, 'input', state.doc);
			userB.insertText('b1', 5, '!', []);
			userB.setSelection(createCollapsedSelection('b1', 6));
			const userTr = userB.build();
			state = state.apply(userTr);
			history.push(userTr);
			expect(getBlockText(state.doc.children[0])).toBe('hello! world');

			// Agent deletes [3, 9) — covering the user's "!" at offset 5.
			const agentB = new TransactionBuilder(
				createCollapsedSelection('b1', 3),
				null,
				'api',
				state.doc,
			);
			agentB.deleteTextAt('b1', 3, 9);
			const agentTr = agentB.build();
			state = state.apply(agentTr);
			history.recordIntervening(agentTr.mapping);

			const docBeforeUndo = state.doc;
			const selectionBeforeUndo = state.selection;
			const undone = history.undo(state);

			// Abandoned: undo reports nothing-to-undo without touching state.
			expect(undone).toBeNull();
			expect(state.doc).toBe(docBeforeUndo);
			expect(state.selection).toBe(selectionBeforeUndo);
		});

		// AC 4 (variant): intervening block removal containing the user's block.
		it('intervening removal of the user’s block invalidates the group', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello')], 'b1'),
				createBlockNode('paragraph', [createTextNode('world')], 'b2'),
			]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});
			const history = new HistoryManager();

			const userB = new TransactionBuilder(state.selection, null, 'input', state.doc);
			userB.insertText('b1', 0, 'X', []);
			userB.setSelection(createCollapsedSelection('b1', 1));
			const userTr = userB.build();
			state = state.apply(userTr);
			history.push(userTr);

			// Agent removes b1 entirely.
			const agentB = new TransactionBuilder(
				createCollapsedSelection('b2', 0),
				null,
				'api',
				state.doc,
			);
			agentB.removeNode([], 0);
			const agentTr = agentB.build();
			state = state.apply(agentTr);
			history.recordIntervening(agentTr.mapping);

			const undone = history.undo(state);
			expect(undone).toBeNull();
		});

		// AC 5: a multi-step single transaction under intervening — exercises the
		// frame-walk + cancellation when no real intervening reshape happens.
		it('multi-step transaction undo is frame-correct', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 5),
			});
			const history = new HistoryManager();

			const builder = new TransactionBuilder(state.selection, null, 'input', state.doc);
			builder
				.insertText('b1', 5, ' world', [])
				.deleteTextAt('b1', 0, 5)
				.setSelection(createCollapsedSelection('b1', 0));
			const tr = builder.build();
			state = state.apply(tr);
			history.push(tr);
			expect(getBlockText(state.doc.children[0])).toBe(' world');

			const undone = history.undo(state);
			expect(undone).not.toBeNull();
			expect(getBlockText(undone?.state.doc.children[0])).toBe('hello');
		});

		// AC 5 (variant): multi-step transaction WITH intervening — both the
		// frame walk and the rebase must compose correctly.
		it('multi-step transaction undo composes with intervening edits', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 5),
			});
			const history = new HistoryManager();

			const builder = new TransactionBuilder(state.selection, null, 'input', state.doc);
			builder
				.insertText('b1', 5, ' world', [])
				.deleteTextAt('b1', 0, 5)
				.setSelection(createCollapsedSelection('b1', 0));
			const tr = builder.build();
			state = state.apply(tr);
			history.push(tr);
			expect(getBlockText(state.doc.children[0])).toBe(' world');

			// Agent appends "!" at end (offset 6).
			const agentB = new TransactionBuilder(
				createCollapsedSelection('b1', 6),
				null,
				'api',
				state.doc,
			);
			agentB.insertText('b1', 6, '!', []);
			const agentTr = agentB.build();
			state = state.apply(agentTr);
			history.recordIntervening(agentTr.mapping);
			expect(getBlockText(state.doc.children[0])).toBe(' world!');

			const undone = history.undo(state);
			expect(undone).not.toBeNull();
			expect(getBlockText(undone?.state.doc.children[0])).toBe('hello!');
		});

		// AC 6: redo of a previously-undone-with-mapping group yields a valid doc.
		it('redo after intervening + undo reproduces a valid document', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 5),
			});
			const history = new HistoryManager();

			const userB = new TransactionBuilder(state.selection, null, 'input', state.doc);
			userB.insertText('b1', 5, 'X', []);
			userB.setSelection(createCollapsedSelection('b1', 6));
			const userTr = userB.build();
			state = state.apply(userTr);
			history.push(userTr);

			const agentB = new TransactionBuilder(
				createCollapsedSelection('b1', 0),
				null,
				'api',
				state.doc,
			);
			agentB.insertText('b1', 0, 'Z', []);
			const agentTr = agentB.build();
			state = state.apply(agentTr);
			history.recordIntervening(agentTr.mapping);
			expect(getBlockText(state.doc.children[0])).toBe('ZhelloX');

			state = history.undo(state)?.state ?? state;
			expect(getBlockText(state.doc.children[0])).toBe('Zhello');

			const redone = history.redo(state);
			expect(redone).not.toBeNull();
			expect(getBlockText(redone?.state.doc.children[0])).toBe('ZhelloX');
		});

		// Sibling-shift: undo of a structural insertNode must follow the
		// sibling shift produced by an intervening insertNode in the same
		// parent. Before the childIndexShift StepMap category existed, the
		// inverse removeNode would target the original index and either fail
		// or remove the wrong block.
		it('insertNode undo follows intervening insertNode in the same parent', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('first')], 'b1')]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});
			const history = new HistoryManager();

			// User: insert a new block at index 1 (after b1).
			const userNode = createBlockNode('paragraph', [createTextNode('user')], 'bUser');
			const userB = new TransactionBuilder(state.selection, null, 'input', state.doc);
			userB.insertNode([], 1, userNode);
			const userTr = userB.build();
			state = state.apply(userTr);
			history.push(userTr);
			expect(state.doc.children.length).toBe(2);
			expect(state.doc.children[1]?.id).toBe('bUser');

			// Agent: insert another block at index 0 (before everything).
			const agentNode = createBlockNode('paragraph', [createTextNode('agent')], 'bAgent');
			const agentB = new TransactionBuilder(state.selection, null, 'api', state.doc);
			agentB.insertNode([], 0, agentNode);
			const agentTr = agentB.build();
			state = state.apply(agentTr);
			history.recordIntervening(agentTr.mapping);

			// After agent's insert, user's block sits at index 2.
			expect(state.doc.children.length).toBe(3);
			expect(state.doc.children[0]?.id).toBe('bAgent');
			expect(state.doc.children[1]?.id).toBe('b1');
			expect(state.doc.children[2]?.id).toBe('bUser');

			// Undo: must remove the user's block (at index 2), not the agent's.
			const undone = history.undo(state);
			expect(undone).not.toBeNull();
			const after = undone?.state;
			expect(after?.doc.children.length).toBe(2);
			expect(after?.doc.children[0]?.id).toBe('bAgent');
			expect(after?.doc.children[1]?.id).toBe('b1');
		});

		// Sibling-shift: undo of a structural removeNode must compensate for
		// an intervening insertNode in the same parent.
		it('removeNode undo follows intervening insertNode in the same parent', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('first')], 'b1'),
				createBlockNode('paragraph', [createTextNode('victim')], 'b2'),
			]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});
			const history = new HistoryManager();

			// User: remove the second block (b2 at index 1).
			const userB = new TransactionBuilder(state.selection, null, 'input', state.doc);
			userB.removeNode([], 1);
			const userTr = userB.build();
			state = state.apply(userTr);
			history.push(userTr);
			expect(state.doc.children.length).toBe(1);
			expect(state.doc.children[0]?.id).toBe('b1');

			// Agent: insert a block at index 0.
			const agentNode = createBlockNode('paragraph', [createTextNode('agent')], 'bAgent');
			const agentB = new TransactionBuilder(state.selection, null, 'api', state.doc);
			agentB.insertNode([], 0, agentNode);
			const agentTr = agentB.build();
			state = state.apply(agentTr);
			history.recordIntervening(agentTr.mapping);
			expect(state.doc.children.length).toBe(2);
			expect(state.doc.children[0]?.id).toBe('bAgent');
			expect(state.doc.children[1]?.id).toBe('b1');

			// Undo: the inverse insertNode of b2 must land at index 2 (after b1),
			// not at index 1 (which would push b1 down — wrong).
			const undone = history.undo(state);
			expect(undone).not.toBeNull();
			const after = undone?.state;
			expect(after?.doc.children.length).toBe(3);
			expect(after?.doc.children[0]?.id).toBe('bAgent');
			expect(after?.doc.children[1]?.id).toBe('b1');
			expect(after?.doc.children[2]?.id).toBe('b2');
		});

		// Slot-preservation: when intervening removes exactly the block at the
		// slot the user's removeNode-undo would insert into, an InsertNodeStep
		// references an *insertion slot* (not an existing block), so the slot
		// itself survives. This exercises `mapInsertionIndex` end-to-end:
		// without the insertion-vs-existing-child distinction, the undo would
		// be abandoned and the user's removed block could not be restored.
		it('removeNode undo restores the block when intervening removed the sibling at the same index', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('first')], 'b1'),
				createBlockNode('paragraph', [createTextNode('user-victim')], 'b2'),
				createBlockNode('paragraph', [createTextNode('sibling')], 'b3'),
			]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});
			const history = new HistoryManager();

			// User removes b2 (at index 1). Inverse will insertNode at slot 1.
			const userB = new TransactionBuilder(state.selection, null, 'input', state.doc);
			userB.removeNode([], 1);
			const userTr = userB.build();
			state = state.apply(userTr);
			history.push(userTr);
			expect(state.doc.children.length).toBe(2);
			expect(state.doc.children[0]?.id).toBe('b1');
			expect(state.doc.children[1]?.id).toBe('b3');

			// Agent removes b3 — which now sits at index 1 (the same numeric slot
			// the user's undo will target).
			const agentB = new TransactionBuilder(state.selection, null, 'api', state.doc);
			agentB.removeNode([], 1);
			const agentTr = agentB.build();
			state = state.apply(agentTr);
			history.recordIntervening(agentTr.mapping);
			expect(state.doc.children.length).toBe(1);
			expect(state.doc.children[0]?.id).toBe('b1');

			// Undo: insertion slot 1 survives (mapInsertionIndex), b2 reinserted
			// at the end. Existing-child semantics would have abandoned the undo.
			const undone = history.undo(state);
			expect(undone).not.toBeNull();
			const after = undone?.state;
			expect(after?.doc.children.length).toBe(2);
			expect(after?.doc.children[0]?.id).toBe('b1');
			expect(after?.doc.children[1]?.id).toBe('b2');
		});

		// Payload re-snapshot: when intervening edits modified a block's
		// content after an undo restored it, a subsequent redo must re-snapshot
		// the current subtree into the synthetic so the next undo restores the
		// agent's edits rather than the stale pre-intervening state. Block-level
		// analog to the inline identity fix in mapRemoveInlineNode.
		it('agent edits inside a restored block survive undo+redo+undo', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('A')], 'a1'),
				createBlockNode('paragraph', [createTextNode('hello')], 'b1'),
			]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('a1', 0),
			});
			const history = new HistoryManager();

			// User removes b1.
			const removeB = new TransactionBuilder(state.selection, null, 'input', state.doc);
			removeB.removeNode([], 1);
			const removeTr = removeB.build();
			state = state.apply(removeTr);
			history.push(removeTr);
			expect(state.doc.children.length).toBe(1);

			// User undoes → b1 restored with original 'hello'.
			state = history.undo(state)?.state ?? state;
			expect(state.doc.children.length).toBe(2);
			expect(getBlockText(state.doc.children[1])).toBe('hello');

			// Agent edits b1's content.
			const agentB = new TransactionBuilder(state.selection, null, 'api', state.doc);
			agentB.insertText('b1', 5, 'X', []);
			const agentTr = agentB.build();
			state = state.apply(agentTr);
			history.recordIntervening(agentTr.mapping);
			expect(getBlockText(state.doc.children[1])).toBe('helloX');

			// User redoes → b1 re-removed. The synthetic on the undo stack must
			// carry the current b1('helloX'), not the stale b1('hello').
			state = history.redo(state)?.state ?? state;
			expect(state.doc.children.length).toBe(1);

			// User undoes again → restores b1 with the agent's edit intact.
			state = history.undo(state)?.state ?? state;
			expect(state.doc.children.length).toBe(2);
			expect(getBlockText(state.doc.children[1])).toBe('helloX');
		});

		// Cross-scenario: two consecutive intervenings compose correctly.
		it('chained intervening mappings compose for one undo', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 5),
			});
			const history = new HistoryManager();

			const userB = new TransactionBuilder(state.selection, null, 'input', state.doc);
			userB.insertText('b1', 5, 'X', []);
			userB.setSelection(createCollapsedSelection('b1', 6));
			const userTr = userB.build();
			state = state.apply(userTr);
			history.push(userTr);

			// First agent insert.
			const a1B = new TransactionBuilder(createCollapsedSelection('b1', 0), null, 'api', state.doc);
			a1B.insertText('b1', 0, 'A', []);
			const a1Tr = a1B.build();
			state = state.apply(a1Tr);
			history.recordIntervening(a1Tr.mapping);

			// Second agent insert.
			const a2B = new TransactionBuilder(createCollapsedSelection('b1', 0), null, 'api', state.doc);
			a2B.insertText('b1', 0, 'B', []);
			const a2Tr = a2B.build();
			state = state.apply(a2Tr);
			history.recordIntervening(a2Tr.mapping);
			expect(getBlockText(state.doc.children[0])).toBe('BAhelloX');

			const undone = history.undo(state);
			expect(undone).not.toBeNull();
			expect(getBlockText(undone?.state.doc.children[0])).toBe('BAhello');
		});
	});
});
