/**
 * Table commands: insert table, add/remove rows and columns, delete table.
 * All commands are registered via PluginContext and operate through transactions.
 *
 * Shared transaction builders (`build*Transaction`) are pure functions that take
 * EditorState + explicit indices and return a Transaction or null. They are used
 * by both commands (via PluginContext) and controls (via getState/dispatch).
 */

import { insertBlockObjectOnOwnLine } from '../../commands/BlockInsertion.js';
import { createSelectionForBlockBoundary } from '../../commands/CommandHelpers.js';
import {
	type BlockAttrValue,
	type BlockNode,
	createBlockNode,
	createEmptyParagraph,
	generateBlockId,
	getBlockChildren,
} from '../../model/Document.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	isGapCursor,
	isNodeSelection,
	isTextSelection,
} from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import { getSelectedBlockId } from '../shared/PluginHelpers.js';
import { type TableGrid, type TableGridCell, createTableGrid } from './TableGrid.js';
import {
	type TableContext,
	createTable,
	createTableCell,
	findTableContext,
	getCellAt,
	getFirstLeafInCell,
} from './TableHelpers.js';
import type { TableLocale } from './TableLocale.js';
import { readTableColumnWidthsPx, withTableColumnWidthsPx } from './TableSizing.js';

// --- Shared Transaction Builders ---

