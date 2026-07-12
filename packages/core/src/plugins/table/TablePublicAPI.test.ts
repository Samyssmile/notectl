import { describe, expect, expectTypeOf, it } from 'vitest';
import type { BlockId } from '../../model/TypeBrands.js';
import { ServiceKey } from '../Plugin.js';
import {
	DEFAULT_TABLE_SIZING_CONFIG,
	type TableConfig,
	TablePlugin,
	type TableSizeInput,
	type TableSizeState,
	type TableSizeTarget,
	type TableSizingService,
	TableSizingServiceKey,
} from './index.js';

describe('table public sizing API', () => {
	it('exports stable configuration defaults and accepts additive plugin options', () => {
		const config: TableConfig = {
			minColumnWidthPx: 72,
			minRowHeightPx: 28,
			keyboardResizeStepPx: 6,
			keyboardResizeLargeStepPx: 24,
			directResize: false,
		};

		expect(new TablePlugin(config)).toBeInstanceOf(TablePlugin);
		expect(DEFAULT_TABLE_SIZING_CONFIG.minColumnWidthPx).toBe(60);
		expect(TableSizingServiceKey).toBeInstanceOf(ServiceKey);
	});

	it('keeps targets, inputs, states, and service signatures strongly typed', () => {
		const target: TableSizeTarget = {
			kind: 'range',
			tableId: 'table-1' as BlockId,
			fromRow: 0,
			fromColumn: 1,
			toRow: 2,
			toColumn: 3,
		};
		const input: TableSizeInput = { columnWidthPx: 120, rowMinHeightPx: 'auto' };
		const state: TableSizeState = { columnWidthPx: 'mixed', rowMinHeightPx: 40 };

		expectTypeOf(target).toMatchTypeOf<TableSizeTarget>();
		expectTypeOf(input).toMatchTypeOf<TableSizeInput>();
		expectTypeOf(state).toMatchTypeOf<TableSizeState>();
		expectTypeOf<TableSizingService['setSelectionSize']>().toEqualTypeOf<
			(input: TableSizeInput) => boolean
		>();
		expectTypeOf<TableSizingService['setSize']>().toEqualTypeOf<
			(target: TableSizeTarget, input: TableSizeInput) => boolean
		>();
	});
});
