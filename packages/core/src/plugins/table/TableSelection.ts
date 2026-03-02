/**
 * Multi-cell selection service for tables.
 * Tracks selected cell range and provides IDs for bulk formatting.
 */

import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import { ServiceKey } from '../Plugin.js';
import type { PluginContext } from '../Plugin.js';
import { findTableContext, getCellAt } from './TableHelpers.js';

/** Rectangular range of cells within a table. */
export interface CellRange {
	readonly tableId: BlockId;
	readonly fromRow: number;
	readonly fromCol: number;
	readonly toRow: number;
	readonly toCol: number;
}

/** Service for managing multi-cell selection. */
export interface TableSelectionService {
	getSelectedRange(): CellRange | null;
	setSelectedRange(range: CellRange | null): void;
	/** Clears selection state without dispatching a transaction (for use in decorations). */
	clearSelectionSilent(): void;
	getSelectedCellIds(): readonly BlockId[];
	isSelected(cellId: BlockId): boolean;
}

export const TableSelectionServiceKey = new ServiceKey<TableSelectionService>('tableSelection');

/** Creates and registers the TableSelectionService. */
export function createTableSelectionService(context: PluginContext): TableSelectionService {
	let selectedRange: CellRange | null = null;
	let cachedCellIds: readonly BlockId[] = [];
	let cachedCellIdSet: Set<BlockId> = new Set();

	function updateCache(): void {
		if (!selectedRange) {
			cachedCellIds = [];
			cachedCellIdSet = new Set();
			return;
		}

		const state: EditorState = context.getState();
		const ids: BlockId[] = [];

		const minRow: number = Math.min(selectedRange.fromRow, selectedRange.toRow);
		const maxRow: number = Math.max(selectedRange.fromRow, selectedRange.toRow);
		const minCol: number = Math.min(selectedRange.fromCol, selectedRange.toCol);
		const maxCol: number = Math.max(selectedRange.fromCol, selectedRange.toCol);

		for (let r = minRow; r <= maxRow; r++) {
			for (let c = minCol; c <= maxCol; c++) {
				const cellId: BlockId | null = getCellAt(state, selectedRange.tableId, r, c);
				if (cellId) ids.push(cellId);
			}
		}

		cachedCellIds = ids;
		cachedCellIdSet = new Set(ids);
	}

	const service: TableSelectionService = {
		getSelectedRange(): CellRange | null {
			return selectedRange;
		},

		setSelectedRange(range: CellRange | null): void {
			selectedRange = range;
			updateCache();
			const state: EditorState = context.getState();
			context.dispatch(state.transaction('api').setSelection(state.selection).build());
		},

		clearSelectionSilent(): void {
			selectedRange = null;
			updateCache();
		},

		getSelectedCellIds(): readonly BlockId[] {
			return cachedCellIds;
		},

		isSelected(cellId: BlockId): boolean {
			return cachedCellIdSet.has(cellId);
		},
	};

	context.registerService(TableSelectionServiceKey, service);
	return service;
}

/**
 * Installs mouse handlers for multi-cell selection on the editor container.
 * Returns a cleanup function.
 */
export function installMouseSelection(
	context: PluginContext,
	service: TableSelectionService,
): () => void {
	const container: HTMLElement = context.getContainer();
	let anchorCell: { tableId: BlockId; row: number; col: number } | null = null;
	let isDragging = false;

	function handleMouseDown(e: MouseEvent): void {
		const target = e.target as HTMLElement;
		const cellEl: HTMLElement | null = target.closest('td[data-block-id]');
		if (!cellEl) {
			service.setSelectedRange(null);
			return;
		}

		if (!e.shiftKey) {
			// Clear any existing multi-cell selection before starting a new anchor
			service.setSelectedRange(null);
			// Start new selection anchor
			const state: EditorState = context.getState();
			const cellId = cellEl.getAttribute('data-block-id') as BlockId;
			const tableCtx = findTableContext(state, cellId);
			if (!tableCtx) return;

			anchorCell = {
				tableId: tableCtx.tableId,
				row: tableCtx.rowIndex,
				col: tableCtx.colIndex,
			};
			isDragging = true;
			// Don't set range yet — wait for mousemove to avoid interfering with clicks
		} else if (anchorCell) {
			// Shift-click: extend selection
			const state: EditorState = context.getState();
			const cellId = cellEl.getAttribute('data-block-id') as BlockId;
			const tableCtx = findTableContext(state, cellId);
			if (!tableCtx || tableCtx.tableId !== anchorCell.tableId) return;

			e.preventDefault();
			service.setSelectedRange({
				tableId: anchorCell.tableId,
				fromRow: anchorCell.row,
				fromCol: anchorCell.col,
				toRow: tableCtx.rowIndex,
				toCol: tableCtx.colIndex,
			});
		}
	}

	function handleMouseMove(e: MouseEvent): void {
		if (!isDragging || !anchorCell) return;

		const target = e.target as HTMLElement;
		const cellEl: HTMLElement | null = target.closest('td[data-block-id]');
		if (!cellEl) return;

		const state: EditorState = context.getState();
		const cellId = cellEl.getAttribute('data-block-id') as BlockId;
		const tableCtx = findTableContext(state, cellId);
		if (!tableCtx || tableCtx.tableId !== anchorCell.tableId) return;

		// Only set range if we've moved to a different cell
		if (tableCtx.rowIndex !== anchorCell.row || tableCtx.colIndex !== anchorCell.col) {
			e.preventDefault();
			service.setSelectedRange({
				tableId: anchorCell.tableId,
				fromRow: anchorCell.row,
				fromCol: anchorCell.col,
				toRow: tableCtx.rowIndex,
				toCol: tableCtx.colIndex,
			});
		}
	}

	function handleMouseUp(): void {
		isDragging = false;
	}

	container.addEventListener('mousedown', handleMouseDown);
	container.addEventListener('mousemove', handleMouseMove);
	document.addEventListener('mouseup', handleMouseUp);

	return () => {
		container.removeEventListener('mousedown', handleMouseDown);
		container.removeEventListener('mousemove', handleMouseMove);
		document.removeEventListener('mouseup', handleMouseUp);
	};
}
