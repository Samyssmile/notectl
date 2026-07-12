/**
 * Persistent table sizing model and public service.
 *
 * Column widths belong to the table's logical-column vector; row minimum
 * heights belong to table_row nodes. Cell and range targets are resolved
 * through TableGrid so colspan/rowspan never leak child-array coordinates into
 * the public API.
 */

import type { BlockAttrValue, BlockAttrs, BlockNode } from '../../model/Document.js';
import { isTextSelection } from '../../model/Selection.js';
import {
	MAX_TABLE_DIMENSION_PX,
	MIN_TABLE_DIMENSION_PX,
	normalizeTableDimensionPx,
} from '../../model/TableDimensions.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { TransactionBuilder } from '../../state/Transaction.js';
import { type PluginContext, ServiceKey } from '../Plugin.js';
import { type TableGrid, createTableGrid, expandTableGridRange } from './TableGrid.js';
import { findTableContext } from './TableHelpers.js';
import {
	type CellRange,
	type TableSelectionService,
	TableSelectionServiceKey,
} from './TableSelection.js';

// --- Configuration ---

export interface TableSizingConfig {
	readonly minColumnWidthPx: number;
	readonly minRowHeightPx: number;
	readonly maxColumnWidthPx: number;
	readonly maxRowHeightPx: number;
	readonly keyboardResizeStepPx: number;
	readonly keyboardResizeLargeStepPx: number;
}

export const DEFAULT_TABLE_SIZING_CONFIG: Readonly<TableSizingConfig> = Object.freeze({
	minColumnWidthPx: 60,
	minRowHeightPx: 24,
	maxColumnWidthPx: MAX_TABLE_DIMENSION_PX,
	maxRowHeightPx: MAX_TABLE_DIMENSION_PX,
	keyboardResizeStepPx: 8,
	keyboardResizeLargeStepPx: 32,
});

// --- Public API ---

export type TableDimensionInput = number | 'auto';
export type TableDimensionState = number | 'auto' | 'mixed' | 'unavailable';
export type TableSizeDimension = 'columnWidthPx' | 'rowMinHeightPx';

export interface TableSizeInput {
	readonly columnWidthPx?: TableDimensionInput;
	readonly rowMinHeightPx?: TableDimensionInput;
}

export interface TableSizeState {
	readonly columnWidthPx: TableDimensionState;
	readonly rowMinHeightPx: TableDimensionState;
}

export interface TableCellSizeTarget {
	readonly kind: 'cell';
	readonly tableId: BlockId;
	readonly row: number;
	readonly column: number;
}

export interface TableRangeSizeTarget {
	readonly kind: 'range';
	readonly tableId: BlockId;
	readonly fromRow: number;
	readonly fromColumn: number;
	readonly toRow: number;
	readonly toColumn: number;
}

export interface TableColumnSizeTarget {
	readonly kind: 'column';
	readonly tableId: BlockId;
	readonly column: number;
}

export interface TableRowSizeTarget {
	readonly kind: 'row';
	readonly tableId: BlockId;
	readonly row: number;
}

export type TableSizeTarget =
	| TableCellSizeTarget
	| TableRangeSizeTarget
	| TableColumnSizeTarget
	| TableRowSizeTarget;

export interface TableSizingService {
	getSelectionSize(): TableSizeState | null;
	setSelectionSize(input: TableSizeInput): boolean;
	resetSelectionSize(dimension?: TableSizeDimension): boolean;
	getSize(target: TableSizeTarget): TableSizeState | null;
	setSize(target: TableSizeTarget, input: TableSizeInput): boolean;
	resetSize(target: TableSizeTarget, dimension?: TableSizeDimension): boolean;
}

export const TableSizingServiceKey = new ServiceKey<TableSizingService>('tableSizing');

/** Creates and registers the strongly typed table sizing service. */
export function createTableSizingService(
	context: PluginContext,
	config: Partial<TableSizingConfig> = {},
): TableSizingService {
	const resolvedConfig: TableSizingConfig = resolveTableSizingConfig(config);

	const service: TableSizingService = {
		getSelectionSize(): TableSizeState | null {
			const resolved: ResolvedTarget | null = resolveSelectionTarget(context);
			return resolved ? readResolvedSize(resolved) : null;
		},

		setSelectionSize(input: TableSizeInput): boolean {
			if (context.isReadOnly()) return false;
			const resolved: ResolvedTarget | null = resolveSelectionTarget(context);
			return resolved ? applySize(context, resolved, input, resolvedConfig) : false;
		},

		resetSelectionSize(dimension?: TableSizeDimension): boolean {
			if (context.isReadOnly()) return false;
			const resolved: ResolvedTarget | null = resolveSelectionTarget(context);
			return resolved ? resetResolvedSize(context, resolved, dimension, resolvedConfig) : false;
		},

		getSize(target: TableSizeTarget): TableSizeState | null {
			const resolved: ResolvedTarget | null = resolveExplicitTarget(context.getState(), target);
			return resolved ? readResolvedSize(resolved) : null;
		},

		setSize(target: TableSizeTarget, input: TableSizeInput): boolean {
			if (context.isReadOnly()) return false;
			const resolved: ResolvedTarget | null = resolveExplicitTarget(context.getState(), target);
			return resolved ? applySize(context, resolved, input, resolvedConfig) : false;
		},

		resetSize(target: TableSizeTarget, dimension?: TableSizeDimension): boolean {
			if (context.isReadOnly()) return false;
			const resolved: ResolvedTarget | null = resolveExplicitTarget(context.getState(), target);
			return resolved ? resetResolvedSize(context, resolved, dimension, resolvedConfig) : false;
		},
	};

	context.registerService(TableSizingServiceKey, service);
	return service;
}

