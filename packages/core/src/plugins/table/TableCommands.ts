/**
 * Table commands: insert table, add/remove rows and columns, delete table.
 * All commands are registered via PluginContext and operate through transactions.
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
} from './TableHelpers.js';

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

	// Set cursor in first cell
	const firstRow = getBlockChildren(tableNode)[0];
	const firstCell = firstRow ? getBlockChildren(firstRow)[0] : undefined;

	if (firstCell) {
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

	const table = state.getBlock(tableCtx.tableId);
	if (!table) return false;

	const newRow = createTableRow(tableCtx.totalCols);
	const tr = state.transaction('command').insertNode([tableCtx.tableId], tableCtx.rowIndex, newRow);

	// Move cursor to first cell of new row
	const firstCell = getBlockChildren(newRow)[0];
	if (firstCell) {
		tr.setSelection(createCollapsedSelection(firstCell.id, 0));
	}

	context.dispatch(tr.build());
	return true;
}

/** Adds a row below the current row. */
export function addRowBelow(context: PluginContext): boolean {
	const state = context.getState();
	if (isNodeSelection(state.selection)) return false;
	const tableCtx: TableContext | null = findTableContext(state, state.selection.anchor.blockId);
	if (!tableCtx) return false;

	const newRow = createTableRow(tableCtx.totalCols);
	const tr = state
		.transaction('command')
		.insertNode([tableCtx.tableId], tableCtx.rowIndex + 1, newRow);

	// Move cursor to first cell of new row
	const firstCell = getBlockChildren(newRow)[0];
	if (firstCell) {
		tr.setSelection(createCollapsedSelection(firstCell.id, 0));
	}

	context.dispatch(tr.build());
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

	const table = state.getBlock(tableCtx.tableId);
	if (!table) return false;

	const rows = getBlockChildren(table);
	const insertColIndex: number = side === 'left' ? tableCtx.colIndex : tableCtx.colIndex + 1;

	const tr = state.transaction('command');

	// Insert a new cell in each row at the column index
	for (const row of rows) {
		const newCell = createTableCell();
		tr.insertNode([tableCtx.tableId, row.id], insertColIndex, newCell);
	}

	tr.setSelection(state.selection);
	context.dispatch(tr.build());
	return true;
}

/**
 * Deletes the current row. If it's the last row, deletes the entire table.
 */
export function deleteRow(context: PluginContext): boolean {
	const state = context.getState();
	if (isNodeSelection(state.selection)) return false;
	const tableCtx: TableContext | null = findTableContext(state, state.selection.anchor.blockId);
	if (!tableCtx) return false;

	if (tableCtx.totalRows <= 1) {
		return deleteTable(context);
	}

	const tr = state.transaction('command').removeNode([tableCtx.tableId], tableCtx.rowIndex);

	// Move cursor to cell in adjacent row
	const targetRowIndex: number = tableCtx.rowIndex > 0 ? tableCtx.rowIndex - 1 : 0;
	const targetCellId: BlockId | null = getCellAt(
		state,
		tableCtx.tableId,
		targetRowIndex === tableCtx.rowIndex ? targetRowIndex + 1 : targetRowIndex,
		Math.min(tableCtx.colIndex, tableCtx.totalCols - 1),
	);

	if (targetCellId) {
		tr.setSelection(createCollapsedSelection(targetCellId, 0));
	}

	context.dispatch(tr.build());
	return true;
}

/**
 * Deletes the current column. If it's the last column, deletes the entire table.
 */
export function deleteColumn(context: PluginContext): boolean {
	const state = context.getState();
	if (isNodeSelection(state.selection)) return false;
	const tableCtx: TableContext | null = findTableContext(state, state.selection.anchor.blockId);
	if (!tableCtx) return false;

	if (tableCtx.totalCols <= 1) {
		return deleteTable(context);
	}

	const table = state.getBlock(tableCtx.tableId);
	if (!table) return false;

	const rows = getBlockChildren(table);
	const tr = state.transaction('command');

	// Remove the cell at colIndex from each row (reverse order for index stability)
	for (let r = rows.length - 1; r >= 0; r--) {
		const row = rows[r];
		if (!row) continue;
		tr.removeNode([tableCtx.tableId, row.id], tableCtx.colIndex);
	}

	// Move cursor to adjacent cell
	const targetColIndex: number = tableCtx.colIndex > 0 ? tableCtx.colIndex - 1 : 0;
	const targetCellId: BlockId | null = getCellAt(
		state,
		tableCtx.tableId,
		tableCtx.rowIndex,
		targetColIndex === tableCtx.colIndex ? targetColIndex + 1 : targetColIndex,
	);

	if (targetCellId) {
		tr.setSelection(createCollapsedSelection(targetCellId, 0));
	}

	context.dispatch(tr.build());
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
