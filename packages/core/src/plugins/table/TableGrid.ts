/**
 * Canonical logical-grid mapping for table rows, cells, colspan, and rowspan.
 *
 * Every table feature uses this module instead of treating a cell's child-array
 * index as its column. Coordinates are zero-based and ranges are inclusive,
 * matching {@link CellRange} in the table selection service.
 */

import { type BlockNode, getBlockChildren } from '../../model/Document.js';
import type { BlockId } from '../../model/TypeBrands.js';

/** Defensive upper bound for malformed externally supplied span attributes. */
export const MAX_TABLE_SPAN = 1_000;

/** Maximum logical columns materialized for one untrusted table. */
export const MAX_TABLE_COLUMNS = 1_000;

/** One source cell and the logical rectangle it occupies. */
export interface TableGridCell {
	readonly cell: BlockNode;
	readonly sourceRow: BlockNode;
	readonly sourceRowIndex: number;
	readonly sourceCellIndex: number;
	readonly rowStart: number;
	readonly rowEnd: number;
	readonly columnStart: number;
	readonly columnEnd: number;
	readonly rowSpan: number;
	readonly columnSpan: number;
}

/** Inclusive logical rectangle. */
export interface TableGridRange {
	readonly fromRow: number;
	readonly fromColumn: number;
	readonly toRow: number;
	readonly toColumn: number;
}

/** Read-only logical table map. */
export interface TableGrid {
	readonly table: BlockNode;
	readonly rows: readonly BlockNode[];
	readonly rowCount: number;
	readonly columnCount: number;
	readonly cells: readonly TableGridCell[];
	cellAt(row: number, column: number): TableGridCell | undefined;
	cellById(cellId: BlockId): TableGridCell | undefined;
	cellsInRange(range: TableGridRange): readonly TableGridCell[];
}

/** Expands an inclusive range to a fixed point so no spanning cell is cut. */
export function expandTableGridRange(
	grid: TableGrid,
	range: TableGridRange,
): TableGridRange | null {
	if (grid.rowCount === 0 || grid.columnCount === 0) return null;
	let expanded: TableGridRange = {
		fromRow: clampRangeIndex(Math.min(range.fromRow, range.toRow), grid.rowCount),
		fromColumn: clampRangeIndex(Math.min(range.fromColumn, range.toColumn), grid.columnCount),
		toRow: clampRangeIndex(Math.max(range.fromRow, range.toRow), grid.rowCount),
		toColumn: clampRangeIndex(Math.max(range.fromColumn, range.toColumn), grid.columnCount),
	};
	while (true) {
		let fromRow: number = expanded.fromRow;
		let fromColumn: number = expanded.fromColumn;
		let toRow: number = expanded.toRow;
		let toColumn: number = expanded.toColumn;
		for (const entry of grid.cellsInRange(expanded)) {
			fromRow = Math.min(fromRow, entry.rowStart);
			fromColumn = Math.min(fromColumn, entry.columnStart);
			toRow = Math.max(toRow, entry.rowEnd - 1);
			toColumn = Math.max(toColumn, entry.columnEnd - 1);
		}
		if (
			fromRow === expanded.fromRow &&
			fromColumn === expanded.fromColumn &&
			toRow === expanded.toRow &&
			toColumn === expanded.toColumn
		) {
			return expanded;
		}
		expanded = { fromRow, fromColumn, toRow, toColumn };
	}
}

/** Converts an untrusted span value to a bounded positive integer. */
export function normalizeTableSpan(value: unknown, maximum = MAX_TABLE_SPAN): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) return 1;
	if (value <= 1) return 1;
	return Math.min(value, maximum);
}

