/**
 * Table commands: insert table, add/remove rows and columns, delete table.
 * All commands are registered via PluginContext and operate through transactions.
 *
 * Shared transaction builders (`build*Transaction`) are pure functions that take
 * EditorState + explicit indices and return a Transaction or null. They are used
 * by both commands (via PluginContext) and controls (via getState/dispatch).
 */

import { createBlockNode, getBlockChildren } from '../../model/Document.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	isNodeSelection,
} from '../../model/Selection.js';
import type { BlockId, NodeTypeName } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import {
	type TableContext,
	createTable,
	createTableCell,
	createTableRow,
	findTableContext,
	getCellAt,
	getFirstLeafInCell,
} from './TableHelpers.js';

// --- Shared Transaction Builders ---

/** Builds a transaction that inserts a new row at the given index. */
export function buildInsertRowTransaction(
	state: EditorState,
	tableId: BlockId,
	rowIndex: number,
): Transaction | null {
	const table = state.getBlock(tableId);
	if (!table) return null;

	const rows = getBlockChildren(table);
	const numCols: number = rows[0] ? getBlockChildren(rows[0]).length : 0;
	if (numCols === 0) return null;

	const newRow = createTableRow(numCols);
	const tr = state.transaction('command').insertNode([tableId], rowIndex, newRow);

	const firstCell = getBlockChildren(newRow)[0];
	const firstLeaf = firstCell ? getBlockChildren(firstCell)[0] : undefined;
	if (firstLeaf) {
		tr.setSelection(createCollapsedSelection(firstLeaf.id, 0));
	} else if (firstCell) {
		tr.setSelection(createCollapsedSelection(firstCell.id, 0));
	}

	return tr.build();
}

/** Builds a transaction that inserts a new column at the given index. */
export function buildInsertColumnTransaction(
	state: EditorState,
	tableId: BlockId,
	colIndex: number,
): Transaction | null {
	const table = state.getBlock(tableId);
	if (!table) return null;

	const rows = getBlockChildren(table);
	const tr = state.transaction('command');

	for (const row of rows) {
		const newCell = createTableCell();
		tr.insertNode([tableId, row.id], colIndex, newCell);
	}

	tr.setSelection(state.selection);
	return tr.build();
}

/**
 * Builds a transaction that deletes the row at the given index.
 * If it's the last row, delegates to `createDeleteTableTransaction`.
 * @param preferredCol Column index to place the cursor in after deletion (default 0).
 */
export function buildDeleteRowTransaction(
	state: EditorState,
	tableId: BlockId,
	rowIndex: number,
	preferredCol = 0,
): Transaction | null {
	const table = state.getBlock(tableId);
	if (!table) return null;

	const rows = getBlockChildren(table);
	if (rows.length <= 1) {
		return createDeleteTableTransaction(state, tableId);
	}

	const tr = state.transaction('command').removeNode([tableId], rowIndex);

	const targetRow: number = rowIndex > 0 ? rowIndex - 1 : 1;
	const cellId: BlockId | null = getCellAt(state, tableId, targetRow, preferredCol);
	if (cellId) {
		const leafId: BlockId = getFirstLeafInCell(state, cellId);
		tr.setSelection(createCollapsedSelection(leafId, 0));
	}

	return tr.build();
}

/**
 * Builds a transaction that deletes the column at the given index.
 * If it's the last column, delegates to `createDeleteTableTransaction`.
 * @param preferredRow Row index to place the cursor in after deletion (default 0).
 */
export function buildDeleteColumnTransaction(
	state: EditorState,
	tableId: BlockId,
	colIndex: number,
	preferredRow = 0,
): Transaction | null {
	const table = state.getBlock(tableId);
	if (!table) return null;

	const rows = getBlockChildren(table);
	const numCols: number = rows[0] ? getBlockChildren(rows[0]).length : 0;

	if (numCols <= 1) {
		return createDeleteTableTransaction(state, tableId);
	}

	const tr = state.transaction('command');

	for (let r: number = rows.length - 1; r >= 0; r--) {
		const row = rows[r];
		if (!row) continue;
		tr.removeNode([tableId, row.id], colIndex);
	}

	const targetCol: number = colIndex > 0 ? colIndex - 1 : 1;
	const cellId: BlockId | null = getCellAt(state, tableId, preferredRow, targetCol);
	if (cellId) {
		const leafId: BlockId = getFirstLeafInCell(state, cellId);
		tr.setSelection(createCollapsedSelection(leafId, 0));
	}

	return tr.build();
}

