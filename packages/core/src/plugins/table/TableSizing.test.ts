import { describe, expect, it } from 'vitest';
import {
	type BlockAttrs,
	type BlockNode,
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockChildren,
} from '../../model/Document.js';
import { createCollapsedSelection } from '../../model/Selection.js';
import type { BlockId, NodeTypeName } from '../../model/TypeBrands.js';
import { EditorState } from '../../state/EditorState.js';
import { HistoryManager } from '../../state/History.js';
import type { Transaction } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import type { CellRange, TableSelectionService } from './TableSelection.js';
import { TableSelectionServiceKey } from './TableSelection.js';
import {
	DEFAULT_TABLE_SIZING_CONFIG,
	TableSizingServiceKey,
	createTableSizingService,
	readTableColumnWidthsPx,
	resolveTableSizingConfig,
	withTableColumnWidthsPx,
} from './TableSizing.js';

interface TestContext {
	readonly context: PluginContext;
	readonly getState: () => EditorState;
	readonly transactions: readonly Transaction[];
}

function cell(id: string, attrs?: BlockAttrs): BlockNode {
	return createBlockNode(
		'table_cell' as NodeTypeName,
		[createBlockNode('paragraph' as NodeTypeName, [createTextNode(id)], `p-${id}` as BlockId)],
		id as BlockId,
		attrs,
	);
}

function row(id: string, cells: readonly BlockNode[], attrs?: BlockAttrs): BlockNode {
	return createBlockNode('table_row' as NodeTypeName, cells, id as BlockId, attrs);
}

function stateWithTable(table: BlockNode, caret = 'p-a'): EditorState {
	return EditorState.create({
		doc: createDocument([table]),
		selection: createCollapsedSelection(caret as BlockId, 0),
		schema: {
			nodeTypes: ['paragraph', 'table', 'table_row', 'table_cell'],
			markTypes: [],
		},
	});
}

function regularTable(
	attrs?: BlockAttrs,
	rowAttrs?: readonly (BlockAttrs | undefined)[],
): BlockNode {
	return createBlockNode(
		'table' as NodeTypeName,
		[
			row('r0', [cell('a'), cell('b')], rowAttrs?.[0]),
			row('r1', [cell('c'), cell('d')], rowAttrs?.[1]),
		],
		't1' as BlockId,
		attrs,
	);
}

function spanningTable(attrs?: BlockAttrs): BlockNode {
	return createBlockNode(
		'table' as NodeTypeName,
		[row('r0', [cell('a', { colspan: 2, rowspan: 2 }), cell('b')]), row('r1', [cell('c')])],
		't1' as BlockId,
		attrs,
	);
}

function mockContext(
	initialState: EditorState,
	options: { readonly readOnly?: boolean; readonly range?: CellRange | null } = {},
): TestContext {
	let state: EditorState = initialState;
	const transactions: Transaction[] = [];
	const services = new Map<string, unknown>();
	if (options.range !== undefined) {
		const selectionService: TableSelectionService = {
			getSelectedRange: () => options.range ?? null,
			setSelectedRange: () => {},
			clearSelectionSilent: () => {},
			getSelectedCellIds: () => [],
			isSelected: () => false,
		};
		services.set(TableSelectionServiceKey.id, selectionService);
	}

	const context = {
		getState: () => state,
		dispatch: (transaction: Transaction) => {
			transactions.push(transaction);
			state = state.apply(transaction);
		},
		isReadOnly: () => options.readOnly ?? false,
		registerService: <T>(key: { readonly id: string }, service: T) => {
			services.set(key.id, service);
		},
		getService: <T>(key: { readonly id: string }): T | undefined =>
			services.get(key.id) as T | undefined,
	} as unknown as PluginContext;

	return { context, getState: () => state, transactions };
}

describe('TableSizing configuration', () => {
	it('publishes stable px defaults and normalizes inverted bounds', () => {
		expect(DEFAULT_TABLE_SIZING_CONFIG).toEqual({
			minColumnWidthPx: 60,
			minRowHeightPx: 24,
			maxColumnWidthPx: 10_000,
			maxRowHeightPx: 10_000,
			keyboardResizeStepPx: 8,
			keyboardResizeLargeStepPx: 32,
		});

		expect(resolveTableSizingConfig({ minColumnWidthPx: 100, maxColumnWidthPx: 20 })).toMatchObject(
			{
				minColumnWidthPx: 100,
				maxColumnWidthPx: 100,
			},
		);
	});
});

