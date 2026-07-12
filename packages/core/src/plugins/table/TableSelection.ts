/**
 * Multi-cell selection service for tables.
 * Tracks selected cell range and provides IDs for bulk formatting.
 */

import { createCollapsedSelection, isTextSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { isEventFromEditorContent } from '../../platform/EditorEventBoundary.js';
import type { EditorState } from '../../state/EditorState.js';
import { ServiceKey } from '../Plugin.js';
import type { PluginContext } from '../Plugin.js';
import { type TableGrid, createTableGrid, expandTableGridRange } from './TableGrid.js';
import { findTableContext, getFirstLeafInCell } from './TableHelpers.js';

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
	let selectedStructure: string | null = null;
	let cachedCellIds: readonly BlockId[] = [];
	let cachedCellIdSet: Set<BlockId> = new Set();

	function updateCache(): void {
		const current = resolveCurrentSelection();
		if (!current) {
			cachedCellIds = [];
			cachedCellIdSet = new Set();
			return;
		}

		const { grid, range } = current;

		const ids: BlockId[] = grid
			.cellsInRange({
				fromRow: range.fromRow,
				fromColumn: range.fromCol,
				toRow: range.toRow,
				toColumn: range.toCol,
			})
			.map((entry) => entry.cell.id);

		cachedCellIds = ids;
		cachedCellIdSet = new Set(ids);
	}

	function resolveCurrentSelection(): {
		readonly range: CellRange;
		readonly grid: TableGrid;
	} | null {
		if (!selectedRange || !selectedStructure) return null;
		const table = context.getState().getBlock(selectedRange.tableId);
		if (!table || table.type !== 'table') {
			clearInternal();
			return null;
		}
		const grid: TableGrid = createTableGrid(table);
		if (tableStructureSignature(grid) !== selectedStructure) {
			clearInternal();
			return null;
		}
		return { range: selectedRange, grid };
	}

	function clearInternal(): void {
		selectedRange = null;
		selectedStructure = null;
		cachedCellIds = [];
		cachedCellIdSet = new Set();
	}

	const service: TableSelectionService = {
		getSelectedRange(): CellRange | null {
			return resolveCurrentSelection()?.range ?? null;
		},

		setSelectedRange(range: CellRange | null): void {
			const state: EditorState = context.getState();
			let focusCellId: BlockId | null = null;
			if (!range) {
				clearInternal();
			} else {
				const table = context.getState().getBlock(range.tableId);
				const grid: TableGrid | null = table?.type === 'table' ? createTableGrid(table) : null;
				const coordinates: readonly number[] = [
					range.fromRow,
					range.fromCol,
					range.toRow,
					range.toCol,
				];
				const valid: boolean =
					!!grid &&
					coordinates.every(Number.isInteger) &&
					range.fromRow >= 0 &&
					range.toRow >= 0 &&
					range.fromCol >= 0 &&
					range.toCol >= 0 &&
					range.fromRow < grid.rowCount &&
					range.toRow < grid.rowCount &&
					range.fromCol < grid.columnCount &&
					range.toCol < grid.columnCount;
				const expanded =
					valid && grid
						? expandTableGridRange(grid, {
								fromRow: range.fromRow,
								fromColumn: range.fromCol,
								toRow: range.toRow,
								toColumn: range.toCol,
							})
						: null;
				if (!grid || !expanded) {
					clearInternal();
				} else {
					selectedRange = {
						tableId: range.tableId,
						fromRow: expanded.fromRow,
						fromCol: expanded.fromColumn,
						toRow: expanded.toRow,
						toCol: expanded.toColumn,
					};
					selectedStructure = tableStructureSignature(grid);
					focusCellId = grid.cellAt(expanded.fromRow, expanded.fromColumn)?.cell.id ?? null;
				}
			}
			updateCache();
			const currentTable = isTextSelection(state.selection)
				? findTableContext(state, state.selection.anchor.blockId)
				: null;
			const selection =
				focusCellId && currentTable?.tableId !== range?.tableId
					? createCollapsedSelection(getFirstLeafInCell(state, focusCellId), 0)
					: state.selection;
			context.dispatch(state.transaction('api').setSelection(selection).build());
		},

		clearSelectionSilent(): void {
			clearInternal();
		},

		getSelectedCellIds(): readonly BlockId[] {
			updateCache();
			return cachedCellIds;
		},

		isSelected(cellId: BlockId): boolean {
			updateCache();
			return cachedCellIdSet.has(cellId);
		},
	};

	context.registerService(TableSelectionServiceKey, service);
	return service;
}

