import { describe, expect, it } from 'vitest';
import {
	type BlockAttrs,
	type BlockNode,
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockChildren,
} from '../../model/Document.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	isNodeSelection,
} from '../../model/Selection.js';
import type { BlockId, NodeTypeName } from '../../model/TypeBrands.js';
import { EditorState } from '../../state/EditorState.js';
import { HistoryManager } from '../../state/History.js';
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
import { createTableGrid } from './TableGrid.js';
import { TABLE_LOCALE_EN } from './TableLocale.js';
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

	it('replaces the only root table with an empty paragraph', () => {
		const { table } = createTestTableNode(1, 1);
		const doc = createDocument([table]);
		const state = EditorState.create({
			doc,
			selection: createCollapsedSelection('p0_0' as BlockId, 0),
			schema: TABLE_SCHEMA,
		});

		const tr = createDeleteTableTransaction(state, 't1' as BlockId);
		expect(tr).not.toBeNull();
		if (!tr) return;

		const nextState = state.apply(tr);
		expect(nextState.doc.children).toHaveLength(1);
		expect(nextState.doc.children[0]?.type).toBe('paragraph');
		expect(nextState.getBlock('t1' as BlockId)).toBeUndefined();
		expect(nextState.getBlock(nextState.selection.anchor.blockId)).toBeDefined();
		expect(nextState.selection.anchor.offset).toBe(0);
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

	it('moves selection into the next table leaf instead of selecting the table root', () => {
		const { table: tableToDelete } = createTestTableNode(1, 1);
		const nextTable = createBlockNode(
			'table' as NodeTypeName,
			[
				createBlockNode(
					'table_row' as NodeTypeName,
					[
						createBlockNode(
							'table_cell' as NodeTypeName,
							[
								createBlockNode(
									'paragraph' as NodeTypeName,
									[createTextNode('next')],
									'next-paragraph' as BlockId,
								),
							],
							'next-cell' as BlockId,
						),
					],
					'next-row' as BlockId,
				),
			],
			'next-table' as BlockId,
		);
		const state = EditorState.create({
			doc: createDocument([tableToDelete, nextTable]),
			selection: createNodeSelection('t1' as BlockId, ['t1' as BlockId]),
			schema: TABLE_SCHEMA,
		});

		const tr = createDeleteTableTransaction(state, 't1' as BlockId);
		expect(tr).not.toBeNull();
		if (!tr) return;

		const nextState = state.apply(tr);
		expect(nextState.doc.children.map((node) => node.id)).toEqual(['next-table']);
		expect(isNodeSelection(nextState.selection)).toBe(false);
		if (!isNodeSelection(nextState.selection)) {
			expect(nextState.selection.anchor.blockId).toBe('next-paragraph');
			expect(nextState.selection.anchor.offset).toBe(0);
		}
	});

	it('creates a NodeSelection when the next root block is void', () => {
		const { table } = createTestTableNode(1, 1);
		const image = createBlockNode('image' as NodeTypeName, [], 'img1' as BlockId);
		const state = EditorState.create({
			doc: createDocument([table, image]),
			selection: createCollapsedSelection('p0_0' as BlockId, 0),
			schema: {
				nodeTypes: ['paragraph', 'table', 'table_row', 'table_cell', 'image'],
				markTypes: [],
				getNodeSpec(type: string) {
					return type === 'image'
						? {
								type,
								group: 'block',
								isVoid: true,
								toDOM() {
									return document.createElement('div');
								},
							}
						: undefined;
				},
			},
		});

		const tr = createDeleteTableTransaction(state, 't1' as BlockId);
		expect(tr).not.toBeNull();
		if (!tr) return;

		const nextState = state.apply(tr);
		expect(isNodeSelection(nextState.selection)).toBe(true);
		if (isNodeSelection(nextState.selection)) {
			expect(nextState.selection.nodeId).toBe('img1');
		}
	});
});

describe('deleteTable', () => {
	it('deletes surrounding table from text selection', () => {
		const state = createTableState({ rows: 2, cols: 2 });
		const { context, getState } = createMockContext(state);

		expect(deleteTable(context, TABLE_LOCALE_EN)).toBe(true);
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

		expect(deleteTable(context, TABLE_LOCALE_EN)).toBe(true);
		expect(currentState.doc.children.map((node) => node.id)).toEqual(['before']);
	});
});

// --- Logical-grid, span, and dimension metadata invariants ---

function spanTestCell(id: string, attrs?: BlockAttrs): BlockNode {
	return createBlockNode(
		'table_cell' as NodeTypeName,
		[createBlockNode('paragraph' as NodeTypeName, [createTextNode(id)], `p-${id}` as BlockId)],
		id as BlockId,
		attrs,
	);
}

function spanTestRow(id: string, cells: readonly BlockNode[], attrs?: BlockAttrs): BlockNode {
	return createBlockNode('table_row' as NodeTypeName, cells, id as BlockId, attrs);
}