/** Builds the logical grid for a table node. Non-table input yields an empty grid. */
export function createTableGrid(table: BlockNode): TableGrid {
	const rows: readonly BlockNode[] =
		table.type === 'table' ? getBlockChildren(table).filter((row) => row.type === 'table_row') : [];
	const slots: (TableGridCell | undefined)[][] = Array.from({ length: rows.length }, () => []);
	const cells: TableGridCell[] = [];
	const byId = new Map<BlockId, TableGridCell>();
	let columnCount = 0;

	for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
		const sourceRow: BlockNode | undefined = rows[rowIndex];
		if (!sourceRow) continue;
		const sourceCells: readonly BlockNode[] = getBlockChildren(sourceRow).filter(
			(cell) => cell.type === 'table_cell',
		);
		let column = 0;

		for (let sourceCellIndex = 0; sourceCellIndex < sourceCells.length; sourceCellIndex++) {
			const cell: BlockNode | undefined = sourceCells[sourceCellIndex];
			if (!cell) continue;

			const requestedColumnSpan: number = normalizeTableSpan(cell.attrs?.colspan);
			const requestedRowSpan: number = normalizeTableSpan(cell.attrs?.rowspan);
			const rowSpan: number = Math.min(requestedRowSpan, rows.length - rowIndex);

			const availableColumn: number | undefined = findAvailableColumn(
				slots[rowIndex] ?? [],
				column,
				requestedColumnSpan,
			);
			if (availableColumn === undefined) continue;
			column = availableColumn;
			const columnSpan: number = Math.min(requestedColumnSpan, MAX_TABLE_COLUMNS - column);
			const entry: TableGridCell = {
				cell,
				sourceRow,
				sourceRowIndex: rowIndex,
				sourceCellIndex,
				rowStart: rowIndex,
				rowEnd: rowIndex + rowSpan,
				columnStart: column,
				columnEnd: column + columnSpan,
				rowSpan,
				columnSpan,
			};

			cells.push(entry);
			byId.set(cell.id, entry);
			for (let occupiedRow = entry.rowStart; occupiedRow < entry.rowEnd; occupiedRow++) {
				const rowSlots: (TableGridCell | undefined)[] | undefined = slots[occupiedRow];
				if (!rowSlots) continue;
				for (
					let occupiedColumn = entry.columnStart;
					occupiedColumn < entry.columnEnd;
					occupiedColumn++
				) {
					// Malformed overlapping spans never overwrite the first valid owner.
					rowSlots[occupiedColumn] ??= entry;
				}
			}
			column = entry.columnEnd;
			columnCount = Math.max(columnCount, entry.columnEnd);
		}
	}

	return {
		table,
		rows,
		rowCount: rows.length,
		columnCount,
		cells,
		cellAt(row: number, column: number): TableGridCell | undefined {
			if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || column < 0) {
				return undefined;
			}
			return slots[row]?.[column];
		},
		cellById(cellId: BlockId): TableGridCell | undefined {
			return byId.get(cellId);
		},
		cellsInRange(range: TableGridRange): readonly TableGridCell[] {
			const minRow: number = Math.max(0, Math.min(range.fromRow, range.toRow));
			const maxRow: number = Math.min(rows.length - 1, Math.max(range.fromRow, range.toRow));
			const minColumn: number = Math.max(0, Math.min(range.fromColumn, range.toColumn));
			const maxColumn: number = Math.min(
				columnCount - 1,
				Math.max(range.fromColumn, range.toColumn),
			);
			if (maxRow < minRow || maxColumn < minColumn) return [];

			return cells.filter(
				(entry) =>
					entry.rowStart <= maxRow &&
					entry.rowEnd > minRow &&
					entry.columnStart <= maxColumn &&
					entry.columnEnd > minColumn,
			);
		},
	};
}

/**
 * Projects canonical column-width metadata onto a clipboard table slice.
 * Metadata is retained only when the surviving cells cover one contiguous,
 * unambiguous run of the original logical columns.
 */
