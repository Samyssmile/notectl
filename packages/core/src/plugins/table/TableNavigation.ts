/**
 * Keyboard navigation handlers for table cells.
 * Handles Tab, Shift-Tab, arrow keys, Enter, Backspace, Delete, and Escape.
 */

import type { Keymap } from '../../input/Keymap.js';
import { getBlockLength } from '../../model/Document.js';
import {
	type Selection,
	createCollapsedSelection,
	createNodeSelection,
	isCollapsed,
	isNodeSelection,
} from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { PluginContext } from '../Plugin.js';
import { addRowBelow } from './TableCommands.js';
import { type TableContextMenuHandle, createTableContextMenu } from './TableContextMenu.js';
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
		'Shift-F10': () => handleContextMenu(context),
	};

	context.registerKeymap(keymap);
}

/**
 * Guards against NodeSelection and resolves TableContext.
 * Passes the narrowed text Selection to the handler, avoiding re-narrowing.
 * Returns false (not handled) if the cursor is not inside a table.
 */
function withTableContext(
	context: PluginContext,
	handler: (state: EditorState, sel: Selection, tableCtx: TableContext) => boolean,
): boolean {
	const state: EditorState = context.getState();
	if (isNodeSelection(state.selection)) return false;
	const sel: Selection = state.selection;
	const tableCtx: TableContext | null = findTableContext(state, sel.anchor.blockId);
	if (!tableCtx) return false;
	return handler(state, sel, tableCtx);
}

/** Tab: move to next cell. At end of table, add a new row. */
function handleTab(context: PluginContext): boolean {
	return withTableContext(context, (_state, _sel, tableCtx) => {
		if (tableCtx.colIndex < tableCtx.totalCols - 1) {
			return moveToCellAndSelect(
				context,
				tableCtx.tableId,
				tableCtx.rowIndex,
				tableCtx.colIndex + 1,
			);
		}

		if (tableCtx.rowIndex < tableCtx.totalRows - 1) {
			return moveToCellAndSelect(context, tableCtx.tableId, tableCtx.rowIndex + 1, 0);
		}

		addRowBelow(context);
		return true;
	});
}

/** Shift-Tab: move to previous cell. At start of table, stay put. */
function handleShiftTab(context: PluginContext): boolean {
	return withTableContext(context, (_state, _sel, tableCtx) => {
		if (tableCtx.colIndex > 0) {
			return moveToCellAndSelect(
				context,
				tableCtx.tableId,
				tableCtx.rowIndex,
				tableCtx.colIndex - 1,
			);
		}

		if (tableCtx.rowIndex > 0) {
			return moveToCellAndSelect(
				context,
				tableCtx.tableId,
				tableCtx.rowIndex - 1,
				tableCtx.totalCols - 1,
			);
		}

		return true;
	});
}

/** Enter: move to same column in next row (spreadsheet behavior). */
function handleEnter(context: PluginContext): boolean {
	const state: EditorState = context.getState();
	if (isNodeSelection(state.selection)) return false;

	const block = state.getBlock(state.selection.anchor.blockId);
	// Only intercept Enter for paragraphs inside table cells.
	// Other block types (list_item, heading, etc.) are handled by their plugins.
	if (block && block.type !== 'paragraph') return false;

	const tableCtx: TableContext | null = findTableContext(state, state.selection.anchor.blockId);
	if (!tableCtx) return false;

	if (tableCtx.rowIndex < tableCtx.totalRows - 1) {
		return moveToCellAndSelect(context, tableCtx.tableId, tableCtx.rowIndex + 1, tableCtx.colIndex);
	}

	// On last row — block to prevent splitBlock
	return true;
}

/** Backspace at deletion-boundary: select table node (first step of 2-step delete). */
function handleBackspace(context: PluginContext): boolean {
	return withTableContext(context, (state, sel, tableCtx) => {
		if (!isCollapsed(sel)) return false;
		if (sel.anchor.offset !== 0) return false;

		const isAtDeletionBoundary: boolean = tableCtx.rowIndex === 0 && tableCtx.colIndex === 0;
		if (!isAtDeletionBoundary) return false;

		const firstLeaf: BlockId = getFirstLeafInCell(state, tableCtx.cellId);
		if (sel.anchor.blockId !== firstLeaf) return false;

		return selectTableNode(context, tableCtx.tableId);
	});
}

/** Delete at deletion-boundary: select table node (first step of 2-step delete). */
function handleDelete(context: PluginContext): boolean {
	return withTableContext(context, (state, sel, tableCtx) => {
		if (!isCollapsed(sel)) return false;

		const block = state.getBlock(sel.anchor.blockId);
		if (!block) return false;

		const blockLen: number = getBlockLength(block);
		if (sel.anchor.offset !== blockLen) return false;

		const isAtDeletionBoundary: boolean =
			tableCtx.rowIndex === tableCtx.totalRows - 1 && tableCtx.colIndex === tableCtx.totalCols - 1;
		if (!isAtDeletionBoundary) return false;

		const lastLeaf: BlockId = getLastLeafInCell(state, tableCtx.cellId);
		if (sel.anchor.blockId !== lastLeaf) return false;

		return selectTableNode(context, tableCtx.tableId);
	});
}