/** Builds a transaction that inserts a new row at the given index. */
export function buildInsertRowTransaction(
	state: EditorState,
	tableId: BlockId,
	rowIndex: number,
): Transaction | null {
	const table = state.getBlock(tableId);
	if (!table || table.type !== 'table') return null;
	const grid: TableGrid = createTableGrid(table);
	if (!validInsertionIndex(rowIndex, grid.rowCount) || grid.columnCount === 0) return null;

	const crossingCells: readonly TableGridCell[] = grid.cells.filter(
		(entry: TableGridCell) => entry.rowStart < rowIndex && entry.rowEnd > rowIndex,
	);
	const tr = state.transaction('command');
	for (const entry of crossingCells) {
		if (!setCellSpan(state, tr, entry.cell, 'rowspan', entry.rowSpan + 1)) return null;
	}

	const cells: BlockNode[] = [];
	for (let column = 0; column < grid.columnCount; column++) {
		const covered: boolean = crossingCells.some(
			(entry: TableGridCell) => entry.columnStart <= column && entry.columnEnd > column,
		);
		if (!covered) cells.push(createTableCell());
	}
	const newRow: BlockNode = createBlockNode(nodeType('table_row'), cells);
	const rawRowIndex: number = rawInsertionIndex(table, grid, rowIndex);
	tr.insertNode([tableId], rawRowIndex, newRow);

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
	if (!table || table.type !== 'table') return null;
	const grid: TableGrid = createTableGrid(table);
	if (!validInsertionIndex(colIndex, grid.columnCount) || grid.rowCount === 0) return null;

	const tr = state.transaction('command');
	if (hasColumnWidthMetadata(table)) {
		const widths: (number | null)[] = [...readTableColumnWidthsPx(table, grid.columnCount)];
		widths.splice(colIndex, 0, null);
		const path = state.getNodePath(tableId);
		if (!path) return null;
		tr.setNodeAttr(path, withTableColumnWidthsPx(table.attrs, widths));
	}

	const crossingCells: readonly TableGridCell[] = grid.cells.filter(
		(entry: TableGridCell) => entry.columnStart < colIndex && entry.columnEnd > colIndex,
	);
	for (const entry of crossingCells) {
		if (!setCellSpan(state, tr, entry.cell, 'colspan', entry.columnSpan + 1)) return null;
	}

	let firstInsertedCell: BlockNode | undefined;
	for (let rowIndex = 0; rowIndex < grid.rowCount; rowIndex++) {
		const row: BlockNode | undefined = grid.rows[rowIndex];
		if (!row) continue;
		const coveredByCrossingCell: boolean = crossingCells.some(
			(entry: TableGridCell) => entry.rowStart <= rowIndex && entry.rowEnd > rowIndex,
		);
		if (coveredByCrossingCell) continue;

		const newCell = createTableCell();
		firstInsertedCell ??= newCell;
		const insertionIndex: number = grid.cells.filter(
			(entry: TableGridCell) => entry.sourceRow.id === row.id && entry.columnEnd <= colIndex,
		).length;
		tr.insertNode([tableId, row.id], insertionIndex, newCell);
	}

	const firstLeaf: BlockNode | undefined = firstInsertedCell
		? getBlockChildren(firstInsertedCell)[0]
		: undefined;
	tr.setSelection(firstLeaf ? createCollapsedSelection(firstLeaf.id, 0) : state.selection);
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
	if (!table || table.type !== 'table') return null;
	const grid: TableGrid = createTableGrid(table);
	if (!validExistingIndex(rowIndex, grid.rowCount)) return null;
	if (grid.rowCount <= 1) {
		return createDeleteTableTransaction(state, tableId);
	}

	const tr = state.transaction('command');
	const coveringCells: readonly TableGridCell[] = grid.cells.filter(
		(entry: TableGridCell) => entry.rowStart <= rowIndex && entry.rowEnd > rowIndex,
	);
	const movedCells: readonly TableGridCell[] = coveringCells
		.filter((entry: TableGridCell) => entry.rowStart === rowIndex && entry.rowSpan > 1)
		.sort((a: TableGridCell, b: TableGridCell) => a.columnStart - b.columnStart);

	for (const entry of coveringCells) {
		if (entry.rowSpan <= 1) continue;
		if (!setCellSpan(state, tr, entry.cell, 'rowspan', entry.rowSpan - 1)) return null;
	}

	if (movedCells.length > 0) {
		const targetRow: BlockNode | undefined = grid.rows[rowIndex + 1];
		if (!targetRow) return null;
		const targetOwnedCells: readonly TableGridCell[] = grid.cells.filter(
			(entry: TableGridCell) => entry.sourceRow.id === targetRow.id,
		);
		let moved = 0;
		for (const entry of movedCells) {
			const insertionIndex: number =
				targetOwnedCells.filter((target: TableGridCell) => target.columnStart < entry.columnStart)
					.length + moved;
			tr.moveNode(
				[tableId, entry.sourceRow.id],
				entry.sourceCellIndex - moved,
				[tableId, targetRow.id],
				insertionIndex,
			);
			moved++;
		}
	}

	const rawRowIndex: number = rawExistingRowIndex(table, grid, rowIndex);
	if (rawRowIndex < 0) return null;
	tr.removeNode([tableId], rawRowIndex);

	const selectionRow: number = rowIndex > 0 ? rowIndex - 1 : 1;
	const safeColumn: number = Math.min(Math.max(0, preferredCol), grid.columnCount - 1);
	const cellId: BlockId | null = getCellAt(state, tableId, selectionRow, safeColumn);
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
	if (!table || table.type !== 'table') return null;
	const grid: TableGrid = createTableGrid(table);
	if (!validExistingIndex(colIndex, grid.columnCount)) return null;
	if (grid.columnCount <= 1) {
		return createDeleteTableTransaction(state, tableId);
	}

	const tr = state.transaction('command');
	if (hasColumnWidthMetadata(table)) {
		const widths: (number | null)[] = [...readTableColumnWidthsPx(table, grid.columnCount)];
		widths.splice(colIndex, 1);
		const path = state.getNodePath(tableId);
		if (!path) return null;
		tr.setNodeAttr(path, withTableColumnWidthsPx(table.attrs, widths));
	}

	const coveringCells: readonly TableGridCell[] = grid.cells.filter(
		(entry: TableGridCell) => entry.columnStart <= colIndex && entry.columnEnd > colIndex,
	);
	for (const entry of coveringCells) {
		if (entry.columnSpan <= 1) continue;
		if (!setCellSpan(state, tr, entry.cell, 'colspan', entry.columnSpan - 1)) return null;
	}
	for (const entry of coveringCells
		.filter((cell: TableGridCell) => cell.columnSpan === 1)
		.sort((a: TableGridCell, b: TableGridCell) => {
			if (a.sourceRowIndex !== b.sourceRowIndex) return b.sourceRowIndex - a.sourceRowIndex;
			return b.sourceCellIndex - a.sourceCellIndex;
		})) {
		tr.removeNode([tableId, entry.sourceRow.id], entry.sourceCellIndex);
	}

	const targetCol: number = colIndex > 0 ? colIndex - 1 : 1;
	const safeRow: number = Math.min(Math.max(0, preferredRow), grid.rowCount - 1);
	const cellId: BlockId | null = getCellAt(state, tableId, safeRow, targetCol);
	if (cellId) {
		const leafId: BlockId = getFirstLeafInCell(state, cellId);
		tr.setSelection(createCollapsedSelection(leafId, 0));
	}

	return tr.build();
}

