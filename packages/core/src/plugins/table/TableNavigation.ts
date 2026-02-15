/**
 * Keyboard navigation handlers for table cells.
 * Handles Tab, Shift-Tab, arrow keys, Enter, Backspace, Delete, and Escape.
 */

import type { Keymap } from '../../input/Keymap.js';
import { getBlockLength } from '../../model/Document.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	isCollapsed,
	isNodeSelection,
} from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { PluginContext } from '../Plugin.js';
import { addRowBelow } from './TableCommands.js';
import {
	type TableContext,
	findTableContext,
	getCellAt,
	getFirstLeafInCell,
	getLastLeafInCell,
} from './TableHelpers.js';

/** Registers all table navigation keymaps. */
export function registerTableKeymaps(context: PluginContext): void {
	const keymap: Keymap = {
		Tab: () => handleTab(context),
		'Shift-Tab': () => handleShiftTab(context),
		Enter: () => handleEnter(context),
		Backspace: () => handleBackspace(context),
		Delete: () => handleDelete(context),
		ArrowDown: () => handleArrowDown(context),
		ArrowUp: () => handleArrowUp(context),
		ArrowRight: () => handleArrowRight(context),
		ArrowLeft: () => handleArrowLeft(context),
		Escape: () => handleEscape(context),
	};

	context.registerKeymap(keymap);
}

/** Tab: move to next cell. At end of table, add a new row. */
function handleTab(context: PluginContext): boolean {
	const state = context.getState();
	if (isNodeSelection(state.selection)) return false;
	const tableCtx: TableContext | null = findTableContext(state, state.selection.anchor.blockId);
	if (!tableCtx) return false;

	// Try next cell in same row
	if (tableCtx.colIndex < tableCtx.totalCols - 1) {
		return moveToCellAndSelect(context, tableCtx.tableId, tableCtx.rowIndex, tableCtx.colIndex + 1);
	}

	// Try first cell in next row
	if (tableCtx.rowIndex < tableCtx.totalRows - 1) {
		return moveToCellAndSelect(context, tableCtx.tableId, tableCtx.rowIndex + 1, 0);
	}

	// At end of table — add a new row and move there
	addRowBelow(context);
	return true;
}

/** Shift-Tab: move to previous cell. At start of table, return false. */
function handleShiftTab(context: PluginContext): boolean {
	const state = context.getState();
	if (isNodeSelection(state.selection)) return false;
	const tableCtx: TableContext | null = findTableContext(state, state.selection.anchor.blockId);
	if (!tableCtx) return false;

	// Try previous cell in same row
	if (tableCtx.colIndex > 0) {
		return moveToCellAndSelect(context, tableCtx.tableId, tableCtx.rowIndex, tableCtx.colIndex - 1);
	}

	// Try last cell in previous row
	if (tableCtx.rowIndex > 0) {
		return moveToCellAndSelect(
			context,
			tableCtx.tableId,
			tableCtx.rowIndex - 1,
			tableCtx.totalCols - 1,
		);
	}

	// At start of table — stay put
	return true;
}

/** Enter: move to same column in next row (spreadsheet behavior). */
function handleEnter(context: PluginContext): boolean {
	const state = context.getState();
	if (isNodeSelection(state.selection)) return false;

	const block = state.getBlock(state.selection.anchor.blockId);
	// Only intercept Enter for paragraphs inside table cells.
	// Other block types (list_item, heading, etc.) are handled by their plugins.
	if (block && block.type !== 'paragraph') return false;

	const tableCtx: TableContext | null = findTableContext(state, state.selection.anchor.blockId);
	if (!tableCtx) return false;

	// Move to same column in next row
	if (tableCtx.rowIndex < tableCtx.totalRows - 1) {
		return moveToCellAndSelect(context, tableCtx.tableId, tableCtx.rowIndex + 1, tableCtx.colIndex);
	}

	// On last row — block to prevent splitBlock
	return true;
}

