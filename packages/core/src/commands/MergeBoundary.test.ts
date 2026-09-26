import { describe, expect, it } from 'vitest';
import {
	type BlockNode,
	createBlockNode,
	createDocument,
	createTextNode,
} from '../model/Document.js';
import type { Schema } from '../model/Schema.js';
import { createCollapsedSelection, createNodeSelection } from '../model/Selection.js';
import { blockId } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import { HistoryManager } from '../state/History.js';
import { deleteBackward, deleteForward } from './Commands.js';

const paragraph = (id: string): BlockNode =>
	createBlockNode('paragraph', [createTextNode('abc')], blockId(id));

const SCHEMA: Schema = {
	nodeTypes: ['paragraph', 'blockquote', 'list_item', 'table', 'table_row', 'table_cell', 'image'],
	markTypes: [],
	getNodeSpec: (type) => ({
		type,
		isolating: type === 'table_cell',
		isVoid: type === 'image',
		toDOM: () => document.createElement('div'),
	}),
};

const containers: readonly BlockNode[] = [
	createBlockNode('blockquote', [paragraph('inside')], blockId('quote')),
	createBlockNode(
		'list_item',
		[createBlockNode('list_item', [paragraph('inside')], blockId('nested'))],
		blockId('list'),
	),
	createBlockNode(
		'table',
		[
			createBlockNode(
				'table_row',
				[createBlockNode('table_cell', [paragraph('inside')], blockId('cell'))],
				blockId('row'),
			),
		],
		blockId('table'),
	),
];

describe('deletion at container boundaries (#225)', () => {
	for (const container of containers) {
		for (const backward of [false, true]) {
			const command = backward ? deleteBackward : deleteForward;
			const name = backward ? 'Backspace' : 'Delete';
			for (const cursorInside of [false, true]) {
				it(`${name} ${cursorInside ? 'inside' : 'outside'} ${container.type} preserves state and history`, () => {
					const outside = paragraph('outside');
					const doc = createDocument(
						backward !== cursorInside ? [container, outside] : [outside, container],
					);
					const id = blockId(cursorInside ? 'inside' : 'outside');
					const initial = EditorState.create({
						doc,
						selection: createCollapsedSelection(id, backward ? 0 : 3),
						schema: SCHEMA,
					});
					const history = new HistoryManager();
					let state = initial;
					const attemptDelete = (): void => {
						const before = state;
						const tr = command(state);
						if (tr) {
							state = state.apply(tr);
							history.push(tr);
						}
						expect(state.doc).toEqual(before.doc);
						expect(state.selection).toEqual(before.selection);
						expect(tr).toBeNull();
					};

					attemptDelete();
					expect(history.canUndo()).toBe(false);
					// Seed a real edit without moving the cursor away from the boundary.
					const edit = state
						.transaction('command')
						.insertText(id, 0, 'x', [])
						.setSelection(createCollapsedSelection(id, backward ? 0 : 4))
						.build();
					state = state.apply(edit);
					history.push(edit);
					const edited = state;
					attemptDelete();
					const undo = history.undo(state);
					expect(undo?.state.doc).toEqual(initial.doc);
					expect(undo?.state.selection).toEqual(initial.selection);
					if (!undo) throw new Error('Expected undo');
					state = undo.state;
					attemptDelete();
					expect(history.canUndo()).toBe(false);
					expect(history.canRedo()).toBe(true);
					const redo = history.redo(state);
					expect(redo?.state.doc).toEqual(edited.doc);
					expect(redo?.state.selection).toEqual(edited.selection);
				});
			}
		}
	}

	it('still selects an adjacent void across a non-isolating boundary', () => {
		const state = EditorState.create({
			doc: createDocument([
				paragraph('p'),
				createBlockNode('blockquote', [createBlockNode('image', [], blockId('img'))], blockId('q')),
			]),
			selection: createCollapsedSelection(blockId('p'), 3),
			schema: SCHEMA,
		});
		const tr = deleteForward(state);
		if (!tr) throw new Error('Expected void selection');
		expect(tr.steps).toEqual([]);
		expect(state.apply(tr).selection).toEqual(
			createNodeSelection(blockId('img'), [blockId('q'), blockId('img')]),
		);
	});
});