export function projectTableColumnWidthsForSlice(original: BlockNode, slice: BlockNode): BlockNode {
	const retainedIds = new Set<BlockId>();
	const retainedRowIds = new Set<BlockId>();
	for (const row of getBlockChildren(slice)) {
		retainedRowIds.add(row.id);
		for (const cell of getBlockChildren(row)) retainedIds.add(cell.id);
	}
	const grid: TableGrid = createTableGrid(original);
	const retainedEntries: readonly TableGridCell[] = grid.cells.filter((entry) =>
		retainedIds.has(entry.cell.id),
	);
	if (retainedEntries.length === 0) return withoutColumnWidths(slice);

	const firstColumn: number = Math.min(...retainedEntries.map((entry) => entry.columnStart));
	const lastColumn: number = Math.max(...retainedEntries.map((entry) => entry.columnEnd)) - 1;
	const retainedRowIndexes: readonly number[] = grid.rows
		.map((row, index) => (retainedRowIds.has(row.id) ? index : -1))
		.filter((index) => index >= 0);
	if (retainedRowIndexes.length === 0) return withoutColumnWidths(slice);
	const firstRow: number = Math.min(...retainedRowIndexes);
	const lastRow: number = Math.max(...retainedRowIndexes);
	const normalizedSlice: BlockNode = normalizeSelectionSliceSpans(
		slice,
		grid,
		firstRow,
		lastRow,
		firstColumn,
		lastColumn,
	);
	for (const rowIndex of retainedRowIndexes) {
		const coveredColumns = new Set<number>();
		for (const entry of retainedEntries) {
			if (entry.rowStart > rowIndex || entry.rowEnd <= rowIndex) continue;
			for (let column = entry.columnStart; column < entry.columnEnd; column++) {
				coveredColumns.add(column);
			}
		}
		for (let column = firstColumn; column <= lastColumn; column++) {
			if (!coveredColumns.has(column)) return withoutColumnWidths(normalizedSlice);
		}
	}

	const rawWidths: unknown = original.attrs?.columnWidthsPx;
	if (!Array.isArray(rawWidths)) return normalizedSlice;

	const projected: (number | null)[] = [];
	for (let column = firstColumn; column <= lastColumn; column++) {
		const value: unknown = rawWidths[column];
		projected.push(typeof value === 'number' && Number.isFinite(value) ? value : null);
	}
	if (!projected.some((value) => value !== null)) return withoutColumnWidths(normalizedSlice);

	return {
		...normalizedSlice,
		attrs: {
			...(normalizedSlice.attrs ?? {}),
			columnWidthsPx: Object.freeze(projected),
		},
	};
}

function normalizeSelectionSliceSpans(
	slice: BlockNode,
	grid: TableGrid,
	firstRow: number,
	lastRow: number,
	firstColumn: number,
	lastColumn: number,
): BlockNode {
	let changed = false;
	const rows: readonly BlockNode[] = getBlockChildren(slice).map((row) => {
		let rowChanged = false;
		const cells: readonly BlockNode[] = getBlockChildren(row).map((cell) => {
			const entry: TableGridCell | undefined = grid.cellById(cell.id);
			if (!entry) return cell;
			const rowSpan: number =
				Math.min(entry.rowEnd, lastRow + 1) - Math.max(entry.rowStart, firstRow);
			const columnSpan: number =
				Math.min(entry.columnEnd, lastColumn + 1) - Math.max(entry.columnStart, firstColumn);
			const previousRowSpan: number = normalizeTableSpan(cell.attrs?.rowspan);
			const previousColumnSpan: number = normalizeTableSpan(cell.attrs?.colspan);
			if (rowSpan === previousRowSpan && columnSpan === previousColumnSpan) return cell;
			rowChanged = true;
			const { colspan: _colspan, rowspan: _rowspan, ...rest } = cell.attrs ?? {};
			const attrs = {
				...rest,
				...(columnSpan > 1 ? { colspan: columnSpan } : {}),
				...(rowSpan > 1 ? { rowspan: rowSpan } : {}),
			};
			const { attrs: _attrs, ...withoutAttrs } = cell;
			return Object.keys(attrs).length > 0 ? { ...withoutAttrs, attrs } : withoutAttrs;
		});
		if (!rowChanged) return row;
		changed = true;
		return { ...row, children: cells };
	});
	return changed ? { ...slice, children: rows } : slice;
}

/**
 * Creates a self-contained table fragment for an inclusive logical rectangle.
 * The requested rectangle first expands to whole spanning cells. Owners are
 * emitted once, and dimensions are projected from their canonical logical
 * columns and rows.
 */