/** Backspace at deletion-boundary: select table node (first step of 2-step delete). */
function handleBackspace(context: PluginContext): boolean {
	const state = context.getState();
	const sel = state.selection;
	if (isNodeSelection(sel)) return false;
	if (!isCollapsed(sel)) return false;
	if (sel.anchor.offset !== 0) return false;

	const tableCtx: TableContext | null = findTableContext(state, sel.anchor.blockId);
	if (!tableCtx) return false;

	const isAtDeletionBoundary = tableCtx.rowIndex === 0 && tableCtx.colIndex === 0;
	if (!isAtDeletionBoundary) return false;

	// Cursor must be on the first block inside the cell
	const firstLeaf: BlockId = getFirstLeafInCell(state, tableCtx.cellId);
	if (sel.anchor.blockId !== firstLeaf) return false;

	return selectTableNode(context, tableCtx.tableId);
}

/** Delete at deletion-boundary: select table node (first step of 2-step delete). */
function handleDelete(context: PluginContext): boolean {
	const state = context.getState();
	const sel = state.selection;
	if (isNodeSelection(sel)) return false;
	if (!isCollapsed(sel)) return false;

	const block = state.getBlock(sel.anchor.blockId);
	if (!block) return false;

	const blockLen: number = getBlockLength(block);
	if (sel.anchor.offset !== blockLen) return false;

	const tableCtx: TableContext | null = findTableContext(state, sel.anchor.blockId);
	if (!tableCtx) return false;

	const isAtDeletionBoundary =
		tableCtx.rowIndex === tableCtx.totalRows - 1 && tableCtx.colIndex === tableCtx.totalCols - 1;
	if (!isAtDeletionBoundary) return false;

	// Cursor must be on the last block inside the cell
	const lastLeaf: BlockId = getLastLeafInCell(state, tableCtx.cellId);
	if (sel.anchor.blockId !== lastLeaf) return false;

	return selectTableNode(context, tableCtx.tableId);
}

/** ArrowDown: move to same column in next row. */
function handleArrowDown(context: PluginContext): boolean {
	const state = context.getState();
	if (isNodeSelection(state.selection)) return false;
	const tableCtx: TableContext | null = findTableContext(state, state.selection.anchor.blockId);
	if (!tableCtx) return false;

	// Only intercept when cursor is on the last block in the cell
	const lastLeaf: BlockId = getLastLeafInCell(state, tableCtx.cellId);
	if (state.selection.anchor.blockId !== lastLeaf) return false;

	if (tableCtx.rowIndex >= tableCtx.totalRows - 1) {
		// At last row — move cursor to paragraph after table
		return handleEscape(context);
	}

	return moveToCellAndSelect(context, tableCtx.tableId, tableCtx.rowIndex + 1, tableCtx.colIndex);
}

/** ArrowUp: move to same column in previous row. */
function handleArrowUp(context: PluginContext): boolean {
	const state = context.getState();
	if (isNodeSelection(state.selection)) return false;
	const tableCtx: TableContext | null = findTableContext(state, state.selection.anchor.blockId);
	if (!tableCtx) return false;

	// Only intercept when cursor is on the first block in the cell
	const firstLeaf: BlockId = getFirstLeafInCell(state, tableCtx.cellId);
	if (state.selection.anchor.blockId !== firstLeaf) return false;

	if (tableCtx.rowIndex <= 0) {
		// At first row — let default behavior handle it
		return false;
	}

	return moveToCellAndSelect(context, tableCtx.tableId, tableCtx.rowIndex - 1, tableCtx.colIndex);
}

/** ArrowRight at cell end: move to next cell. */
function handleArrowRight(context: PluginContext): boolean {
	const state = context.getState();
	const sel = state.selection;
	if (isNodeSelection(sel)) return false;
	if (!isCollapsed(sel)) return false;

	const block = state.getBlock(sel.anchor.blockId);
	if (!block) return false;

	const blockLen: number = getBlockLength(block);
	if (sel.anchor.offset !== blockLen) return false;

	const tableCtx: TableContext | null = findTableContext(state, sel.anchor.blockId);
	if (!tableCtx) return false;

	// Only jump to next cell when cursor is on the last block in the cell
	const lastLeaf: BlockId = getLastLeafInCell(state, tableCtx.cellId);
	if (sel.anchor.blockId !== lastLeaf) return false;

	// Try next cell in same row
	if (tableCtx.colIndex < tableCtx.totalCols - 1) {
		return moveToCellAndSelect(context, tableCtx.tableId, tableCtx.rowIndex, tableCtx.colIndex + 1);
	}

	// Try first cell in next row
	if (tableCtx.rowIndex < tableCtx.totalRows - 1) {
		return moveToCellAndSelect(context, tableCtx.tableId, tableCtx.rowIndex + 1, 0);
	}

	return true;
}

