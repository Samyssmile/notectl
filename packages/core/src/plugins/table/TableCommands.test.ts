import { describe, expect, it } from 'vitest';
import {
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockChildren,
} from '../../model/Document.js';
import { createCollapsedSelection, createNodeSelection } from '../../model/Selection.js';
import type { BlockId, NodeTypeName } from '../../model/TypeBrands.js';
import { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import {
	buildDeleteColumnTransaction,
	buildDeleteRowTransaction,
	buildInsertColumnTransaction,
	buildInsertRowTransaction,
	createDeleteTableTransaction,
	deleteTable,
} from './TableCommands.js';
import { TABLE_SCHEMA, createTableState, createTestTableNode } from './TableTestUtils.js';

// --- Test-specific Helpers ---

function createMockContext(initialState: EditorState) {
	let currentState = initialState;
	return {
		context: {
			getState: () => currentState,
			dispatch: (tr: Transaction) => {
				currentState = currentState.apply(tr);
			},
			announce: () => {},
		} as unknown as PluginContext,
		getState: () => currentState,
	};
}

// --- Tests ---

describe('buildInsertRowTransaction', () => {
	it('inserts a new row at the given index', () => {
		const state = createTableState({ rows: 2, cols: 3 });
		const tr = buildInsertRowTransaction(state, 't1' as BlockId, 1);

		expect(tr).not.toBeNull();
		if (!tr) return;

		const nextState = state.apply(tr);
		const table = nextState.getBlock('t1' as BlockId);
		expect(table).toBeDefined();
		if (!table) return;

		const rows = getBlockChildren(table);
		expect(rows).toHaveLength(3);
	});

	it('creates a row with matching column count', () => {
		const state = createTableState({ rows: 2, cols: 4 });
		const tr = buildInsertRowTransaction(state, 't1' as BlockId, 0);

		expect(tr).not.toBeNull();
		if (!tr) return;

		const nextState = state.apply(tr);
		const table = nextState.getBlock('t1' as BlockId);
		if (!table) return;

		const newRow = getBlockChildren(table)[0];
		expect(newRow).toBeDefined();
		if (!newRow) return;
		expect(getBlockChildren(newRow)).toHaveLength(4);
	});

	it('returns null for unknown table id', () => {
		const state = createTableState({ rows: 2, cols: 2 });
		expect(buildInsertRowTransaction(state, 'missing' as BlockId, 0)).toBeNull();
	});

	it('moves cursor to first cell of new row', () => {
		const state = createTableState({ rows: 2, cols: 2 });
		const tr = buildInsertRowTransaction(state, 't1' as BlockId, 1);

		expect(tr).not.toBeNull();
		if (!tr) return;

		const nextState = state.apply(tr);
		// Cursor should be in the new row (not in one of the original rows)
		const table = nextState.getBlock('t1' as BlockId);
		if (!table) return;

		const newRow = getBlockChildren(table)[1];
		if (!newRow) return;
		const firstCell = getBlockChildren(newRow)[0];
		if (!firstCell) return;
		const firstPara = getBlockChildren(firstCell)[0];
		if (!firstPara) return;

		expect(nextState.selection.anchor.blockId).toBe(firstPara.id);
		expect(nextState.selection.anchor.offset).toBe(0);
	});
});

describe('buildInsertColumnTransaction', () => {
	it('inserts a new column at the given index', () => {
		const state = createTableState({ rows: 2, cols: 2 });
		const tr = buildInsertColumnTransaction(state, 't1' as BlockId, 1);

		expect(tr).not.toBeNull();
		if (!tr) return;

		const nextState = state.apply(tr);
		const table = nextState.getBlock('t1' as BlockId);
		if (!table) return;

		const firstRow = getBlockChildren(table)[0];
		if (!firstRow) return;
		expect(getBlockChildren(firstRow)).toHaveLength(3);
	});

	it('inserts column in every row', () => {
		const state = createTableState({ rows: 3, cols: 2 });
		const tr = buildInsertColumnTransaction(state, 't1' as BlockId, 0);

		expect(tr).not.toBeNull();
		if (!tr) return;

		const nextState = state.apply(tr);
		const table = nextState.getBlock('t1' as BlockId);
		if (!table) return;

		const rows = getBlockChildren(table);
		for (const row of rows) {
			expect(getBlockChildren(row)).toHaveLength(3);
		}
	});

	it('returns null for unknown table id', () => {
		const state = createTableState({ rows: 2, cols: 2 });
		expect(buildInsertColumnTransaction(state, 'missing' as BlockId, 0)).toBeNull();
	});
});

describe('buildDeleteRowTransaction', () => {
	it('removes the row at the given index', () => {
		const state = createTableState({ rows: 3, cols: 2 });
		const tr = buildDeleteRowTransaction(state, 't1' as BlockId, 1);

		expect(tr).not.toBeNull();
		if (!tr) return;

		const nextState = state.apply(tr);
		const table = nextState.getBlock('t1' as BlockId);
		if (!table) return;

		expect(getBlockChildren(table)).toHaveLength(2);
	});

	it('deletes the entire table when only one row remains', () => {
		const state = createTableState({ rows: 1, cols: 2 });
		const tr = buildDeleteRowTransaction(state, 't1' as BlockId, 0);

		expect(tr).not.toBeNull();
		if (!tr) return;

		const nextState = state.apply(tr);
		expect(nextState.getBlock('t1' as BlockId)).toBeUndefined();
	});

	it('returns null for unknown table id', () => {
		const state = createTableState({ rows: 2, cols: 2 });
		expect(buildDeleteRowTransaction(state, 'missing' as BlockId, 0)).toBeNull();
	});

	it('places cursor in preferred column after deletion', () => {
		const state = createTableState({ rows: 3, cols: 3 });
		const tr = buildDeleteRowTransaction(state, 't1' as BlockId, 1, 2);

		expect(tr).not.toBeNull();
		if (!tr) return;

		const nextState = state.apply(tr);
		// Cursor should be in the leaf paragraph of row 0, col 2
		expect(nextState.selection.anchor.blockId).toBe('p0_2');
		expect(nextState.selection.anchor.offset).toBe(0);
	});

	it('places cursor on leaf paragraph, not cell directly', () => {
		const state = createTableState({ rows: 2, cols: 2 });
		const tr = buildDeleteRowTransaction(state, 't1' as BlockId, 1);

		expect(tr).not.toBeNull();
		if (!tr) return;

		const nextState = state.apply(tr);
		// Should land on p0_0 (paragraph inside cell), not c0_0 (the cell itself)
		expect(nextState.selection.anchor.blockId).toBe('p0_0');
	});
});

describe('buildDeleteColumnTransaction', () => {
	it('removes the column at the given index from all rows', () => {
		const state = createTableState({ rows: 2, cols: 3 });
		const tr = buildDeleteColumnTransaction(state, 't1' as BlockId, 1);

		expect(tr).not.toBeNull();
		if (!tr) return;

		const nextState = state.apply(tr);
		const table = nextState.getBlock('t1' as BlockId);
		if (!table) return;

		const rows = getBlockChildren(table);
		for (const row of rows) {
			expect(getBlockChildren(row)).toHaveLength(2);
		}
	});

	it('deletes the entire table when only one column remains', () => {
		const state = createTableState({ rows: 2, cols: 1 });
		const tr = buildDeleteColumnTransaction(state, 't1' as BlockId, 0);

		expect(tr).not.toBeNull();
		if (!tr) return;

		const nextState = state.apply(tr);
		expect(nextState.getBlock('t1' as BlockId)).toBeUndefined();
	});

	it('returns null for unknown table id', () => {
		const state = createTableState({ rows: 2, cols: 2 });
		expect(buildDeleteColumnTransaction(state, 'missing' as BlockId, 0)).toBeNull();
	});

	it('places cursor in preferred row after deletion', () => {
		const state = createTableState({ rows: 3, cols: 3 });
		const tr = buildDeleteColumnTransaction(state, 't1' as BlockId, 1, 2);

		expect(tr).not.toBeNull();
		if (!tr) return;

		const nextState = state.apply(tr);
		// Cursor should be in the leaf paragraph of row 2, col 0
		expect(nextState.selection.anchor.blockId).toBe('p2_0');
		expect(nextState.selection.anchor.offset).toBe(0);
	});

	it('places cursor on leaf paragraph, not cell directly', () => {
		const state = createTableState({ rows: 2, cols: 2 });
		const tr = buildDeleteColumnTransaction(state, 't1' as BlockId, 1);

		expect(tr).not.toBeNull();
		if (!tr) return;

		const nextState = state.apply(tr);
		// Should land on p0_0 (paragraph inside cell), not c0_0
		expect(nextState.selection.anchor.blockId).toBe('p0_0');
	});
});

describe('createDeleteTableTransaction', () => {
	it('removes table and moves cursor to next root block', () => {
		const { table } = createTestTableNode(1, 1);
		const doc = createDocument([
			createBlockNode('paragraph' as NodeTypeName, [createTextNode('before')], 'before' as BlockId),
			table,
			createBlockNode('paragraph' as NodeTypeName, [createTextNode('after')], 'after' as BlockId),
		]);
		const state = EditorState.create({
			doc,
			selection: createCollapsedSelection('p0_0' as BlockId, 0),
			schema: TABLE_SCHEMA,
		});

		const tr = createDeleteTableTransaction(state, 't1' as BlockId);
		expect(tr).not.toBeNull();
		if (!tr) return;

		const nextState = state.apply(tr);
		expect(nextState.doc.children.map((node) => node.id)).toEqual(['before', 'after']);
		expect(nextState.selection.anchor.blockId).toBe('after');
		expect(nextState.selection.anchor.offset).toBe(0);
	});

	it('removes table and moves cursor to previous root block when no next exists', () => {
		const { table } = createTestTableNode(1, 1);
		const doc = createDocument([
			createBlockNode('paragraph' as NodeTypeName, [createTextNode('before')], 'before' as BlockId),
			table,
		]);
		const state = EditorState.create({
			doc,
			selection: createCollapsedSelection('p0_0' as BlockId, 0),
			schema: TABLE_SCHEMA,
		});

		const tr = createDeleteTableTransaction(state, 't1' as BlockId);
		expect(tr).not.toBeNull();
		if (!tr) return;

		const nextState = state.apply(tr);
		expect(nextState.doc.children.map((node) => node.id)).toEqual(['before']);
		expect(nextState.selection.anchor.blockId).toBe('before');
	});

	it('returns null for unknown table id', () => {
		const doc = createDocument([
			createBlockNode('paragraph' as NodeTypeName, [createTextNode('before')], 'before' as BlockId),
		]);
		const state = EditorState.create({
			doc,
			selection: createCollapsedSelection('before' as BlockId, 0),
			schema: TABLE_SCHEMA,
		});

		expect(createDeleteTableTransaction(state, 'missing' as BlockId)).toBeNull();
	});
});

describe('deleteTable', () => {
	it('deletes surrounding table from text selection', () => {
		const state = createTableState({ rows: 2, cols: 2 });
		const { context, getState } = createMockContext(state);

		expect(deleteTable(context)).toBe(true);
		expect(getState().getBlock('t1' as BlockId)).toBeUndefined();
	});

	it('deletes selected table from node selection', () => {
		const { table } = createTestTableNode(1, 1);
		let currentState = EditorState.create({
			doc: createDocument([
				createBlockNode(
					'paragraph' as NodeTypeName,
					[createTextNode('before')],
					'before' as BlockId,
				),
				table,
			]),
			selection: createNodeSelection('t1' as BlockId, ['t1' as BlockId]),
			schema: TABLE_SCHEMA,
		});

		const context = {
			getState: () => currentState,
			dispatch: (tr: Transaction) => {
				currentState = currentState.apply(tr);
			},
			announce: () => {},
		} as unknown as PluginContext;

		expect(deleteTable(context)).toBe(true);
		expect(currentState.doc.children.map((node) => node.id)).toEqual(['before']);
	});
});
