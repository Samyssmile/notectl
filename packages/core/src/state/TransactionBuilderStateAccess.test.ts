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
import { blockId } from '../model/TypeBrands.js';
import { EditorState } from './EditorState.js';
import { HistoryManager } from './History.js';
import { TransactionBuilder } from './Transaction.js';

describe('merge parent validation (#225)', () => {
	const target = blockId('target');
	const source = blockId('source');
	const quote = blockId('quote');
	function nestedState(): EditorState {
		return EditorState.create({
			doc: createDocument([
				createBlockNode('paragraph', [createTextNode('abc')], target),
				createBlockNode(
					'blockquote',
					[
						createBlockNode('paragraph', [createTextNode('def')], source),
						createBlockNode('paragraph', [createTextNode('keep')], blockId('keep')),
					],
					quote,
				),
			]),
			selection: createCollapsedSelection(target, 3),
		});
	}

	for (const method of ['mergeBlocks', 'mergeBlocksAt'] as const) {
		const merge = (builder: TransactionBuilder): TransactionBuilder =>
			method === 'mergeBlocks'
				? builder.mergeBlocks(target, source, 3)
				: builder.mergeBlocksAt(target, source);
		it(`${method} rejects different parents without recording a step or map`, () => {
			const state = nestedState();
			const builder = state.transaction();
			const before = builder.build();
			expect(() => merge(builder)).toThrow(/same parent/);
			const after = builder.build();
			expect(after.steps).toEqual(before.steps);
			expect(after.forwardStepMaps).toEqual(before.forwardStepMaps);
			expect(state.apply(after).doc).toEqual(state.doc);
		});

		it(`${method} rejects blocks moved apart earlier in the transaction`, () => {
			const nested = nestedState();
			const state = nested.apply(nested.transaction().moveNode([quote], 0, [], 1).build());
			const builder = state.transaction().moveNode([], 1, [quote], 0);
			const before = builder.build();
			expect(() => merge(builder)).toThrow(/same parent/);
			expect(builder.build().steps).toEqual(before.steps);
			expect(builder.build().forwardStepMaps).toEqual(before.forwardStepMaps);
		});
	}

	it('accepts siblings created by an earlier move and round-trips through history', () => {
		const state = nestedState();
		const tr = state
			.transaction()
			.moveNode([quote], 0, [], 1)
			.mergeBlocksAt(target, source)
			.build();
		const history = new HistoryManager();
		history.push(tr);
		const merged = state.apply(tr);
		const mergedBlock = merged.getBlock(target);
		if (!mergedBlock) throw new Error('Expected merged block');
		expect(getBlockText(mergedBlock)).toBe('abcdef');
		expect(merged.getBlock(source)).toBeUndefined();
		const restored = history.undo(merged)?.state;
		expect(restored?.doc).toEqual(state.doc);
		expect(restored?.selection).toEqual(state.selection);
		if (!restored) throw new Error('Expected undo');
		expect(history.redo(restored)?.state.doc).toEqual(merged.doc);
	});

	it('keeps manual builders without a document compatible', () => {
		const builder = new TransactionBuilder(createCollapsedSelection(target, 3), null);
		expect(builder.mergeBlocks(target, source, 3).build().steps).toHaveLength(1);
	});
});

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

	describe('cross-type merge preserves source block identity on undo', () => {
		function createHeadingThenParagraphState(): EditorState {
			const doc = createDocument([
				createBlockNode('heading', [createTextNode('Title')], 'b1', { level: 1 }),
				createBlockNode('paragraph', [createTextNode('body')], 'b2'),
			]);
			return EditorState.create({
				doc,
				selection: createCollapsedSelection('b2', 0),
			});
		}

		it('undo restores the source paragraph as a paragraph after heading+paragraph merge', () => {
			let state = createHeadingThenParagraphState();
			const history = new HistoryManager();

			const tr = state
				.transaction('input')
				.mergeBlocksAt('b1', 'b2')
				.setSelection(createCollapsedSelection('b1', 5))
				.build();

			state = state.apply(tr);
			history.push(tr);
			expect(state.doc.children).toHaveLength(1);
			expect(state.doc.children[0]?.type).toBe('heading');
			expect(getBlockText(state.doc.children[0])).toBe('Titlebody');

			state = history.undo(state)?.state ?? state;
			expect(state.doc.children).toHaveLength(2);
			expect(state.doc.children[0]?.type).toBe('heading');
			expect(state.doc.children[0]?.attrs).toEqual({ level: 1 });
			expect(state.doc.children[1]?.type).toBe('paragraph');
			expect(state.doc.children[1]?.attrs).toBeUndefined();
			expect(getBlockText(state.doc.children[1])).toBe('body');
		});

		it('undo restores source block attrs (e.g. heading level) when both sides carry attrs', () => {
			const doc = createDocument([
				createBlockNode('heading', [createTextNode('Big')], 'b1', { level: 1 }),
				createBlockNode('heading', [createTextNode('small')], 'b2', { level: 3 }),
			]);
			let state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b2', 0),
			});
			const history = new HistoryManager();

			const tr = state
				.transaction('input')
				.mergeBlocksAt('b1', 'b2')
				.setSelection(createCollapsedSelection('b1', 3))
				.build();

			state = state.apply(tr);
			history.push(tr);
			expect(state.doc.children).toHaveLength(1);
			expect(state.doc.children[0]?.attrs).toEqual({ level: 1 });

			state = history.undo(state)?.state ?? state;
			expect(state.doc.children).toHaveLength(2);
			expect(state.doc.children[0]?.attrs).toEqual({ level: 1 });
			expect(state.doc.children[1]?.attrs).toEqual({ level: 3 });
		});

		it('redo after undo reproduces the merged document', () => {
			let state = createHeadingThenParagraphState();
			const history = new HistoryManager();

			const tr = state
				.transaction('input')
				.mergeBlocksAt('b1', 'b2')
				.setSelection(createCollapsedSelection('b1', 5))
				.build();

			const merged = state.apply(tr);
			history.push(tr);

			state = history.undo(merged)?.state ?? merged;
			state = history.redo(state)?.state ?? state;

			expect(state.doc.children).toHaveLength(1);
			expect(state.doc.children[0]?.type).toBe('heading');
			expect(state.doc.children[0]?.attrs).toEqual({ level: 1 });
			expect(getBlockText(state.doc.children[0])).toBe('Titlebody');
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