/** Resolves and clamps every sizing configuration value into safe global bounds. */
export function resolveTableSizingConfig(config: Partial<TableSizingConfig>): TableSizingConfig {
	const minColumnWidthPx: number = normalizeConfigValue(
		config.minColumnWidthPx,
		DEFAULT_TABLE_SIZING_CONFIG.minColumnWidthPx,
	);
	const minRowHeightPx: number = normalizeConfigValue(
		config.minRowHeightPx,
		DEFAULT_TABLE_SIZING_CONFIG.minRowHeightPx,
	);
	const maxColumnWidthPx: number = normalizeConfigValue(
		config.maxColumnWidthPx,
		DEFAULT_TABLE_SIZING_CONFIG.maxColumnWidthPx,
		minColumnWidthPx,
	);
	const maxRowHeightPx: number = normalizeConfigValue(
		config.maxRowHeightPx,
		DEFAULT_TABLE_SIZING_CONFIG.maxRowHeightPx,
		minRowHeightPx,
	);

	return {
		minColumnWidthPx,
		minRowHeightPx,
		maxColumnWidthPx,
		maxRowHeightPx,
		keyboardResizeStepPx: normalizeConfigValue(
			config.keyboardResizeStepPx,
			DEFAULT_TABLE_SIZING_CONFIG.keyboardResizeStepPx,
		),
		keyboardResizeLargeStepPx: normalizeConfigValue(
			config.keyboardResizeLargeStepPx,
			DEFAULT_TABLE_SIZING_CONFIG.keyboardResizeLargeStepPx,
		),
	};
}

// --- Canonical dimension attributes (also used by structural commands) ---

/** Returns a fixed-length logical-width vector. Invalid/missing entries become automatic. */
export function readTableColumnWidthsPx(
	table: BlockNode,
	columnCount: number,
): readonly (number | null)[] {
	const count: number = Math.max(0, Math.trunc(columnCount));
	const raw: BlockAttrValue | undefined = table.attrs?.columnWidthsPx;
	const values: readonly unknown[] = Array.isArray(raw) ? raw : [];
	return Object.freeze(
		Array.from({ length: count }, (_unused: unknown, index: number): number | null => {
			const value: unknown = values[index];
			if (value === null || value === undefined) return null;
			return normalizeStoredDimension(value);
		}),
	);
}

/** Replaces the canonical column-width vector while preserving unrelated table attrs. */
export function withTableColumnWidthsPx(
	attrs: BlockAttrs | undefined,
	widths: readonly (number | null)[],
): BlockAttrs {
	const normalized: readonly (number | null)[] = Object.freeze(
		widths.map((value: number | null): number | null =>
			value === null ? null : normalizeStoredDimension(value),
		),
	);
	const { columnWidthsPx: _columnWidthsPx, ...rest } = attrs ?? {};
	if (!normalized.some((value: number | null): boolean => value !== null)) return rest;
	return { ...rest, columnWidthsPx: normalized };
}

/** Reads a row's canonical minimum height, or null for automatic layout. */
export function readTableRowMinHeightPx(row: BlockNode): number | null {
	return normalizeStoredDimension(row.attrs?.minHeightPx);
}

/** Sets or removes a row's minimum-height attribute while preserving unrelated attrs. */
export function withTableRowMinHeightPx(
	attrs: BlockAttrs | undefined,
	minHeightPx: number | null,
): BlockAttrs {
	const { minHeightPx: _minHeightPx, ...rest } = attrs ?? {};
	if (minHeightPx === null) return rest;
	const normalized: number | null = normalizeStoredDimension(minHeightPx);
	return normalized === null ? rest : { ...rest, minHeightPx: normalized };
}

// --- Resolution ---

interface ResolvedTarget {
	readonly state: EditorState;
	readonly table: BlockNode;
	readonly grid: TableGrid;
	readonly columns: readonly number[];
	readonly rows: readonly number[];
}