/** ArrowDown: move to same column in next row. */
function handleArrowDown(context: PluginContext): boolean {
	return withTableContext(context, (state, sel, tableCtx) => {
		const lastLeaf: BlockId = getLastLeafInCell(state, tableCtx.cellId);
		if (sel.anchor.blockId !== lastLeaf) return false;

		if (tableCtx.rowIndex >= tableCtx.totalRows - 1) {
			return handleEscape(context);
		}

		return moveToCellAndSelect(context, tableCtx.tableId, tableCtx.rowIndex + 1, tableCtx.colIndex);
	});
}

/** ArrowUp: move to same column in previous row. */
function handleArrowUp(context: PluginContext): boolean {
	return withTableContext(context, (state, sel, tableCtx) => {
		const firstLeaf: BlockId = getFirstLeafInCell(state, tableCtx.cellId);
		if (sel.anchor.blockId !== firstLeaf) return false;

		if (tableCtx.rowIndex <= 0) return false;

		return moveToCellAndSelect(context, tableCtx.tableId, tableCtx.rowIndex - 1, tableCtx.colIndex);
	});
}

/** ArrowRight at cell end: move to next cell. */
function handleArrowRight(context: PluginContext): boolean {
	return withTableContext(context, (state, sel, tableCtx) => {
		if (!isCollapsed(sel)) return false;

		const block = state.getBlock(sel.anchor.blockId);
		if (!block) return false;

		const blockLen: number = getBlockLength(block);
		if (sel.anchor.offset !== blockLen) return false;

		const lastLeaf: BlockId = getLastLeafInCell(state, tableCtx.cellId);
		if (sel.anchor.blockId !== lastLeaf) return false;

		if (tableCtx.colIndex < tableCtx.totalCols - 1) {
			return moveToCellAndSelect(
				context,
				tableCtx.tableId,
				tableCtx.rowIndex,
				tableCtx.colIndex + 1,
			);
		}

		if (tableCtx.rowIndex < tableCtx.totalRows - 1) {
			return moveToCellAndSelect(context, tableCtx.tableId, tableCtx.rowIndex + 1, 0);
		}

		return true;
	});
}

/** ArrowLeft at cell start: move to previous cell. */
function handleArrowLeft(context: PluginContext): boolean {
	return withTableContext(context, (state, sel, tableCtx) => {
		if (!isCollapsed(sel)) return false;
		if (sel.anchor.offset !== 0) return false;

		const firstLeaf: BlockId = getFirstLeafInCell(state, tableCtx.cellId);
		if (sel.anchor.blockId !== firstLeaf) return false;

		if (tableCtx.colIndex > 0) {
			return moveToCellAtEnd(context, tableCtx.tableId, tableCtx.rowIndex, tableCtx.colIndex - 1);
		}

		if (tableCtx.rowIndex > 0) {
			return moveToCellAtEnd(
				context,
				tableCtx.tableId,
				tableCtx.rowIndex - 1,
				tableCtx.totalCols - 1,
			);
		}

		return true;
	});
}

/** Escape: move cursor to the paragraph after the table. */
function handleEscape(context: PluginContext): boolean {
	return withTableContext(context, (state, _sel, tableCtx) => {
		const nextIndex: number = tableCtx.tableIndex + 1;
		if (nextIndex >= state.doc.children.length) return false;

		const nextBlock = state.doc.children[nextIndex];
		if (!nextBlock) return false;

		const tr = state
			.transaction('command')
			.setSelection(createCollapsedSelection(nextBlock.id, 0))
			.build();
		context.dispatch(tr);
		return true;
	});
}

/** Shift-F10: open context menu at current cell. */
function handleContextMenu(context: PluginContext): boolean {
	return withTableContext(context, (_state, _sel, tableCtx) => {
		const container: HTMLElement = context.getContainer();

		// Find the cell element in the DOM
		const cellEl = container.querySelector(
			`[data-block-id="${tableCtx.cellId}"]`,
		) as HTMLElement | null;
		if (!cellEl) return false;

		const cellRect: DOMRect = cellEl.getBoundingClientRect();
		const anchorRect: DOMRect = new DOMRect(
			cellRect.left + cellRect.width / 2,
			cellRect.bottom,
			0,
			0,
		);

		// Find the table container to append the menu
		const tableContainer = container.querySelector(
			`[data-block-id="${tableCtx.tableId}"].ntbl-container`,
		) as HTMLElement | null;

		const menuContainer: HTMLElement = tableContainer ?? container;

		activeContextMenu?.close();
		activeContextMenu = createTableContextMenu(
			menuContainer,
			context,
			tableCtx.tableId,
			anchorRect,
			() => {
				activeContextMenu = null;
			},
		);

		return true;
	});
}

/** Tracks active context menu for Shift-F10 (one at a time). */
let activeContextMenu: TableContextMenuHandle | null = null;

// --- Cell navigation helpers ---

/** Moves cursor to the start of a cell (first leaf block inside). */
function moveToCellAndSelect(
	context: PluginContext,
	tableId: BlockId,
	rowIndex: number,
	colIndex: number,
): boolean {
	const state: EditorState = context.getState();
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
	const state: EditorState = context.getState();
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
	const state: EditorState = context.getState();
	const path = state.getNodePath(tableId);
	if (!path) return false;

	const tr = state.transaction('input').setSelection(createNodeSelection(tableId, path)).build();
	context.dispatch(tr);
	return true;
}