/**
 * Creates a transaction that removes the given root-level table node.
 * Cursor placement prefers the next root block, then previous.
 */
export function createDeleteTableTransaction(
	state: EditorState,
	tableId: BlockId,
): Transaction | null {
	const tableIndex: number = state.doc.children.findIndex((block) => block.id === tableId);
	if (tableIndex === -1) return null;

	const tr = state.transaction('command').removeNode([], tableIndex);

	const nextRoot = state.doc.children[tableIndex + 1];
	if (nextRoot) {
		tr.setSelection(createCollapsedSelection(nextRoot.id, 0));
		return tr.build();
	}

	const prevRoot = state.doc.children[tableIndex - 1];
	if (prevRoot) {
		tr.setSelection(createCollapsedSelection(prevRoot.id, 0));
	}

	return tr.build();
}

// --- Commands ---

interface TableDeletionTarget {
	readonly tableId: BlockId;
}

/**
 * Inserts a table with the given dimensions at the current cursor position.
 * Adds a paragraph after the table for cursor escape.
 * Moves cursor into the first cell.
 */
export function insertTable(context: PluginContext, rows: number, cols: number): boolean {
	const state = context.getState();
	const sel = state.selection;
	if (isNodeSelection(sel)) return false;

	const currentBlockId: BlockId = sel.anchor.blockId;

	// Find which root-level block contains the current selection
	let rootIndex = -1;
	for (let i = 0; i < state.doc.children.length; i++) {
		const rootBlock = state.doc.children[i];
		if (!rootBlock) continue;
		if (rootBlock.id === currentBlockId) {
			rootIndex = i;
			break;
		}
		// Check if current block is nested inside this root block
		const path = state.getNodePath(currentBlockId);
		if (path && path[0] === rootBlock.id) {
			rootIndex = i;
			break;
		}
	}

	if (rootIndex === -1) rootIndex = state.doc.children.length - 1;

	const tableNode = createTable(rows, cols);
	const paragraphAfter = createBlockNode(nodeType('paragraph') as NodeTypeName);

	// Insert table after current block, then paragraph after table
	const insertIndex: number = rootIndex + 1;
	const tr = state
		.transaction('command')
		.insertNode([], insertIndex, tableNode)
		.insertNode([], insertIndex + 1, paragraphAfter);

	// Set cursor in first paragraph inside first cell
	const firstRow = getBlockChildren(tableNode)[0];
	const firstCell = firstRow ? getBlockChildren(firstRow)[0] : undefined;
	const firstParagraph = firstCell ? getBlockChildren(firstCell)[0] : undefined;

	if (firstParagraph) {
		tr.setSelection(createCollapsedSelection(firstParagraph.id, 0));
	} else if (firstCell) {
		tr.setSelection(createCollapsedSelection(firstCell.id, 0));
	}

	context.dispatch(tr.build());
	return true;
}

/** Adds a row above the current row. */
export function addRowAbove(context: PluginContext): boolean {
	const state = context.getState();
	if (isNodeSelection(state.selection)) return false;
	const tableCtx: TableContext | null = findTableContext(state, state.selection.anchor.blockId);
	if (!tableCtx) return false;

	const tr = buildInsertRowTransaction(state, tableCtx.tableId, tableCtx.rowIndex);
	if (!tr) return false;

	context.dispatch(tr);
	return true;
}

/** Adds a row below the current row. */
export function addRowBelow(context: PluginContext): boolean {
	const state = context.getState();
	if (isNodeSelection(state.selection)) return false;
	const tableCtx: TableContext | null = findTableContext(state, state.selection.anchor.blockId);
	if (!tableCtx) return false;

	const tr = buildInsertRowTransaction(state, tableCtx.tableId, tableCtx.rowIndex + 1);
	if (!tr) return false;

	context.dispatch(tr);
	return true;
}