function resolveSelectionTarget(context: PluginContext): ResolvedTarget | null {
	const state: EditorState = context.getState();
	const selectionService: TableSelectionService | undefined =
		context.getService(TableSelectionServiceKey);
	const selectedRange: CellRange | null = selectionService?.getSelectedRange() ?? null;
	if (selectedRange) {
		return resolveRange(state, selectedRange.tableId, selectedRange, true);
	}

	if (!isTextSelection(state.selection)) return null;
	const tableContext = findTableContext(state, state.selection.anchor.blockId);
	if (!tableContext) return null;
	return resolveRange(
		state,
		tableContext.tableId,
		{
			tableId: tableContext.tableId,
			fromRow: tableContext.rowIndex,
			fromCol: tableContext.colIndex,
			toRow: tableContext.rowEnd - 1,
			toCol: tableContext.colEnd - 1,
		},
		true,
	);
}

function resolveExplicitTarget(state: EditorState, target: TableSizeTarget): ResolvedTarget | null {
	const table: BlockNode | undefined = state.getBlock(target.tableId);
	if (!table || table.type !== 'table') return null;
	const grid: TableGrid = createTableGrid(table);

	switch (target.kind) {
		case 'cell': {
			if (!validCoordinate(target.row, grid.rowCount)) return null;
			if (!validCoordinate(target.column, grid.columnCount)) return null;
			const cell = grid.cellAt(target.row, target.column);
			if (!cell) return null;
			return makeResolvedTarget(
				state,
				table,
				grid,
				cell.rowStart,
				cell.rowEnd - 1,
				cell.columnStart,
				cell.columnEnd - 1,
			);
		}
		case 'range':
			return resolveRange(
				state,
				target.tableId,
				{
					tableId: target.tableId,
					fromRow: target.fromRow,
					fromCol: target.fromColumn,
					toRow: target.toRow,
					toCol: target.toColumn,
				},
				true,
			);
		case 'column':
			if (!validCoordinate(target.column, grid.columnCount)) return null;
			return { state, table, grid, columns: [target.column], rows: [] };
		case 'row':
			if (!validCoordinate(target.row, grid.rowCount)) return null;
			return { state, table, grid, columns: [], rows: [target.row] };
	}
}

function resolveRange(
	state: EditorState,
	tableId: BlockId,
	range: CellRange,
	strict: boolean,
): ResolvedTarget | null {
	const table: BlockNode | undefined = state.getBlock(tableId);
	if (!table || table.type !== 'table') return null;
	const grid: TableGrid = createTableGrid(table);
	if (grid.rowCount === 0 || grid.columnCount === 0) return null;

	const coordinates: readonly number[] = [range.fromRow, range.toRow, range.fromCol, range.toCol];
	if (!coordinates.every(Number.isInteger)) return null;
	if (
		strict &&
		(!validCoordinate(range.fromRow, grid.rowCount) ||
			!validCoordinate(range.toRow, grid.rowCount) ||
			!validCoordinate(range.fromCol, grid.columnCount) ||
			!validCoordinate(range.toCol, grid.columnCount))
	) {
		return null;
	}

	const fromRow: number = clampIndex(Math.min(range.fromRow, range.toRow), grid.rowCount);
	const toRow: number = clampIndex(Math.max(range.fromRow, range.toRow), grid.rowCount);
	const fromColumn: number = clampIndex(Math.min(range.fromCol, range.toCol), grid.columnCount);
	const toColumn: number = clampIndex(Math.max(range.fromCol, range.toCol), grid.columnCount);
	const expanded = expandTableGridRange(grid, {
		fromRow,
		fromColumn,
		toRow,
		toColumn,
	});
	return expanded
		? makeResolvedTarget(
				state,
				table,
				grid,
				expanded.fromRow,
				expanded.toRow,
				expanded.fromColumn,
				expanded.toColumn,
			)
		: null;
}

function makeResolvedTarget(
	state: EditorState,
	table: BlockNode,
	grid: TableGrid,
	fromRow: number,
	toRow: number,
	fromColumn: number,
	toColumn: number,
): ResolvedTarget {
	return {
		state,
		table,
		grid,
		rows: integerRange(fromRow, toRow),
		columns: integerRange(fromColumn, toColumn),
	};
}

// --- Reading and mutation ---

function readResolvedSize(target: ResolvedTarget): TableSizeState {
	const widths: readonly (number | null)[] = readTableColumnWidthsPx(
		target.table,
		target.grid.columnCount,
	);
	const columnValues: readonly (number | null)[] = target.columns.map(
		(column: number) => widths[column] ?? null,
	);
	const rowValues: readonly (number | null)[] = target.rows.map((rowIndex: number) => {
		const row: BlockNode | undefined = target.grid.rows[rowIndex];
		return row ? readTableRowMinHeightPx(row) : null;
	});

	return {
		columnWidthPx: summarizeValues(columnValues),
		rowMinHeightPx: summarizeValues(rowValues),
	};
}