/** ArrowLeft at cell start: move to previous cell. */
function handleArrowLeft(context: PluginContext): boolean {
	const state = context.getState();
	const sel = state.selection;
	if (isNodeSelection(sel)) return false;
	if (!isCollapsed(sel)) return false;
	if (sel.anchor.offset !== 0) return false;

	const tableCtx: TableContext | null = findTableContext(state, sel.anchor.blockId);
	if (!tableCtx) return false;

	// Only jump to previous cell when cursor is on the first block in the cell
	const firstLeaf: BlockId = getFirstLeafInCell(state, tableCtx.cellId);
	if (sel.anchor.blockId !== firstLeaf) return false;

	// Try previous cell in same row
	if (tableCtx.colIndex > 0) {
		return moveToCellAtEnd(context, tableCtx.tableId, tableCtx.rowIndex, tableCtx.colIndex - 1);
	}

	// Try last cell in previous row
	if (tableCtx.rowIndex > 0) {
		return moveToCellAtEnd(
			context,
			tableCtx.tableId,
			tableCtx.rowIndex - 1,
			tableCtx.totalCols - 1,
		);
	}

	return true;
}

/** Escape: move cursor to the paragraph after the table. */
function handleEscape(context: PluginContext): boolean {
	const state = context.getState();
	if (isNodeSelection(state.selection)) return false;
	const tableCtx: TableContext | null = findTableContext(state, state.selection.anchor.blockId);
	if (!tableCtx) return false;

	// Find the block after the table
	const nextIndex: number = tableCtx.tableIndex + 1;
	if (nextIndex < state.doc.children.length) {
		const nextBlock = state.doc.children[nextIndex];
		if (!nextBlock) return false;
		const tr = state
			.transaction('command')
			.setSelection(createCollapsedSelection(nextBlock.id, 0))
			.build();
		context.dispatch(tr);
		return true;
	}

	return false;
}

/** Moves cursor to the start of a cell (first leaf block inside). */
function moveToCellAndSelect(
	context: PluginContext,
	tableId: BlockId,
	rowIndex: number,
	colIndex: number,
): boolean {
	const state = context.getState();
	const cellId: BlockId | null = getCellAt(state, tableId, rowIndex, colIndex);
	if (!cellId) return false;

	const leafId: BlockId = getFirstLeafInCell(state, cellId);
	const tr = state.transaction('command').setSelection(createCollapsedSelection(leafId, 0)).build();
	context.dispatch(tr);
	return true;
}

/** Moves cursor to the end of a cell (last leaf block inside, for ArrowLeft). */
function moveToCellAtEnd(
	context: PluginContext,
	tableId: BlockId,
	rowIndex: number,
	colIndex: number,
): boolean {
	const state = context.getState();
	const cellId: BlockId | null = getCellAt(state, tableId, rowIndex, colIndex);
	if (!cellId) return false;

	const leafId: BlockId = getLastLeafInCell(state, cellId);
	const leaf = state.getBlock(leafId);
	if (!leaf) return false;

	const leafLen: number = getBlockLength(leaf);
	const tr = state
		.transaction('command')
		.setSelection(createCollapsedSelection(leafId, leafLen))
		.build();
	context.dispatch(tr);
	return true;
}

/** Switches current selection to a table NodeSelection. */
function selectTableNode(context: PluginContext, tableId: BlockId): boolean {
	const state = context.getState();
	const path = state.getNodePath(tableId);
	if (!path) return false;

	const tr = state.transaction('input').setSelection(createNodeSelection(tableId, path)).build();
	context.dispatch(tr);
	return true;
}