describe('TableSizingService', () => {
	it('registers a typed service', () => {
		const h = mockContext(stateWithTable(regularTable()));
		const service = createTableSizingService(h.context);
		expect(h.context.getService(TableSizingServiceKey)).toBe(service);
	});

	it('sets both dimensions for every logical row and column covered by a spanning caret cell', () => {
		const h = mockContext(stateWithTable(spanningTable()));
		const service = createTableSizingService(h.context);

		expect(service.setSelectionSize({ columnWidthPx: 120, rowMinHeightPx: 48 })).toBe(true);
		expect(h.transactions).toHaveLength(1);
		expect(h.transactions[0]?.steps).toHaveLength(3);

		const table = h.getState().getBlock('t1' as BlockId);
		expect(table?.attrs?.columnWidthsPx).toEqual([120, 120, null]);
		const rows = table ? getBlockChildren(table) : [];
		expect(rows[0]?.attrs?.minHeightPx).toBe(48);
		expect(rows[1]?.attrs?.minHeightPx).toBe(48);
		expect(service.getSelectionSize()).toEqual({ columnWidthPx: 120, rowMinHeightPx: 48 });
	});

	it('reports mixed values and applies a rectangular selection atomically', () => {
		const range: CellRange = {
			tableId: 't1' as BlockId,
			fromRow: 0,
			fromCol: 0,
			toRow: 1,
			toCol: 1,
		};
		const h = mockContext(
			stateWithTable(
				regularTable({ columnWidthsPx: [80, 100] }, [{ minHeightPx: 30 }, { minHeightPx: 40 }]),
			),
			{ range },
		);
		const service = createTableSizingService(h.context);

		expect(service.getSelectionSize()).toEqual({
			columnWidthPx: 'mixed',
			rowMinHeightPx: 'mixed',
		});
		expect(service.setSelectionSize({ columnWidthPx: 90, rowMinHeightPx: 36 })).toBe(true);
		expect(h.transactions).toHaveLength(1);
		expect(service.getSelectionSize()).toEqual({ columnWidthPx: 90, rowMinHeightPx: 36 });
	});

	it('supports explicit logical column and row targets with unavailable opposite axes', () => {
		const h = mockContext(stateWithTable(regularTable()));
		const service = createTableSizingService(h.context);

		expect(
			service.setSize(
				{ kind: 'column', tableId: 't1' as BlockId, column: 1 },
				{ columnWidthPx: 75 },
			),
		).toBe(true);
		expect(service.getSize({ kind: 'column', tableId: 't1' as BlockId, column: 1 })).toEqual({
			columnWidthPx: 75,
			rowMinHeightPx: 'unavailable',
		});
		expect(
			service.setSize({ kind: 'row', tableId: 't1' as BlockId, row: 1 }, { rowMinHeightPx: 31 }),
		).toBe(true);
		expect(service.getSize({ kind: 'row', tableId: 't1' as BlockId, row: 1 })).toEqual({
			columnWidthPx: 'unavailable',
			rowMinHeightPx: 31,
		});
		expect(
			service.setSize({ kind: 'row', tableId: 't1' as BlockId, row: 0 }, { columnWidthPx: 100 }),
		).toBe(false);
	});

	it('expands a rectangular target to a fixed point across every intersecting span', () => {
		const h = mockContext(stateWithTable(spanningTable()));
		const service = createTableSizingService(h.context);

		expect(
			service.setSize(
				{
					kind: 'range',
					tableId: 't1' as BlockId,
					fromRow: 1,
					fromColumn: 1,
					toRow: 1,
					toColumn: 2,
				},
				{ columnWidthPx: 88, rowMinHeightPx: 38 },
			),
		).toBe(true);
		expect(h.getState().getBlock('t1' as BlockId)?.attrs?.columnWidthsPx).toEqual([88, 88, 88]);
		const table = h.getState().getBlock('t1' as BlockId);
		expect(table ? getBlockChildren(table).map((row) => row.attrs?.minHeightPx) : []).toEqual([
			38, 38,
		]);
	});

	it('resets dimensions independently and removes all-auto metadata', () => {
		const h = mockContext(
			stateWithTable(regularTable({ columnWidthsPx: [80, 90] }, [{ minHeightPx: 30 }])),
		);
		const service = createTableSizingService(h.context);
		const target = { kind: 'cell', tableId: 't1' as BlockId, row: 0, column: 0 } as const;

		expect(service.resetSize(target, 'columnWidthPx')).toBe(true);
		expect(h.getState().getBlock('t1' as BlockId)?.attrs?.columnWidthsPx).toEqual([null, 90]);
		expect(service.resetSize(target, 'rowMinHeightPx')).toBe(true);
		const table = h.getState().getBlock('t1' as BlockId);
		expect(table ? getBlockChildren(table)[0]?.attrs?.minHeightPx : undefined).toBeUndefined();

		expect(service.resetSize({ kind: 'column', tableId: 't1' as BlockId, column: 1 })).toBe(true);
		expect(h.getState().getBlock('t1' as BlockId)?.attrs?.columnWidthsPx).toBeUndefined();
	});

	it('clamps finite values and rejects a multi-axis call atomically when one value is invalid', () => {
		const h = mockContext(stateWithTable(regularTable()));
		const service = createTableSizingService(h.context, {
			minColumnWidthPx: 70,
			maxColumnWidthPx: 150,
			minRowHeightPx: 20,
			maxRowHeightPx: 80,
		});
		const target = { kind: 'cell', tableId: 't1' as BlockId, row: 0, column: 0 } as const;

		expect(service.setSize(target, { columnWidthPx: -5, rowMinHeightPx: 500 })).toBe(true);
		expect(service.getSize(target)).toEqual({ columnWidthPx: 70, rowMinHeightPx: 80 });
		const before = h.getState().doc;
		expect(service.setSize(target, { columnWidthPx: 100, rowMinHeightPx: Number.NaN })).toBe(false);
		expect(h.getState().doc).toBe(before);
	});

	it('returns false without dispatch for invalid targets, no-ops, and read-only mutation', () => {
		const writable = mockContext(stateWithTable(regularTable({ columnWidthsPx: [80, null] })));
		const service = createTableSizingService(writable.context);
		expect(
			service.setSize(
				{ kind: 'column', tableId: 't1' as BlockId, column: 9 },
				{ columnWidthPx: 80 },
			),
		).toBe(false);
		expect(
			service.setSize(
				{ kind: 'column', tableId: 't1' as BlockId, column: 0 },
				{ columnWidthPx: 80 },
			),
		).toBe(false);
		expect(writable.transactions).toHaveLength(0);

		const readonly = mockContext(stateWithTable(regularTable()), { readOnly: true });
		const readonlyService = createTableSizingService(readonly.context);
		expect(readonlyService.setSelectionSize({ columnWidthPx: 100 })).toBe(false);
		expect(readonlyService.resetSelectionSize()).toBe(false);
		expect(readonly.transactions).toHaveLength(0);
	});

	it('round-trips a multi-step sizing transaction exactly through history', () => {
		const initial = stateWithTable(spanningTable({ borderColor: '#112233' }));
		const h = mockContext(initial);
		const service = createTableSizingService(h.context);
		expect(service.setSelectionSize({ columnWidthPx: 110, rowMinHeightPx: 42 })).toBe(true);

		const transaction = h.transactions[0];
		expect(transaction).toBeDefined();
		if (!transaction) return;
		const history = new HistoryManager();
		history.push(transaction);
		const after = h.getState();
		const undone = history.undo(after);
		expect(undone?.state.doc).toEqual(initial.doc);
		const redone = undone ? history.redo(undone.state) : null;
		expect(redone?.state.doc).toEqual(after.doc);
	});
});

describe('canonical column-width helpers', () => {
	it('pads, trims, sanitizes, and removes an all-auto vector', () => {
		const table = regularTable({ columnWidthsPx: [80, Number.POSITIVE_INFINITY, 90] });
		expect(readTableColumnWidthsPx(table, 2)).toEqual([80, null]);
		expect(withTableColumnWidthsPx({ borderColor: '#fff' }, [null, null])).toEqual({
			borderColor: '#fff',
		});
	});
});