function applySize(
	context: PluginContext,
	target: ResolvedTarget,
	input: TableSizeInput,
	config: TableSizingConfig,
): boolean {
	const hasColumnInput: boolean = Object.prototype.hasOwnProperty.call(input, 'columnWidthPx');
	const hasRowInput: boolean = Object.prototype.hasOwnProperty.call(input, 'rowMinHeightPx');
	if (!hasColumnInput && !hasRowInput) return false;
	if (hasColumnInput && target.columns.length === 0) return false;
	if (hasRowInput && target.rows.length === 0) return false;

	const columnValue: NormalizedInput | null = hasColumnInput
		? normalizeInput(input.columnWidthPx, config.minColumnWidthPx, config.maxColumnWidthPx)
		: null;
	const rowValue: NormalizedInput | null = hasRowInput
		? normalizeInput(input.rowMinHeightPx, config.minRowHeightPx, config.maxRowHeightPx)
		: null;
	if ((hasColumnInput && !columnValue) || (hasRowInput && !rowValue)) return false;

	const builder: TransactionBuilder = target.state.transaction('command');
	let changed = false;

	if (columnValue) {
		const widths: (number | null)[] = [
			...readTableColumnWidthsPx(target.table, target.grid.columnCount),
		];
		for (const column of target.columns) {
			if (widths[column] !== columnValue.value) {
				widths[column] = columnValue.value;
				changed = true;
			}
		}
		if (changed) {
			const path: readonly BlockId[] | undefined = target.state.getNodePath(target.table.id);
			if (!path) return false;
			builder.setNodeAttr(path, withTableColumnWidthsPx(target.table.attrs, widths));
		}
	}

	if (rowValue) {
		for (const rowIndex of target.rows) {
			const row: BlockNode | undefined = target.grid.rows[rowIndex];
			if (!row || readTableRowMinHeightPx(row) === rowValue.value) continue;
			const path: readonly BlockId[] | undefined = target.state.getNodePath(row.id);
			if (!path) return false;
			builder.setNodeAttr(path, withTableRowMinHeightPx(row.attrs, rowValue.value));
			changed = true;
		}
	}

	if (!changed) return false;
	builder.setSelection(target.state.selection);
	context.dispatch(builder.build());
	return true;
}

function resetResolvedSize(
	context: PluginContext,
	target: ResolvedTarget,
	dimension: TableSizeDimension | undefined,
	config: TableSizingConfig,
): boolean {
	if (dimension === 'columnWidthPx') {
		return applySize(context, target, { columnWidthPx: 'auto' }, config);
	}
	if (dimension === 'rowMinHeightPx') {
		return applySize(context, target, { rowMinHeightPx: 'auto' }, config);
	}

	const input: TableSizeInput = {
		...(target.columns.length > 0 ? { columnWidthPx: 'auto' as const } : {}),
		...(target.rows.length > 0 ? { rowMinHeightPx: 'auto' as const } : {}),
	};
	return applySize(context, target, input, config);
}

interface NormalizedInput {
	readonly value: number | null;
}

function normalizeInput(
	value: TableDimensionInput | undefined,
	minimum: number,
	maximum: number,
): NormalizedInput | null {
	if (value === 'auto') return { value: null };
	const normalized: number | null = normalizeTableDimensionPx(value, minimum, maximum);
	return normalized === null ? null : { value: normalized };
}

function summarizeValues(values: readonly (number | null)[]): TableDimensionState {
	if (values.length === 0) return 'unavailable';
	const first: number | null | undefined = values[0];
	if (values.some((value: number | null): boolean => value !== first)) return 'mixed';
	return first === null || first === undefined ? 'auto' : first;
}

// --- Small utilities ---

function normalizeStoredDimension(value: unknown): number | null {
	if (typeof value !== 'number') return null;
	if (value < MIN_TABLE_DIMENSION_PX || value > MAX_TABLE_DIMENSION_PX) return null;
	return normalizeTableDimensionPx(value);
}

function normalizeConfigValue(
	value: unknown,
	fallback: number,
	minimum = MIN_TABLE_DIMENSION_PX,
): number {
	return normalizeTableDimensionPx(value ?? fallback, minimum, MAX_TABLE_DIMENSION_PX) ?? fallback;
}

function validCoordinate(value: number, upperBound: number): boolean {
	return Number.isInteger(value) && value >= 0 && value < upperBound;
}

function clampIndex(value: number, upperBound: number): number {
	return Math.min(upperBound - 1, Math.max(0, value));
}

function integerRange(from: number, to: number): readonly number[] {
	return Array.from({ length: to - from + 1 }, (_unused: unknown, index: number) => from + index);
}
