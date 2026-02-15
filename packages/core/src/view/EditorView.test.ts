/**
 * Tests for EditorView.applyUpdate() refactoring:
 * - syncSelectionFromDOM now runs getDecorations (via applyUpdate)
 * - undo/redo are guarded against re-entrancy
 */

import { describe, expect, it, vi } from 'vitest';
import { DecorationSet } from '../decorations/Decoration.js';
import { createBlockNode, createDocument, createTextNode } from '../model/Document.js';
import { SchemaRegistry } from '../model/SchemaRegistry.js';
import { createCollapsedSelection, isNodeSelection } from '../model/Selection.js';
import { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { TransactionBuilder } from '../state/Transaction.js';
import type { StateChangeCallback } from './EditorView.js';
import { EditorView } from './EditorView.js';
import * as SelectionSync from './SelectionSync.js';

// --- Helpers ---

function createTestView(options?: {
	getDecorations?: (state: EditorState, tr?: Transaction) => DecorationSet;
}) {
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
		getDecorations: options?.getDecorations,
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

describe('EditorView.applyUpdate()', () => {
	describe('getDecorations integration', () => {
		it('dispatch calls getDecorations with the new state and transaction', () => {
			const getDecorations = vi.fn(() => DecorationSet.empty);
			const { view } = createTestView({ getDecorations });

			// Reset call count from constructor's initial render
			getDecorations.mockClear();

			const tr = makeInsertTransaction('b1', 0, 'hello');
			view.dispatch(tr);

			expect(getDecorations).toHaveBeenCalledTimes(1);
			const [state, transaction] = getDecorations.mock.calls[0] ?? [];
			expect(state).toBe(view.getState());
			expect(transaction).toBe(tr);

			view.destroy();
		});

		it('undo calls getDecorations with the restored state', () => {
			const getDecorations = vi.fn(() => DecorationSet.empty);
			const { view } = createTestView({ getDecorations });

			view.dispatch(makeInsertTransaction('b1', 0, 'hello'));
			getDecorations.mockClear();

			view.undo();

			expect(getDecorations).toHaveBeenCalledTimes(1);
			const [state] = getDecorations.mock.calls[0] ?? [];
			expect(state).toBe(view.getState());

			view.destroy();
		});

		it('redo calls getDecorations with the re-applied state', () => {
			const getDecorations = vi.fn(() => DecorationSet.empty);
			const { view } = createTestView({ getDecorations });

			view.dispatch(makeInsertTransaction('b1', 0, 'hello'));
			view.undo();
			getDecorations.mockClear();

			view.redo();

			expect(getDecorations).toHaveBeenCalledTimes(1);
			const [state] = getDecorations.mock.calls[0] ?? [];
			expect(state).toBe(view.getState());

			view.destroy();
		});
	});

	describe('re-entrancy guard', () => {
		it('ignores nested dispatch during an update', () => {
			const receivedTransactions: Transaction[] = [];
			const container = document.createElement('div');
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			const ref: { view?: EditorView } = {};

			// onStateChange triggers a nested dispatch
			const onStateChange: StateChangeCallback = (_old, _new, tr) => {
				receivedTransactions.push(tr);
				if (ref.view && tr.metadata.origin !== 'history') {
					// Attempt re-entrant dispatch — should be silently ignored
					const nestedTr = makeInsertTransaction('b1', 0, 'X');
					ref.view.dispatch(nestedTr);
				}
			};

			ref.view = new EditorView(container, { state, onStateChange });
			const view = ref.view;

			const tr = makeInsertTransaction('b1', 0, 'hello');
			view.dispatch(tr);

			// Only the original dispatch should have fired the callback
			expect(receivedTransactions).toHaveLength(1);
			expect(receivedTransactions[0]?.steps[0]?.type).toBe('insertText');

			view.destroy();
		});

		it('undo is guarded against re-entrancy', () => {
			const receivedTransactions: Transaction[] = [];
			const container = document.createElement('div');
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			const ref: { view?: EditorView; undoAttempted: boolean } = { undoAttempted: false };

			const onStateChange: StateChangeCallback = (_old, _new, tr) => {
				receivedTransactions.push(tr);
				// Try nested undo during the undo callback
				if (ref.view && tr.metadata.origin === 'history' && !ref.undoAttempted) {
					ref.undoAttempted = true;
					ref.view.undo();
				}
			};

			ref.view = new EditorView(container, { state, onStateChange });
			const view = ref.view;

			// Insert some text, then undo
			view.dispatch(makeInsertTransaction('b1', 0, 'hello'));
			receivedTransactions.length = 0;

			view.undo();

			// Only one undo callback should fire (nested undo silently ignored)
			expect(receivedTransactions).toHaveLength(1);
			expect(receivedTransactions[0]?.metadata.origin).toBe('history');

			view.destroy();
		});

		it('redo is guarded against re-entrancy', () => {
			const receivedTransactions: Transaction[] = [];
			const container = document.createElement('div');
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			const ref: { view?: EditorView; redoAttempted: boolean } = { redoAttempted: false };

			const onStateChange: StateChangeCallback = (_old, _new, tr) => {
				receivedTransactions.push(tr);
				// Try nested redo during the redo callback
				if (ref.view && tr.metadata.origin === 'history' && !ref.redoAttempted) {
					ref.redoAttempted = true;
					ref.view.redo();
				}
			};

			ref.view = new EditorView(container, { state, onStateChange });
			const view = ref.view;

			view.dispatch(makeInsertTransaction('b1', 0, 'hello'));
			view.undo();
			receivedTransactions.length = 0;

			view.redo();

			// Only one redo callback should fire
			expect(receivedTransactions).toHaveLength(1);
			expect(receivedTransactions[0]?.metadata.origin).toBe('history');

			view.destroy();
		});
	});

	describe('replaceState re-entrancy guard', () => {
		it('replaceState is guarded against re-entrancy', () => {
			const getDecorations = vi.fn(() => DecorationSet.empty);
			const { view } = createTestView({ getDecorations });

			// Dispatch to set up some state, then replaceState
			view.dispatch(makeInsertTransaction('b1', 0, 'hello'));
			getDecorations.mockClear();

			const freshDoc = createDocument([
				createBlockNode('paragraph', [createTextNode('fresh')], 'b2'),
			]);
			const freshState = EditorState.create({
				doc: freshDoc,
				selection: createCollapsedSelection('b2', 0),
			});

			view.replaceState(freshState);

			expect(view.getState()).toBe(freshState);
			expect(getDecorations).toHaveBeenCalledTimes(1);

			view.destroy();
		});
	});

	describe('syncSelectionFromDOM decoration update', () => {
		it('calls getDecorations when DOM selection changes', () => {
			const getDecorations = vi.fn(() => DecorationSet.empty);
			const container = document.createElement('div');
			container.setAttribute('contenteditable', 'true');
			document.body.appendChild(container);

			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			const view = new EditorView(container, { state, getDecorations });
			getDecorations.mockClear();

			// Mock readSelectionFromDOM to return a different cursor position
			const readSpy = vi.spyOn(SelectionSync, 'readSelectionFromDOM');
			readSpy.mockReturnValue(createCollapsedSelection('b1', 3));

			// Focus content element so onSelectionChange passes the active-element check
			container.focus();
			document.dispatchEvent(new Event('selectionchange'));

			expect(getDecorations).toHaveBeenCalledTimes(1);
			expect(getDecorations.mock.calls[0]?.[0]).toBe(view.getState());

			readSpy.mockRestore();
			view.destroy();
			document.body.removeChild(container);
		});

		it('notifies stateChangeCallbacks on DOM selection change', () => {
			const receivedTransactions: Transaction[] = [];
			const container = document.createElement('div');
			container.setAttribute('contenteditable', 'true');
			document.body.appendChild(container);

			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			const onStateChange: StateChangeCallback = (_old, _new, tr) => {
				receivedTransactions.push(tr);
			};

			const view = new EditorView(container, { state, onStateChange });

			const readSpy = vi.spyOn(SelectionSync, 'readSelectionFromDOM');
			readSpy.mockReturnValue(createCollapsedSelection('b1', 4));

			container.focus();
			document.dispatchEvent(new Event('selectionchange'));

			expect(receivedTransactions).toHaveLength(1);
			expect(view.getState().selection.anchor.offset).toBe(4);

			readSpy.mockRestore();
			view.destroy();
			document.body.removeChild(container);
		});
	});

	describe('selectable node mousedown behavior', () => {
		it('creates NodeSelection when mousedown happens on selectable block root', () => {
			const container = document.createElement('div');
			container.setAttribute('contenteditable', 'true');
			document.body.appendChild(container);

			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('before')], 'b1'),
				createBlockNode(
					'table',
					[
						createBlockNode(
							'table_row',
							[
								createBlockNode(
									'table_cell',
									[createBlockNode('paragraph', [createTextNode('')], 'p1')],
									'c1',
								),
							],
							'r1',
						),
					],
					't1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('p1', 0),
				schema: {
					nodeTypes: ['paragraph', 'table', 'table_row', 'table_cell'],
					markTypes: ['bold', 'italic', 'underline'],
				},
			});

			const registry = new SchemaRegistry();
			for (const type of ['paragraph', 'table', 'table_row', 'table_cell']) {
				registry.registerNodeSpec({
					type,
					toDOM(node) {
						const el = document.createElement('div');
						el.setAttribute('data-block-id', node.id);
						return el;
					},
				});
			}

			const view = new EditorView(container, { state, schemaRegistry: registry });
			const tableEl = container.querySelector('[data-block-id="t1"]');
			if (!(tableEl instanceof HTMLElement)) {
				throw new Error('Table element not rendered');
			}
			tableEl.setAttribute('data-selectable', 'true');

			tableEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

			const nextState = view.getState();
			expect(isNodeSelection(nextState.selection)).toBe(true);
			if (isNodeSelection(nextState.selection)) {
				expect(nextState.selection.nodeId).toBe('t1');
			}

			view.destroy();
			document.body.removeChild(container);
		});

		it('does not select selectable ancestor when nearest block is not selectable', () => {
			const container = document.createElement('div');
			container.setAttribute('contenteditable', 'true');
			document.body.appendChild(container);

			const doc = createDocument([
				createBlockNode(
					'table',
					[
						createBlockNode(
							'table_row',
							[
								createBlockNode(
									'table_cell',
									[createBlockNode('paragraph', [createTextNode('')], 'p1')],
									'c1',
								),
							],
							'r1',
						),
					],
					't1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('p1', 0),
				schema: {
					nodeTypes: ['paragraph', 'table', 'table_row', 'table_cell'],
					markTypes: ['bold', 'italic', 'underline'],
				},
			});

			const registry = new SchemaRegistry();
			for (const type of ['paragraph', 'table', 'table_row', 'table_cell']) {
				registry.registerNodeSpec({
					type,
					toDOM(node) {
						const el = document.createElement('div');
						el.setAttribute('data-block-id', node.id);
						return el;
					},
				});
			}

			const view = new EditorView(container, { state, schemaRegistry: registry });
			const tableEl = container.querySelector('[data-block-id="t1"]');
			const cellEl = container.querySelector('[data-block-id="c1"]');
			if (!(tableEl instanceof HTMLElement) || !(cellEl instanceof HTMLElement)) {
				throw new Error('Table/cell element not rendered');
			}
			tableEl.setAttribute('data-selectable', 'true');

			cellEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

			expect(isNodeSelection(view.getState().selection)).toBe(false);

			view.destroy();
			document.body.removeChild(container);
		});
	});
});