/** Adds a column to the left of the current column. */
export function addColumnLeft(context: PluginContext): boolean {
	return addColumn(context, 'left');
}

/** Adds a column to the right of the current column. */
export function addColumnRight(context: PluginContext): boolean {
	return addColumn(context, 'right');
}

function addColumn(context: PluginContext, side: 'left' | 'right'): boolean {
	const state = context.getState();
	if (isNodeSelection(state.selection)) return false;
	const tableCtx: TableContext | null = findTableContext(state, state.selection.anchor.blockId);
	if (!tableCtx) return false;

	const insertColIndex: number = side === 'left' ? tableCtx.colIndex : tableCtx.colIndex + 1;
	const tr = buildInsertColumnTransaction(state, tableCtx.tableId, insertColIndex);
	if (!tr) return false;

	context.dispatch(tr);
	return true;
}

/** Deletes the current row. If it's the last row, deletes the entire table. */
export function deleteRow(context: PluginContext): boolean {
	const state = context.getState();
	if (isNodeSelection(state.selection)) return false;
	const tableCtx: TableContext | null = findTableContext(state, state.selection.anchor.blockId);
	if (!tableCtx) return false;

	const tr = buildDeleteRowTransaction(
		state,
		tableCtx.tableId,
		tableCtx.rowIndex,
		tableCtx.colIndex,
	);
	if (!tr) return false;

	context.dispatch(tr);
	return true;
}

/** Deletes the current column. If it's the last column, deletes the entire table. */
export function deleteColumn(context: PluginContext): boolean {
	const state = context.getState();
	if (isNodeSelection(state.selection)) return false;
	const tableCtx: TableContext | null = findTableContext(state, state.selection.anchor.blockId);
	if (!tableCtx) return false;

	const tr = buildDeleteColumnTransaction(
		state,
		tableCtx.tableId,
		tableCtx.colIndex,
		tableCtx.rowIndex,
	);
	if (!tr) return false;

	context.dispatch(tr);
	return true;
}

/** Deletes the entire table and moves cursor to surrounding block. */
export function deleteTable(context: PluginContext): boolean {
	const state = context.getState();
	const target = resolveTableDeletionTarget(state);
	if (!target) return false;

	const tr = createDeleteTableTransaction(state, target.tableId);
	if (!tr) return false;
	context.dispatch(tr);
	return true;
}

/** Selects the surrounding table as a node object. */
export function selectTable(context: PluginContext): boolean {
	const state = context.getState();
	const sel = state.selection;

	if (isNodeSelection(sel)) {
		const selectedNode = state.getBlock(sel.nodeId);
		return selectedNode?.type === 'table';
	}

	const tableCtx: TableContext | null = findTableContext(state, sel.anchor.blockId);
	if (!tableCtx) return false;

	const path = state.getNodePath(tableCtx.tableId);
	if (!path) return false;

	const tr = state
		.transaction('command')
		.setSelection(createNodeSelection(tableCtx.tableId, path))
		.build();
	context.dispatch(tr);
	return true;
}

/** Registers all table commands on the given plugin context. */
export function registerTableCommands(context: PluginContext): void {
	context.registerCommand('insertTable', () => insertTable(context, 3, 3));
	context.registerCommand('addRowAbove', () => addRowAbove(context));
	context.registerCommand('addRowBelow', () => addRowBelow(context));
	context.registerCommand('addColumnLeft', () => addColumnLeft(context));
	context.registerCommand('addColumnRight', () => addColumnRight(context));
	context.registerCommand('deleteRow', () => deleteRow(context));
	context.registerCommand('deleteColumn', () => deleteColumn(context));
	context.registerCommand('selectTable', () => selectTable(context));
	context.registerCommand('deleteTable', () => deleteTable(context));
}

function resolveTableDeletionTarget(
	state: ReturnType<PluginContext['getState']>,
): TableDeletionTarget | null {
	if (isNodeSelection(state.selection)) {
		const selectedNode = state.getBlock(state.selection.nodeId);
		if (selectedNode?.type !== 'table') return null;
		return { tableId: selectedNode.id };
	}

	const tableCtx: TableContext | null = findTableContext(state, state.selection.anchor.blockId);
	if (!tableCtx) return null;

	return { tableId: tableCtx.tableId };
}