export function sliceTableToRange(table: BlockNode, range: TableGridRange): BlockNode | null {
	const grid: TableGrid = createTableGrid(table);
	if (grid.rowCount === 0 || grid.columnCount === 0) return null;
	const expanded: TableGridRange | null = expandTableGridRange(grid, range);
	if (!expanded) return null;
	const { fromRow, fromColumn, toRow, toColumn } = expanded;
	const retainedCells: readonly TableGridCell[] = grid.cellsInRange({
		fromRow,
		fromColumn,
		toRow,
		toColumn,
	});

	const rows: BlockNode[] = [];
	const preservesCompleteRows: boolean = fromColumn === 0 && toColumn === grid.columnCount - 1;
	for (let logicalRow = fromRow; logicalRow <= toRow; logicalRow++) {
		const sourceRow: BlockNode | undefined = grid.rows[logicalRow];
		if (!sourceRow) continue;
		const cells: BlockNode[] = retainedCells
			.filter((entry: TableGridCell): boolean => Math.max(entry.rowStart, fromRow) === logicalRow)
			.sort(
				(a: TableGridCell, b: TableGridCell): number =>
					Math.max(a.columnStart, fromColumn) - Math.max(b.columnStart, fromColumn),
			)
			.map((entry: TableGridCell): BlockNode => {
				const rowSpan: number =
					Math.min(entry.rowEnd, toRow + 1) - Math.max(entry.rowStart, fromRow);
				const columnSpan: number =
					Math.min(entry.columnEnd, toColumn + 1) - Math.max(entry.columnStart, fromColumn);
				const { colspan: _colspan, rowspan: _rowspan, ...rest } = entry.cell.attrs ?? {};
				const attrs = {
					...rest,
					...(columnSpan > 1 ? { colspan: columnSpan } : {}),
					...(rowSpan > 1 ? { rowspan: rowSpan } : {}),
				};
				const { attrs: _attrs, ...withoutAttrs } = entry.cell;
				return Object.keys(attrs).length > 0 ? { ...withoutAttrs, attrs } : withoutAttrs;
			});
		const { htmlId: _rowHTMLId, ...rowWithoutHTMLId } = sourceRow;
		rows.push({
			...(preservesCompleteRows ? sourceRow : rowWithoutHTMLId),
			children: cells,
		});
	}

	const { columnWidthsPx: _columnWidthsPx, ...tableAttrs } = table.attrs ?? {};
	const rawWidths: unknown = table.attrs?.columnWidthsPx;
	const widths: (number | null)[] = [];
	if (Array.isArray(rawWidths)) {
		for (let column = fromColumn; column <= toColumn; column++) {
			const value: unknown = rawWidths[column];
			widths.push(typeof value === 'number' && Number.isFinite(value) ? value : null);
		}
	}
	const attrs = {
		...tableAttrs,
		...(widths.some((width: number | null): boolean => width !== null)
			? { columnWidthsPx: Object.freeze(widths) }
			: {}),
	};
	const preservesCompleteTable: boolean =
		preservesCompleteRows && fromRow === 0 && toRow === grid.rowCount - 1;
	const { attrs: _attrs, ...tableWithoutAttrs } = table;
	const { htmlId: _tableHTMLId, ...tableWithoutAttrsAndHTMLId } = tableWithoutAttrs;
	const withoutAttrs = preservesCompleteTable ? tableWithoutAttrs : tableWithoutAttrsAndHTMLId;
	return Object.keys(attrs).length > 0
		? { ...withoutAttrs, children: rows, attrs }
		: { ...withoutAttrs, children: rows };
}

function withoutColumnWidths(table: BlockNode): BlockNode {
	if (!table.attrs || !Object.hasOwn(table.attrs, 'columnWidthsPx')) return table;
	const { columnWidthsPx: _columnWidthsPx, ...attrs } = table.attrs;
	const { attrs: _attrs, ...withoutAttrs } = table;
	return {
		...withoutAttrs,
		...(Object.keys(attrs).length > 0 ? { attrs } : {}),
	};
}

function findAvailableColumn(
	row: readonly (TableGridCell | undefined)[],
	start: number,
	span: number,
): number | undefined {
	let column: number = Math.max(0, start);
	while (column + span <= MAX_TABLE_COLUMNS) {
		let available = true;
		for (let offset = 0; offset < span; offset++) {
			if (row[column + offset]) {
				available = false;
				column += offset + 1;
				break;
			}
		}
		if (available) return column;
	}
	return undefined;
}

function clampRangeIndex(value: number, upperBound: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(upperBound - 1, Math.max(0, Math.trunc(value)));
}
