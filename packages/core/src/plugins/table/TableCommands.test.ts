import { describe, expect, it } from 'vitest';
import { createBlockNode, createDocument, createTextNode } from '../../model/Document.js';
import { createCollapsedSelection, createNodeSelection } from '../../model/Selection.js';
import type { BlockId, NodeTypeName } from '../../model/TypeBrands.js';
import { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import { createDeleteTableTransaction, deleteTable } from './TableCommands.js';

function createTableNode(tableId = 't1', rowId = 'r1', cellId = 'c1') {
	return createBlockNode(
		'table' as NodeTypeName,
		[
			createBlockNode(
				'table_row' as NodeTypeName,
				[
					createBlockNode(
						'table_cell' as NodeTypeName,
						[createTextNode('')],
						cellId as BlockId,
					),
				],
				rowId as BlockId,
			),
		],
		tableId as BlockId,
	);
}

function createSchema() {
	return {
		nodeTypes: ['paragraph', 'table', 'table_row', 'table_cell'],
		markTypes: ['bold', 'italic', 'underline'],
	};
}

describe('TableCommands.createDeleteTableTransaction', () => {
	it('removes table and moves cursor to next root block', () => {
		const doc = createDocument([
			createBlockNode('paragraph' as NodeTypeName, [createTextNode('before')], 'b1' as BlockId),
			createTableNode('t1', 'r1', 'c1'),
			createBlockNode('paragraph' as NodeTypeName, [createTextNode('after')], 'b2' as BlockId),
		]);
		const state = EditorState.create({
			doc,
			selection: createCollapsedSelection('c1' as BlockId, 0),
			schema: createSchema(),
		});

		const tr = createDeleteTableTransaction(state, 't1' as BlockId);
		expect(tr).not.toBeNull();
		if (!tr) return;

		const nextState = state.apply(tr);
		expect(nextState.doc.children.map((node) => node.id)).toEqual(['b1', 'b2']);
		expect(nextState.selection.anchor.blockId).toBe('b2');
		expect(nextState.selection.anchor.offset).toBe(0);
	});

	it('removes table and moves cursor to previous root block when no next exists', () => {
		const doc = createDocument([
			createBlockNode('paragraph' as NodeTypeName, [createTextNode('before')], 'b1' as BlockId),
			createTableNode('t1', 'r1', 'c1'),
		]);
		const state = EditorState.create({
			doc,
			selection: createCollapsedSelection('c1' as BlockId, 0),
			schema: createSchema(),
		});

		const tr = createDeleteTableTransaction(state, 't1' as BlockId);
		expect(tr).not.toBeNull();
		if (!tr) return;

		const nextState = state.apply(tr);
		expect(nextState.doc.children.map((node) => node.id)).toEqual(['b1']);
		expect(nextState.selection.anchor.blockId).toBe('b1');
		expect(nextState.selection.anchor.offset).toBe(0);
	});

	it('returns null for unknown table id', () => {
		const doc = createDocument([
			createBlockNode('paragraph' as NodeTypeName, [createTextNode('before')], 'b1' as BlockId),
		]);
		const state = EditorState.create({
			doc,
			selection: createCollapsedSelection('b1' as BlockId, 0),
			schema: createSchema(),
		});

		expect(createDeleteTableTransaction(state, 'missing' as BlockId)).toBeNull();
	});
});

describe('TableCommands.deleteTable', () => {
	it('deletes surrounding table from text selection', () => {
		let currentState = EditorState.create({
			doc: createDocument([
				createBlockNode(
					'paragraph' as NodeTypeName,
					[createTextNode('before')],
					'b1' as BlockId,
				),
				createTableNode('t1', 'r1', 'c1'),
				createBlockNode('paragraph' as NodeTypeName, [createTextNode('after')], 'b2' as BlockId),
			]),
			selection: createCollapsedSelection('c1' as BlockId, 0),
			schema: createSchema(),
		});

		const context = {
			getState: () => currentState,
			dispatch: (tr: Transaction) => {
				currentState = currentState.apply(tr);
			},
		} as unknown as PluginContext;

		expect(deleteTable(context)).toBe(true);
		expect(currentState.doc.children.map((node) => node.id)).toEqual(['b1', 'b2']);
	});

	it('deletes selected table from node selection', () => {
		let currentState = EditorState.create({
			doc: createDocument([
				createBlockNode(
					'paragraph' as NodeTypeName,
					[createTextNode('before')],
					'b1' as BlockId,
				),
				createTableNode('t1', 'r1', 'c1'),
			]),
			selection: createNodeSelection('t1' as BlockId, ['t1' as BlockId]),
			schema: createSchema(),
		});

		const context = {
			getState: () => currentState,
			dispatch: (tr: Transaction) => {
				currentState = currentState.apply(tr);
			},
		} as unknown as PluginContext;

		expect(deleteTable(context)).toBe(true);
		expect(currentState.doc.children.map((node) => node.id)).toEqual(['b1']);
	});
});