function spanTestState(table: BlockNode, caret = 'p-a'): EditorState {
	return EditorState.create({
		doc: createDocument([table]),
		selection: createCollapsedSelection(caret as BlockId, 0),
		schema: TABLE_SCHEMA,
	});
}

function spanningDimensionTable(): BlockNode {
	return createBlockNode(
		'table' as NodeTypeName,
		[
			spanTestRow('r0', [spanTestCell('a', { colspan: 2, rowspan: 2 }), spanTestCell('b')], {
				minHeightPx: 30,
			}),
			spanTestRow('r1', [spanTestCell('c')], { minHeightPx: 40 }),
		],
		't1' as BlockId,
		{ borderColor: '#123456', columnWidthsPx: [80, 100, 120] },
	);
}

function expectHistoryRoundTrip(state: EditorState, transaction: Transaction): void {
	const history = new HistoryManager();
	history.push(transaction);
	const after = state.apply(transaction);
	const undone = history.undo(after);
	expect(undone?.state.doc).toEqual(state.doc);
	const redone = undone ? history.redo(undone.state) : null;
	expect(redone?.state.doc).toEqual(after.doc);
}

function plainDimensionTable(): BlockNode {
	return createBlockNode(
		'table' as NodeTypeName,
		[
			spanTestRow('r0', [spanTestCell('a'), spanTestCell('b'), spanTestCell('c')], {
				minHeightPx: 30,
			}),
			spanTestRow('r1', [spanTestCell('d'), spanTestCell('e'), spanTestCell('f')], {
				minHeightPx: 40,
			}),
		],
		't1' as BlockId,
		{ columnWidthsPx: [80, 100, 120] },
	);
}

describe('plain-table dimension splicing (#209)', () => {
	it('splices column metadata when the first logical column is deleted and inverts exactly', () => {
		const state = spanTestState(plainDimensionTable());
		const transaction = buildDeleteColumnTransaction(state, 't1' as BlockId, 0);
		expect(transaction).not.toBeNull();
		if (!transaction) return;

		const next = state.apply(transaction);
		expect(next.getBlock('t1' as BlockId)?.attrs?.columnWidthsPx).toEqual([100, 120]);
		expectHistoryRoundTrip(state, transaction);
	});

	it('splices column metadata when the last logical column is deleted', () => {
		const state = spanTestState(plainDimensionTable());
		const transaction = buildDeleteColumnTransaction(state, 't1' as BlockId, 2);
		expect(transaction).not.toBeNull();
		if (!transaction) return;

		const next = state.apply(transaction);
		expect(next.getBlock('t1' as BlockId)?.attrs?.columnWidthsPx).toEqual([80, 100]);
		expectHistoryRoundTrip(state, transaction);
	});

	it('appends an automatic width when a trailing column is inserted', () => {
		const state = spanTestState(plainDimensionTable());
		const transaction = buildInsertColumnTransaction(state, 't1' as BlockId, 3);
		expect(transaction).not.toBeNull();
		if (!transaction) return;

		const next = state.apply(transaction);
		expect(next.getBlock('t1' as BlockId)?.attrs?.columnWidthsPx).toEqual([80, 100, 120, null]);
		expectHistoryRoundTrip(state, transaction);
	});

	it('preserves the surviving row minimum height when the first row is deleted', () => {
		const state = spanTestState(plainDimensionTable());
		const transaction = buildDeleteRowTransaction(state, 't1' as BlockId, 0);
		expect(transaction).not.toBeNull();
		if (!transaction) return;

		const next = state.apply(transaction);
		const table = next.getBlock('t1' as BlockId);
		const rows = table ? getBlockChildren(table) : [];
		expect(rows).toHaveLength(1);
		expect(rows[0]?.attrs?.minHeightPx).toBe(40);
		expectHistoryRoundTrip(state, transaction);
	});
});

