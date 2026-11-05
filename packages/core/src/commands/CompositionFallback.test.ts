import { describe, expect, it } from 'vitest';
import { createTextNode, getBlockText, getInlineChildren, isTextNode } from '../model/Document.js';
import { createCollapsedSelection } from '../model/Selection.js';
import { type BlockId, blockId, markType } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import { Mapping } from '../state/Mapping.js';
import type { Transaction } from '../state/Transaction.js';
import { expectCursorAt, stateBuilder } from '../test/TestUtils.js';
import { insertComposedText } from './CompositionFallback.js';

const B1: BlockId = blockId('b1');
const B2: BlockId = blockId('b2');

/** Paragraph `b1` holding `value`, with the composition's selection `[from, to)`. */
function paragraph(value: string, from: number, to: number = from): EditorState {
	return stateBuilder()
		.paragraph(value, 'b1')
		.selection({ blockId: 'b1', offset: from }, { blockId: 'b1', offset: to })
		.schema(['paragraph'], ['bold'])
		.build();
}

function hostInsert(state: EditorState, offset: number, value: string): Transaction {
	return state.transaction('api').insertText(B1, offset, value, []).build();
}

function hostSplit(state: EditorState, offset: number): Transaction {
	return state.transaction('api').splitBlock(B1, offset, B2).build();
}

function text(state: EditorState, id: BlockId = B1): string {
	const block = state.getBlock(id);
	return block ? getBlockText(block) : '';
}

interface FallbackInput {
	/** The state the composition started from. */
	readonly start: EditorState;
	readonly from: number;
	readonly to?: number;
	/** Transactions applied while composing. */
	readonly during: readonly Transaction[];
	/** `false` marks a replaced document, whose positions cannot be mapped. */
	readonly mapped?: boolean;
}

/** Applies `during`, then inserts `value` as the conflict fallback does. */
function fallback(input: FallbackInput, value: string): EditorState {
	let state: EditorState = input.start;
	let mapping: Mapping = Mapping.empty;
	for (const tr of input.during) {
		state = state.apply(tr);
		mapping = mapping.appendMapping(tr.mapping);
	}
	const tr: Transaction | null = insertComposedText(
		state,
		{
			blockId: B1,
			from: input.from,
			to: input.to ?? input.from,
			mapping: input.mapped === false ? null : mapping,
		},
		value,
	);
	if (!tr) throw new Error('expected a transaction');
	return state.apply(tr);
}

describe('insertComposedText (#266)', () => {
	it('replaces the selection and keeps a host insertion inside it', () => {
		const start = paragraph('hello world', 0, 5);

		const next = fallback({ start, from: 0, to: 5, during: [hostInsert(start, 2, 'Z')] }, 'x');

		expect(text(next)).toBe('xZ world');
		expectCursorAt(next, 'b1', 1);
	});

	it('inserts at the caret mapped over a host insertion in front of it', () => {
		const start = paragraph('hello', 5);

		const next = fallback({ start, from: 5, during: [hostInsert(start, 0, 'Z')] }, 'wo');

		expect(text(next)).toBe('Zhellowo');
		expectCursorAt(next, 'b1', 8);
	});

	it('inserts behind a host insertion at the caret', () => {
		const start = paragraph('hello', 5);

		const next = fallback({ start, from: 5, during: [hostInsert(start, 5, 'Z')] }, 'wo');

		expect(text(next)).toBe('helloZwo');
	});

	it('follows a split in front of the caret into the new block', () => {
		const start = paragraph('hello world', 11);

		const next = fallback({ start, from: 11, during: [hostSplit(start, 5)] }, 'x');

		expect(text(next)).toBe('hello');
		expect(text(next, B2)).toBe(' worldx');
		expectCursorAt(next, 'b2', 7);
	});

	it('replaces both parts of a selection a split cut apart', () => {
		const start = paragraph('hello world', 3, 8);

		const next = fallback({ start, from: 3, to: 8, during: [hostSplit(start, 5)] }, 'x');

		expect(text(next)).toBe('helx');
		expect(text(next, B2)).toBe('rld');
		expectCursorAt(next, 'b1', 4);
	});

	it('inserts where the selection was when the host deleted all of it', () => {
		const start = paragraph('hello world', 0, 5);
		const hostDelete = start.transaction('api').deleteTextAt(B1, 0, 5).build();

		const next = fallback({ start, from: 0, to: 5, during: [hostDelete] }, 'x');

		expect(text(next)).toBe('x world');
		expectCursorAt(next, 'b1', 1);
	});

	it('gives the text the marks of the text it replaces', () => {
		const bold = { type: markType('bold') };
		const start = stateBuilder()
			.blockWithInlines(
				'paragraph',
				[createTextNode('hello', [bold]), createTextNode(' world')],
				'b1',
			)
			.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
			.schema(['paragraph'], ['bold'])
			.build();

		const next = fallback({ start, from: 0, to: 5, during: [hostInsert(start, 2, 'Z')] }, 'x');

		const block = next.getBlock(B1);
		const first = block ? getInlineChildren(block)[0] : undefined;
		expect(first && isTextNode(first) ? [first.text, first.marks] : null).toEqual(['x', [bold]]);
	});

	it('inserts at the current selection without a mapping', () => {
		const start = paragraph('hello', 5);
		const moved = start.transaction('api').setSelection(createCollapsedSelection(B1, 2)).build();

		const next = fallback({ start, from: 5, during: [moved], mapped: false }, 'x');

		expect(text(next)).toBe('hexllo');
	});

	it('inserts at the current selection when the caret position was deleted', () => {
		const start = paragraph('hello world', 5);
		const hostDelete = start
			.transaction('api')
			.deleteTextAt(B1, 3, 7)
			.setSelection(createCollapsedSelection(B1, 3))
			.build();

		const next = fallback({ start, from: 5, during: [hostDelete] }, 'x');

		expect(text(next)).toBe('helxorld');
	});

	it('inserts at the current selection when a block the mapping points into is gone', () => {
		const start = paragraph('hello world', 3, 8);
		const split: Transaction = hostSplit(start, 5);
		// A replace without steps that kept the composition block but dropped the split-off block.
		const replaced: EditorState = paragraph('hello', 5);

		const tr = insertComposedText(
			replaced,
			{ blockId: B1, from: 3, to: 8, mapping: split.mapping },
			'x',
		);

		expect(tr ? text(replaced.apply(tr)) : null).toBe('hellox');
	});

	it('returns null when there is no text to insert', () => {
		const start = paragraph('hello', 5);

		expect(
			insertComposedText(start, { blockId: B1, from: 5, to: 5, mapping: Mapping.empty }, ''),
		).toBeNull();
	});
});