function tableStructureSignature(grid: TableGrid): string {
	return JSON.stringify({
		rows: grid.rows.map((row) => row.id),
		cells: grid.cells.map((entry) => [
			entry.cell.id,
			entry.rowStart,
			entry.rowEnd,
			entry.columnStart,
			entry.columnEnd,
		]),
	});
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
	let anchorCell: {
		tableId: BlockId;
		cellId: BlockId;
		rowStart: number;
		rowEnd: number;
		colStart: number;
		colEnd: number;
	} | null = null;
	let isDragging = false;

	function handleMouseDown(e: MouseEvent): void {
		if (e.button !== 0 || context.isReadOnly?.()) return;
		if (!isEventFromEditorContent(e, container)) return;
		const target = e.target as HTMLElement;
		const cellEl: HTMLElement | null = target.closest('td[data-block-id]');
		if (!cellEl) {
			anchorCell = null;
			isDragging = false;
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
			if (!tableCtx) {
				anchorCell = null;
				isDragging = false;
				return;
			}

			anchorCell = {
				tableId: tableCtx.tableId,
				cellId: tableCtx.cellId,
				rowStart: tableCtx.rowIndex,
				rowEnd: tableCtx.rowEnd,
				colStart: tableCtx.colIndex,
				colEnd: tableCtx.colEnd,
			};
			isDragging = true;
			// Don't set range yet — wait for mousemove to avoid interfering with clicks
		} else if (anchorCell) {
			// Shift-click: extend selection
			const state: EditorState = context.getState();
			const cellId = cellEl.getAttribute('data-block-id') as BlockId;
			const tableCtx = findTableContext(state, cellId);
			if (!tableCtx || tableCtx.tableId !== anchorCell.tableId) {
				anchorCell = null;
				service.setSelectedRange(null);
				return;
			}

			e.preventDefault();
			service.setSelectedRange(rangeCoveringCells(anchorCell, tableCtx));
		}
	}

	function handleMouseMove(e: MouseEvent): void {
		if (context.isReadOnly?.() || !isDragging || !anchorCell) return;

		const target = e.target as HTMLElement;
		const cellEl: HTMLElement | null = target.closest('td[data-block-id]');
		if (!cellEl) return;

		const state: EditorState = context.getState();
		const cellId = cellEl.getAttribute('data-block-id') as BlockId;
		const tableCtx = findTableContext(state, cellId);
		if (!tableCtx || tableCtx.tableId !== anchorCell.tableId) return;

		// Only set range if we've moved to a different cell
		if (tableCtx.cellId !== anchorCell.cellId) {
			e.preventDefault();
			service.setSelectedRange(rangeCoveringCells(anchorCell, tableCtx));
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

function rangeCoveringCells(
	anchor: {
		readonly tableId: BlockId;
		readonly rowStart: number;
		readonly rowEnd: number;
		readonly colStart: number;
		readonly colEnd: number;
	},
	target: {
		readonly rowIndex: number;
		readonly rowEnd: number;
		readonly colIndex: number;
		readonly colEnd: number;
	},
): CellRange {
	return {
		tableId: anchor.tableId,
		fromRow: Math.min(anchor.rowStart, target.rowIndex),
		fromCol: Math.min(anchor.colStart, target.colIndex),
		toRow: Math.max(anchor.rowEnd, target.rowEnd) - 1,
		toCol: Math.max(anchor.colEnd, target.colEnd) - 1,
	};
}