describe('logical-grid structural transactions', () => {
	it('inserts inside a spanning cell and splices automatic column metadata atomically', () => {
		const state = spanTestState(spanningDimensionTable());
		const transaction = buildInsertColumnTransaction(state, 't1' as BlockId, 1);
		expect(transaction).not.toBeNull();
		if (!transaction) return;

		const next = state.apply(transaction);
		const table = next.getBlock('t1' as BlockId);
		expect(table?.attrs).toMatchObject({
			borderColor: '#123456',
			columnWidthsPx: [80, null, 100, 120],
		});
		expect(next.getBlock('a' as BlockId)?.attrs).toMatchObject({ colspan: 3, rowspan: 2 });
		expect(table ? getBlockChildren(table)[0]?.children : []).toHaveLength(2);
		expect(table ? getBlockChildren(table)[1]?.children : []).toHaveLength(1);
		expect(createTableGrid(table as BlockNode).columnCount).toBe(4);
		expectHistoryRoundTrip(state, transaction);
	});

	it('inserts cells at a span edge instead of expanding the span', () => {
		const state = spanTestState(spanningDimensionTable());
		const transaction = buildInsertColumnTransaction(state, 't1' as BlockId, 2);
		expect(transaction).not.toBeNull();
		if (!transaction) return;

		const next = state.apply(transaction);
		expect(next.getBlock('a' as BlockId)?.attrs?.colspan).toBe(2);
		const table = next.getBlock('t1' as BlockId);
		const rows = table ? getBlockChildren(table) : [];
		expect(rows[0]?.children).toHaveLength(3);
		expect(rows[1]?.children).toHaveLength(2);
		expect(table?.attrs?.columnWidthsPx).toEqual([80, 100, null, 120]);
	});

	it('deletes one covered logical column by shrinking a colspan once', () => {
		const state = spanTestState(spanningDimensionTable());
		const transaction = buildDeleteColumnTransaction(state, 't1' as BlockId, 1);
		expect(transaction).not.toBeNull();
		if (!transaction) return;

		const next = state.apply(transaction);
		expect(next.getBlock('a' as BlockId)?.attrs).toEqual({ rowspan: 2 });
		expect(next.getBlock('t1' as BlockId)?.attrs).toMatchObject({
			borderColor: '#123456',
			columnWidthsPx: [80, 120],
		});
		expectHistoryRoundTrip(state, transaction);
	});

	it('inserts a row inside rowspan coverage with only uncovered automatic cells', () => {
		const state = spanTestState(spanningDimensionTable());
		const transaction = buildInsertRowTransaction(state, 't1' as BlockId, 1);
		expect(transaction).not.toBeNull();
		if (!transaction) return;

		const next = state.apply(transaction);
		const table = next.getBlock('t1' as BlockId);
		const rows = table ? getBlockChildren(table) : [];
		expect(rows).toHaveLength(3);
		expect(rows[0]?.attrs?.minHeightPx).toBe(30);
		expect(rows[1]?.attrs?.minHeightPx).toBeUndefined();
		expect(rows[2]?.attrs?.minHeightPx).toBe(40);
		expect(rows[1]?.children).toHaveLength(1);
		expect(next.getBlock('a' as BlockId)?.attrs?.rowspan).toBe(3);
		expectHistoryRoundTrip(state, transaction);
	});

	it('moves a rowspan owner into the following row when deleting its start row', () => {
		const state = spanTestState(spanningDimensionTable());
		const transaction = buildDeleteRowTransaction(state, 't1' as BlockId, 0);
		expect(transaction).not.toBeNull();
		if (!transaction) return;

		const next = state.apply(transaction);
		const table = next.getBlock('t1' as BlockId);
		const rows = table ? getBlockChildren(table) : [];
		expect(rows).toHaveLength(1);
		expect(rows[0]?.id).toBe('r1');
		expect(rows[0]?.attrs?.minHeightPx).toBe(40);
		expect(getBlockChildren(rows[0] as BlockNode).map((cell) => cell.id)).toEqual(['a', 'c']);
		expect(next.getBlock('a' as BlockId)?.attrs).toEqual({ colspan: 2 });
		expect(next.getBlock('p-a' as BlockId)).toBeDefined();
		expectHistoryRoundTrip(state, transaction);
	});

	it('shrinks a rowspan from an earlier row while naturally removing only the deleted row height', () => {
		const table = createBlockNode(
			'table' as NodeTypeName,
			[
				spanTestRow('r0', [spanTestCell('a', { rowspan: 3 }), spanTestCell('b')], {
					minHeightPx: 25,
				}),
				spanTestRow('r1', [spanTestCell('c')], { minHeightPx: 35 }),
				spanTestRow('r2', [spanTestCell('d')], { minHeightPx: 45 }),
			],
			't1' as BlockId,
			{ columnWidthsPx: [70, 90] },
		);
		const state = spanTestState(table);
		const transaction = buildDeleteRowTransaction(state, 't1' as BlockId, 1);
		expect(transaction).not.toBeNull();
		if (!transaction) return;

		const next = state.apply(transaction);
		const nextTable = next.getBlock('t1' as BlockId);
		const rows = nextTable ? getBlockChildren(nextTable) : [];
		expect(rows.map((row) => row.attrs?.minHeightPx)).toEqual([25, 45]);
		expect(next.getBlock('a' as BlockId)?.attrs?.rowspan).toBe(2);
		expect(nextTable?.attrs?.columnWidthsPx).toEqual([70, 90]);
		expectHistoryRoundTrip(state, transaction);
	});

	it('rejects non-integer and out-of-bounds logical coordinates without partial steps', () => {
		const state = spanTestState(spanningDimensionTable());
		expect(buildInsertColumnTransaction(state, 't1' as BlockId, -1)).toBeNull();
		expect(buildInsertRowTransaction(state, 't1' as BlockId, 99)).toBeNull();
		expect(buildDeleteColumnTransaction(state, 't1' as BlockId, 1.5)).toBeNull();
		expect(buildDeleteRowTransaction(state, 't1' as BlockId, 2)).toBeNull();
	});
});