/**
 * Creates a transaction that removes the given root-level table node.
 * Cursor placement prefers the next root block, then previous.
 * If the table is the only root block, it is replaced with an empty paragraph.
 */
export function createDeleteTableTransaction(
	state: EditorState,
	tableId: BlockId,
): Transaction | null {
	const tableIndex: number = state.doc.children.findIndex((block) => block.id === tableId);
	if (tableIndex === -1) return null;

	if (state.doc.children.length === 1) {
		const replacement = createEmptyParagraph(generateBlockId());
		return state
			.transaction('command')
			.insertNode([], 0, replacement)
			.removeNode([], 1)
			.setSelection(createCollapsedSelection(replacement.id, 0))
			.build();
	}

	const tr = state.transaction('command').removeNode([], tableIndex);

	const nextRoot = state.doc.children[tableIndex + 1];
	if (nextRoot) {
		const selection = createSelectionForBlockBoundary(state, nextRoot.id, 'start');
		if (selection) {
			tr.setSelection(selection);
			return tr.build();
		}
	}

	const prevRoot = state.doc.children[tableIndex - 1];
	if (prevRoot) {
		const selection = createSelectionForBlockBoundary(state, prevRoot.id, 'end');
		if (selection) {
			tr.setSelection(selection);
			return tr.build();
		}
	}

	return null;
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
	const anchorBlockId = getSelectedBlockId(state);
	if (!anchorBlockId) return false;

	const tableNode = createTable(rows, cols);
	const builder = state.transaction('command');
	const trailing = insertBlockObjectOnOwnLine(state, builder, anchorBlockId, tableNode);
	if (!trailing) return false;

	// Set cursor in first paragraph inside first cell
	const firstRow = getBlockChildren(tableNode)[0];
	const firstCell = firstRow ? getBlockChildren(firstRow)[0] : undefined;
	const firstParagraph = firstCell ? getBlockChildren(firstCell)[0] : undefined;

	if (firstParagraph) {
		builder.setSelection(createCollapsedSelection(firstParagraph.id, 0));
	} else if (firstCell) {
		builder.setSelection(createCollapsedSelection(firstCell.id, 0));
	}

	context.dispatch(builder.build());
	return true;
}

/** Adds a row above the current row. */
export function addRowAbove(context: PluginContext, locale: TableLocale): boolean {
	const state = context.getState();
	if (!isTextSelection(state.selection)) return false;
	const tableCtx: TableContext | null = findTableContext(state, state.selection.anchor.blockId);
	if (!tableCtx) return false;

	const tr = buildInsertRowTransaction(state, tableCtx.tableId, tableCtx.rowIndex);
	if (!tr) return false;

	context.dispatch(tr);
	context.announce(locale.announceRowInsertedAbove);
	return true;
}

/** Adds a row below the current row. */
export function addRowBelow(context: PluginContext, locale: TableLocale): boolean {
	const state = context.getState();
	if (!isTextSelection(state.selection)) return false;
	const tableCtx: TableContext | null = findTableContext(state, state.selection.anchor.blockId);
	if (!tableCtx) return false;

	const tr = buildInsertRowTransaction(state, tableCtx.tableId, tableCtx.rowEnd);
	if (!tr) return false;

	context.dispatch(tr);
	context.announce(locale.announceRowInsertedBelow);
	return true;
}

/** Adds a column to the left of the current column. */
export function addColumnLeft(context: PluginContext, locale: TableLocale): boolean {
	return addColumn(context, 'left', locale);
}

/** Adds a column to the right of the current column. */
export function addColumnRight(context: PluginContext, locale: TableLocale): boolean {
	return addColumn(context, 'right', locale);
}

function addColumn(context: PluginContext, side: 'left' | 'right', locale: TableLocale): boolean {
	const state = context.getState();
	if (!isTextSelection(state.selection)) return false;
	const tableCtx: TableContext | null = findTableContext(state, state.selection.anchor.blockId);
	if (!tableCtx) return false;

	const insertColIndex: number = side === 'left' ? tableCtx.colIndex : tableCtx.colEnd;
	const tr = buildInsertColumnTransaction(state, tableCtx.tableId, insertColIndex);
	if (!tr) return false;

	context.dispatch(tr);
	context.announce(locale.announceColumnInserted(side));
	return true;
}

