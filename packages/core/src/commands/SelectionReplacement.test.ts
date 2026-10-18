import { describe, expect, it } from 'vitest';
import {
	type BlockNode,
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockText,
} from '../model/Document.js';
import {
	type EditorSelection,
	type Position,
	createCollapsedSelection,
	createGapCursor,
	createNodeSelection,
	createSelection,
} from '../model/Selection.js';
import { blockId, nodeType } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import { getReceivingBlock, resolveReplacementTarget } from './SelectionReplacement.js';

function paragraph(id: string, text: string): BlockNode {
	return createBlockNode(nodeType('paragraph'), [createTextNode(text)], blockId(id));
}

function rootState(selection: EditorSelection): EditorState {
	return EditorState.create({
		doc: createDocument([
			paragraph('p1', 'abcd'),
			paragraph('p2', 'efgh'),
			paragraph('p3', 'ijkl'),
			paragraph('p4', 'mnop'),
		]),
		selection,
	});
}

const START: Position = { blockId: blockId('p1'), offset: 1 };
const END: Position = { blockId: blockId('p3'), offset: 2 };

describe('resolveReplacementTarget', () => {
	it('keeps a collapsed caret and records no steps', () => {
		// Arrange
		const state = rootState(createCollapsedSelection(blockId('p2'), 3));
		const builder = state.transaction('paste');

		// Act
		const target = resolveReplacementTarget(state, builder);

		// Assert
		expect(target).toEqual({ state, blockId: 'p2', offset: 3, placement: 'inside' });
		expect(builder.build().steps).toEqual([]);
	});

	for (const [direction, anchor, head] of [
		['forward', START, END],
		['backward', END, START],
	] as const) {
		it(`resolves a ${direction} range to its start in the document after deletion`, () => {
			// Arrange
			const state = rootState(createSelection(anchor, head));
			const builder = state.transaction('paste');

			// Act
			const target = resolveReplacementTarget(state, builder);

			// Assert
			expect(target.blockId).toBe('p1');
			expect(target.offset).toBe(1);
			expect(target.placement).toBe('inside');
			expect(target.state.doc).toEqual(state.apply(builder.build()).doc);
			expect(target.state.doc.children.map(getBlockText)).toEqual(['akl', 'mnop']);
			expect(target.state.getBlock(blockId('p3'))).toBeUndefined();
		});
	}

	it('targets the landing block when the deletion removes the start block', () => {
		// Arrange
		const cell = createBlockNode(
			nodeType('table_cell'),
			[paragraph('cell-text', 'cell')],
			blockId('cell'),
		);
		const table = createBlockNode(
			nodeType('table'),
			[createBlockNode(nodeType('table_row'), [cell], blockId('row'))],
			blockId('table'),
		);
		const quote = createBlockNode(
			nodeType('blockquote'),
			[paragraph('q1', 'abcd'), paragraph('q2', 'efgh')],
			blockId('quote'),
		);
		const state = EditorState.create({
			doc: createDocument([table, quote]),
			selection: createSelection(
				{ blockId: blockId('q2'), offset: 2 },
				{ blockId: blockId('cell-text'), offset: 0 },
			),
		});
		const builder = state.transaction('paste');

		// Act
		const target = resolveReplacementTarget(state, builder);

		// Assert
		expect(state.getBlock(target.blockId)).toBeUndefined();
		expect(target.state.getBlock(target.blockId)).toBeDefined();
		expect(target.offset).toBe(0);
		expect(target.placement).toBe('inside');
	});

	for (const selection of [
		createNodeSelection(blockId('p2'), [blockId('p2')]),
		createGapCursor(blockId('p2'), 'after', [blockId('p2')]),
	]) {
		it(`resolves a ${selection.type} selection beside its block without deleting`, () => {
			// Arrange
			const state = rootState(selection);
			const builder = state.transaction('paste');

			// Act
			const target = resolveReplacementTarget(state, builder);

			// Assert
			expect(target).toEqual({ state, blockId: 'p2', offset: 0, placement: 'beside' });
			expect(builder.build().steps).toEqual([]);
		});
	}
});

describe('getReceivingBlock', () => {
	it('returns the block that receives the content, after the deletion', () => {
		// Arrange
		const state = rootState(createSelection(END, START));

		// Act
		const block = getReceivingBlock(resolveReplacementTarget(state, state.transaction('paste')));

		// Assert
		expect(block?.id).toBe('p1');
		expect(block && getBlockText(block)).toBe('akl');
	});

	for (const selection of [
		createNodeSelection(blockId('p2'), [blockId('p2')]),
		createGapCursor(blockId('p2'), 'after', [blockId('p2')]),
	]) {
		it(`returns nothing for a ${selection.type} selection, whose block receives nothing`, () => {
			// Arrange
			const state = rootState(selection);

			// Act
			const block = getReceivingBlock(resolveReplacementTarget(state, state.transaction('paste')));

			// Assert
			expect(block).toBeUndefined();
		});
	}
});
