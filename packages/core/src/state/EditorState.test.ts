import { describe, expect, it } from 'vitest';
import {
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockText,
	getTextChildren,
} from '../model/Document.js';
import {
	createCollapsedSelection,
	createGapCursor,
	createNodeSelection,
	createSelection,
	isTextSelection,
} from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import { EditorState } from './EditorState.js';
import { TransactionBuilder } from './Transaction.js';

describe('EditorState', () => {
	describe('create', () => {
		it('creates default state with empty paragraph', () => {
			const state = EditorState.create();
			expect(state.doc.children).toHaveLength(1);
			expect(state.doc.children[0]?.type).toBe('paragraph');
			expect(state.storedMarks).toBeNull();
		});

		it('creates state with custom document', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({ doc });
			expect(getBlockText(state.doc.children[0])).toBe('hello');
		});
	});

	describe('apply - insertText', () => {
		it('inserts text at cursor position', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			const tr = new TransactionBuilder(state.selection, null, 'input')
				.insertText('b1', 0, 'hello', [])
				.setSelection(createCollapsedSelection('b1', 5))
				.build();

			const newState = state.apply(tr);
			expect(getBlockText(newState.doc.children[0])).toBe('hello');
			expect(newState.selection.anchor.offset).toBe(5);
		});

		it('inserts text with marks', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			const tr = new TransactionBuilder(state.selection, null, 'input')
				.insertText('b1', 0, 'bold', [{ type: 'bold' }])
				.setSelection(createCollapsedSelection('b1', 4))
				.build();

			const newState = state.apply(tr);
			const children = getTextChildren(newState.doc.children[0]);
			expect(children[0]?.text).toBe('bold');
			expect(children[0]?.marks).toEqual([{ type: 'bold' }]);
		});
	});

	describe('apply - deleteText', () => {
		it('deletes text range', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello world')], 'b1'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 11),
			});

			const tr = new TransactionBuilder(state.selection, null, 'input')
				.deleteText('b1', 5, 11, ' world', [])
				.setSelection(createCollapsedSelection('b1', 5))
				.build();

			const newState = state.apply(tr);
			expect(getBlockText(newState.doc.children[0])).toBe('hello');
		});
	});

	describe('apply - splitBlock', () => {
		it('splits a block into two', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello world')], 'b1'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 5),
			});

			const tr = new TransactionBuilder(state.selection, null, 'input')
				.splitBlock('b1', 5, 'b2')
				.setSelection(createCollapsedSelection('b2', 0))
				.build();

			const newState = state.apply(tr);
			expect(newState.doc.children).toHaveLength(2);
			expect(getBlockText(newState.doc.children[0])).toBe('hello');
			expect(getBlockText(newState.doc.children[1])).toBe(' world');
		});
	});

	describe('apply - mergeBlocks', () => {
		it('merges two blocks into one', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello')], 'b1'),
				createBlockNode('paragraph', [createTextNode(' world')], 'b2'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b2', 0),
			});

			const tr = new TransactionBuilder(state.selection, null, 'input')
				.mergeBlocks('b1', 'b2', 5)
				.setSelection(createCollapsedSelection('b1', 5))
				.build();

			const newState = state.apply(tr);
			expect(newState.doc.children).toHaveLength(1);
			expect(getBlockText(newState.doc.children[0])).toBe('hello world');
		});
	});

	describe('apply - addMark', () => {
		it('adds a mark to a text range', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({ doc });

			const tr = new TransactionBuilder(state.selection, null, 'command')
				.addMark('b1', 0, 5, { type: 'bold' })
				.setSelection(state.selection)
				.build();

			const newState = state.apply(tr);
			expect(getTextChildren(newState.doc.children[0])[0]?.marks).toEqual([{ type: 'bold' }]);
		});

		it('adds mark to partial range, splitting text nodes', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello world')], 'b1'),
			]);
			const state = EditorState.create({ doc });

			const tr = new TransactionBuilder(state.selection, null, 'command')
				.addMark('b1', 0, 5, { type: 'bold' })
				.setSelection(state.selection)
				.build();

			const newState = state.apply(tr);
			const children = getTextChildren(newState.doc.children[0]);
			expect(children).toHaveLength(2);
			expect(children[0]?.text).toBe('hello');
			expect(children[0]?.marks).toEqual([{ type: 'bold' }]);
			expect(children[1]?.text).toBe(' world');
			expect(children[1]?.marks).toEqual([]);
		});
	});

	describe('apply - removeMark', () => {
		it('removes a mark from a text range', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('bold', [{ type: 'bold' }])], 'b1'),
			]);
			const state = EditorState.create({ doc });

			const tr = new TransactionBuilder(state.selection, null, 'command')
				.removeMark('b1', 0, 4, { type: 'bold' })
				.setSelection(state.selection)
				.build();

			const newState = state.apply(tr);
			expect(getTextChildren(newState.doc.children[0])[0]?.marks).toEqual([]);
		});
	});

	describe('apply - selection validation', () => {
		it('falls back to first block when selection references non-existent blockId', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello')], 'b1'),
				createBlockNode('paragraph', [createTextNode('world')], 'b2'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			// Build a transaction that removes b2, but sets selection to b2
			const tr = new TransactionBuilder(state.selection, null, 'command', doc)
				.removeNode([], 1)
				.setSelection(createCollapsedSelection('gone' as BlockId, 3))
				.build();

			const newState = state.apply(tr);
			expect(newState.selection.anchor.blockId).toBe('b1');
			expect(newState.selection.anchor.offset).toBe(0);
		});

		it('clamps offset when it exceeds block length', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hi')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			const tr = new TransactionBuilder(state.selection, null, 'command')
				.setSelection(createCollapsedSelection('b1', 99))
				.build();

			const newState = state.apply(tr);
			expect(newState.selection.anchor.blockId).toBe('b1');
			expect(newState.selection.anchor.offset).toBe(2);
		});

		it('passes through a valid selection unchanged', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			const sel = createCollapsedSelection('b1', 3);
			const tr = new TransactionBuilder(state.selection, null, 'command').setSelection(sel).build();

			const newState = state.apply(tr);
			expect(newState.selection).toBe(sel);
		});

		it('handles multi-block selection where head block is removed', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('first')], 'b1'),
				createBlockNode('paragraph', [createTextNode('second')], 'b2'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			const tr = new TransactionBuilder(state.selection, null, 'command', doc)
				.removeNode([], 1)
				.setSelection(
					createSelection(
						{ blockId: 'b1' as BlockId, offset: 2 },
						{ blockId: 'b2' as BlockId, offset: 3 },
					),
				)
				.build();

			const newState = state.apply(tr);
			// Anchor is valid
			expect(newState.selection.anchor.blockId).toBe('b1');
			expect(newState.selection.anchor.offset).toBe(2);
			// Head falls back to first block
			expect(newState.selection.head.blockId).toBe('b1');
			expect(newState.selection.head.offset).toBe(0);
		});
	});

	describe('toJSON / fromJSON', () => {
		it('roundtrips state through JSON', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 3),
			});

			const json = state.toJSON() as { doc: typeof doc; selection: typeof state.selection };
			const restored = EditorState.fromJSON(json);

			expect(getBlockText(restored.doc.children[0])).toBe('hello');
			expect(restored.selection.anchor.offset).toBe(3);
		});
	});

	describe('validateSelection fallback', () => {
		it('GapCursor on deleted block falls back to first leaf block', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('Hello')], 'b1'),
				createBlockNode('paragraph', [createTextNode('World')], 'b2'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			// Build a transaction that removes b2 but sets GapCursor on b2
			const tr = state
				.transaction('input')
				.removeNode([], 1)
				.setSelection(createGapCursor('b2' as BlockId, 'before', []))
				.build();

			const newState = state.apply(tr);
			// b2 no longer exists, so selection should fall back
			expect(isTextSelection(newState.selection)).toBe(true);
			if (isTextSelection(newState.selection)) {
				expect(newState.selection.anchor.blockId).toBe('b1');
			}
		});

		it('NodeSelection on deleted block falls back to first leaf block', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('Hello')], 'b1'),
				createBlockNode('paragraph', [createTextNode('World')], 'b2'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			const tr = state
				.transaction('input')
				.removeNode([], 1)
				.setSelection(createNodeSelection('b2' as BlockId, []))
				.build();

			const newState = state.apply(tr);
			expect(isTextSelection(newState.selection)).toBe(true);
			if (isTextSelection(newState.selection)) {
				expect(newState.selection.anchor.blockId).toBe('b1');
			}
		});
	});
});