// --- Logical-grid structural helpers ---

function validInsertionIndex(index: number, length: number): boolean {
	return Number.isInteger(index) && index >= 0 && index <= length;
}

function validExistingIndex(index: number, length: number): boolean {
	return Number.isInteger(index) && index >= 0 && index < length;
}

function rawInsertionIndex(table: BlockNode, grid: TableGrid, logicalRow: number): number {
	if (logicalRow >= grid.rowCount) return table.children.length;
	const row: BlockNode | undefined = grid.rows[logicalRow];
	if (!row) return table.children.length;
	const index: number = table.children.findIndex((child) => 'id' in child && child.id === row.id);
	return index === -1 ? table.children.length : index;
}

function rawExistingRowIndex(table: BlockNode, grid: TableGrid, logicalRow: number): number {
	const row: BlockNode | undefined = grid.rows[logicalRow];
	if (!row) return -1;
	return table.children.findIndex((child) => 'id' in child && child.id === row.id);
}

function setCellSpan(
	state: EditorState,
	builder: ReturnType<EditorState['transaction']>,
	cell: BlockNode,
	key: 'colspan' | 'rowspan',
	value: number,
): boolean {
	const path: readonly BlockId[] | undefined = state.getNodePath(cell.id);
	if (!path) return false;
	builder.setNodeAttr(path, withCellSpan(cell, key, value).attrs ?? {});
	return true;
}

function withCellSpan(cell: BlockNode, key: 'colspan' | 'rowspan', value: number): BlockNode {
	const attrs: Record<string, BlockAttrValue> = { ...(cell.attrs ?? {}) };
	delete attrs[key];
	if (value > 1) attrs[key] = value;
	return { ...cell, attrs };
}

function hasColumnWidthMetadata(table: BlockNode): boolean {
	return Object.prototype.hasOwnProperty.call(table.attrs ?? {}, 'columnWidthsPx');
}

/** Deletes the current row. If it's the last row, deletes the entire table. */
export function deleteRow(context: PluginContext, locale: TableLocale): boolean {
	const state = context.getState();
	if (!isTextSelection(state.selection)) return false;
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
	context.announce(locale.announceRowDeleted);
	return true;
}

/** Deletes the current column. If it's the last column, deletes the entire table. */
export function deleteColumn(context: PluginContext, locale: TableLocale): boolean {
	const state = context.getState();
	if (!isTextSelection(state.selection)) return false;
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
	context.announce(locale.announceColumnDeleted);
	return true;
}

/** Deletes the entire table and moves cursor to surrounding block. */
export function deleteTable(context: PluginContext, locale: TableLocale): boolean {
	const state = context.getState();
	const target = resolveTableDeletionTarget(state);
	if (!target) return false;

	const tr = createDeleteTableTransaction(state, target.tableId);
	if (!tr) return false;
	context.dispatch(tr);
	context.announce(locale.announceTableDeleted);
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
	if (isGapCursor(sel)) return false;

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
export function registerTableCommands(context: PluginContext, locale: TableLocale): void {
	context.registerCommand('insertTable', () => insertTable(context, 3, 3));
	context.registerCommand('addRowAbove', () => addRowAbove(context, locale));
	context.registerCommand('addRowBelow', () => addRowBelow(context, locale));
	context.registerCommand('addColumnLeft', () => addColumnLeft(context, locale));
	context.registerCommand('addColumnRight', () => addColumnRight(context, locale));
	context.registerCommand('deleteRow', () => deleteRow(context, locale));
	context.registerCommand('deleteColumn', () => deleteColumn(context, locale));
	context.registerCommand('selectTable', () => selectTable(context));
	context.registerCommand('deleteTable', () => deleteTable(context, locale));
}

function resolveTableDeletionTarget(
	state: ReturnType<PluginContext['getState']>,
): TableDeletionTarget | null {
	if (isNodeSelection(state.selection)) {
		const selectedNode = state.getBlock(state.selection.nodeId);
		if (selectedNode?.type !== 'table') return null;
		return { tableId: selectedNode.id };
	}
	if (isGapCursor(state.selection)) return null;

	const tableCtx: TableContext | null = findTableContext(state, state.selection.anchor.blockId);
	if (!tableCtx) return null;

	return { tableId: tableCtx.tableId };
}
