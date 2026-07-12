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
import { type TableGridCell, createTableGrid } from './TableGrid.js';

/** Context information about a cell within a table. */
export interface TableContext {
	readonly tableId: BlockId;
	readonly tableIndex: number;
	readonly rowId: BlockId;
	readonly rowIndex: number;
	readonly rowEnd: number;
	readonly cellId: BlockId;
	readonly colIndex: number;
	readonly colEnd: number;
	readonly rowspan: number;
	readonly colspan: number;
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

	// Resolve the owning table and cell by identity first. Logical coordinates
	// come exclusively from TableGrid; a cell's child-array index is not its
	// column when colspan/rowspan are present.
	let tableId: BlockId | null = null;
	let tableNode: BlockNode | null = null;
	let cellId: BlockId | null = null;

	for (const id of path) {
		const node = state.getBlock(id as BlockId);
		if (!node) continue;
		if (node.type === 'table') {
			tableId = id as BlockId;
			tableNode = node;
		} else if (node.type === 'table_cell') {
			cellId = id as BlockId;
		}
	}

	// If the block itself is a cell
	const block = state.getBlock(blockId);
	if (block?.type === 'table_cell') {
		cellId = blockId;
	}

	if (!tableId || !tableNode || !cellId) return null;

	// Find table index in document
	const tableIndex: number = state.doc.children.findIndex((b) => b.id === tableId);

	const grid = createTableGrid(tableNode);
	const gridCell: TableGridCell | undefined = grid.cellById(cellId);
	if (!gridCell) return null;

	return {
		tableId,
		tableIndex,
		rowId: gridCell.sourceRow.id,
		rowIndex: gridCell.rowStart,
		rowEnd: gridCell.rowEnd,
		cellId,
		colIndex: gridCell.columnStart,
		colEnd: gridCell.columnEnd,
		rowspan: gridCell.rowSpan,
		colspan: gridCell.columnSpan,
		totalRows: grid.rowCount,
		totalCols: grid.columnCount,
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
	if (!table || table.type !== 'table') return null;
	return createTableGrid(table).cellAt(rowIndex, colIndex)?.cell.id ?? null;
}

/** Returns all cell IDs in a table in row-major order. */
export function getAllCellIds(state: EditorState, tableId: BlockId): readonly BlockId[] {
	const table = state.getBlock(tableId);
	if (!table) return [];

	if (table.type !== 'table') return [];
	return createTableGrid(table).cells.map((entry: TableGridCell) => entry.cell.id);
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
