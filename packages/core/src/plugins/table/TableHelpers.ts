/**
 * Utility functions for table operations: creating table structures,
 * finding table context, and navigating cells.
 */

import {
	type BlockNode,
	type ChildNode,
	createBlockNode,
	createTextNode,
	generateBlockId,
	getBlockChildren,
} from '../../model/Document.js';
import type { BlockId, NodeTypeName } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';

/** Context information about a cell within a table. */
export interface TableContext {
	readonly tableId: BlockId;
	readonly tableIndex: number;
	readonly rowId: BlockId;
	readonly rowIndex: number;
	readonly cellId: BlockId;
	readonly colIndex: number;
	readonly totalRows: number;
	readonly totalCols: number;
}

/** Creates a table BlockNode structure with the given dimensions. */
export function createTable(rows: number, cols: number): BlockNode {
	const tableId: BlockId = generateBlockId();
	const rowNodes: ChildNode[] = [];

	for (let r = 0; r < rows; r++) {
		const cellNodes: ChildNode[] = [];
		for (let c = 0; c < cols; c++) {
			cellNodes.push(createTableCell());
		}
		rowNodes.push(
			createBlockNode(nodeType('table_row') as NodeTypeName, cellNodes, generateBlockId()),
		);
	}

	return createBlockNode(nodeType('table') as NodeTypeName, rowNodes, tableId);
}

/** Creates a single table row with the given number of cells. */
export function createTableRow(cols: number): BlockNode {
	const cellNodes: ChildNode[] = [];
	for (let c = 0; c < cols; c++) {
		cellNodes.push(createTableCell());
	}
	return createBlockNode(nodeType('table_row') as NodeTypeName, cellNodes, generateBlockId());
}

/** Creates a single empty table cell containing a paragraph. */
export function createTableCell(): BlockNode {
	const paragraph: BlockNode = createBlockNode(
		nodeType('paragraph') as NodeTypeName,
		[createTextNode('')],
		generateBlockId(),
	);
	return createBlockNode(nodeType('table_cell') as NodeTypeName, [paragraph], generateBlockId());
}

/**
 * Finds table context for a given block ID.
 * Returns null if the block is not inside a table.
 */
export function findTableContext(state: EditorState, blockId: BlockId): TableContext | null {
	const path = state.getNodePath(blockId);
	if (!path) return null;

	// Find table node in the path
	let tableId: BlockId | null = null;
	let tableNode: BlockNode | null = null;

	for (const id of path) {
		const node = state.getBlock(id as BlockId);
		if (node?.type === 'table') {
			tableId = id as BlockId;
			tableNode = node;
			break;
		}
	}

	if (!tableId || !tableNode) return null;

	// Find table index in document
	const tableIndex: number = state.doc.children.findIndex((b) => b.id === tableId);

	// Find the cell — could be the block itself or an ancestor
	let cellId: BlockId | null = null;
	let rowId: BlockId | null = null;

	// Walk path to identify row and cell
	for (const id of path) {
		const node = state.getBlock(id as BlockId);
		if (node?.type === 'table_row') {
			rowId = id as BlockId;
		}
		if (node?.type === 'table_cell') {
			cellId = id as BlockId;
		}
	}

	// If the block itself is a cell
	const block = state.getBlock(blockId);
	if (block?.type === 'table_cell') {
		cellId = blockId;
	}

	if (!cellId || !rowId) return null;

	const rows: readonly BlockNode[] = getBlockChildren(tableNode);
	const rowIndex: number = rows.findIndex((r) => r.id === rowId);
	if (rowIndex === -1) return null;

	const rowNode: BlockNode | undefined = rows[rowIndex];
	if (!rowNode) return null;
	const cells: readonly BlockNode[] = getBlockChildren(rowNode);
	const colIndex: number = cells.findIndex((c) => c.id === cellId);
	if (colIndex === -1) return null;

	const totalCols: number = cells.length;
	const totalRows: number = rows.length;

	return {
		tableId,
		tableIndex,
		rowId,
		rowIndex,
		cellId,
		colIndex,
		totalRows,
		totalCols,
	};
}

/**
 * Gets the cell BlockId at the given row and column indices.
 * Returns null if out of bounds.
 */
export function getCellAt(
	state: EditorState,
	tableId: BlockId,
	rowIndex: number,
	colIndex: number,
): BlockId | null {
	const table = state.getBlock(tableId);
	if (!table) return null;

	const rows: readonly BlockNode[] = getBlockChildren(table);
	const row: BlockNode | undefined = rows[rowIndex];
	if (!row) return null;

	const cells: readonly BlockNode[] = getBlockChildren(row);
	const cell: BlockNode | undefined = cells[colIndex];
	return cell?.id ?? null;
}

/** Returns all cell IDs in a table in row-major order. */
export function getAllCellIds(state: EditorState, tableId: BlockId): readonly BlockId[] {
	const table = state.getBlock(tableId);
	if (!table) return [];

	const result: BlockId[] = [];
	const rows: readonly BlockNode[] = getBlockChildren(table);
	for (const row of rows) {
		const cells: readonly BlockNode[] = getBlockChildren(row);
		for (const cell of cells) {
			result.push(cell.id);
		}
	}
	return result;
}

/** Returns the first leaf-block ID inside a table cell (e.g. the paragraph). */
export function getFirstLeafInCell(state: EditorState, cellId: BlockId): BlockId {
	const cell: BlockNode | undefined = state.getBlock(cellId);
	if (!cell) return cellId;
	const blockChildren: readonly BlockNode[] = getBlockChildren(cell);
	const first: BlockNode | undefined = blockChildren[0];
	if (!first) return cellId;
	let current: BlockNode = first;
	while (true) {
		const children: readonly BlockNode[] = getBlockChildren(current);
		const next: BlockNode | undefined = children[0];
		if (!next) return current.id;
		current = next;
	}
}

/** Returns the last leaf-block ID inside a table cell. */
export function getLastLeafInCell(state: EditorState, cellId: BlockId): BlockId {
	const cell: BlockNode | undefined = state.getBlock(cellId);
	if (!cell) return cellId;
	const blockChildren: readonly BlockNode[] = getBlockChildren(cell);
	const last: BlockNode | undefined = blockChildren[blockChildren.length - 1];
	if (!last) return cellId;
	let current: BlockNode = last;
	while (true) {
		const children: readonly BlockNode[] = getBlockChildren(current);
		const next: BlockNode | undefined = children[children.length - 1];
		if (!next) return current.id;
		current = next;
	}
}

/** Checks whether a block is inside a table. */
export function isInsideTable(state: EditorState, blockId: BlockId): boolean {
	const path = state.getNodePath(blockId);
	if (!path) return false;

	for (const id of path) {
		const node = state.getBlock(id as BlockId);
		if (node?.type === 'table') return true;
	}
	return false;
}
