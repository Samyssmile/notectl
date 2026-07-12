import { describe, expect, it, vi } from 'vitest';
import type { HTMLExportContext } from '../model/NodeSpec.js';
import {
	TABLE_COLUMN_WIDTH_DATA_ATTRIBUTE,
	normalizeTableColumnWidthsPx,
	parseCSSTableDimension,
	parseConventionalTableDimension,
	parseTableColumnSpan,
	parseTableDimensionMetadata,
	readTableDimensionPx,
	serializeTableDimensionAttrs,
} from './TableDimensions.js';

describe('table dimension HTML boundaries', () => {
	it('strictly accepts bounded canonical numeric metadata', () => {
		expect(parseTableDimensionMetadata('1')).toBe(1);
		expect(parseTableDimensionMetadata(' 120.5 ')).toBe(120.5);
		expect(parseTableDimensionMetadata('10000')).toBe(10_000);

		for (const value of [null, '', '0', '-1', '10001', '1e3', '12px', 'NaN', '80; color: red']) {
			expect(parseTableDimensionMetadata(value)).toBeUndefined();
		}
	});

	it('accepts only bounded numeric or exact px conventional values', () => {
		expect(parseConventionalTableDimension('80')).toBe(80);
		expect(parseConventionalTableDimension('80.25px')).toBe(80.25);
		expect(parseCSSTableDimension(' 80.25PX ')).toBe(80.25);

		for (const value of ['50%', '12em', 'calc(100% - 1px)', '80px; color: red']) {
			expect(parseConventionalTableDimension(value)).toBeUndefined();
			expect(parseCSSTableDimension(value)).toBeUndefined();
		}
		expect(parseCSSTableDimension('80')).toBeUndefined();
	});

	it('uses metadata, CSS, and conventional attributes in deterministic order', () => {
		const col: HTMLTableColElement = document.createElement('col');
		col.setAttribute(TABLE_COLUMN_WIDTH_DATA_ATTRIBUTE, '40');
		col.style.width = '80px';
		col.setAttribute('width', '90');

		expect(readTableDimensionPx(col, TABLE_COLUMN_WIDTH_DATA_ATTRIBUTE, ['width'], 'width')).toBe(
			40,
		);

		col.setAttribute(TABLE_COLUMN_WIDTH_DATA_ATTRIBUTE, 'invalid');
		expect(readTableDimensionPx(col, TABLE_COLUMN_WIDTH_DATA_ATTRIBUTE, ['width'], 'width')).toBe(
			80,
		);

		col.style.removeProperty('width');
		expect(readTableDimensionPx(col, TABLE_COLUMN_WIDTH_DATA_ATTRIBUTE, ['width'], 'width')).toBe(
			90,
		);
	});

	it('bounds column spans and retains automatic slots in sparse vectors', () => {
		expect(parseTableColumnSpan('2')).toBe(2);
		expect(parseTableColumnSpan('1000')).toBe(1_000);
		for (const value of [null, '', '0', '-1', '1001', '2.5', '2x']) {
			expect(parseTableColumnSpan(value)).toBe(1);
		}

		const sparse: unknown[] = [];
		sparse.length = 2;
		sparse[1] = 120;
		expect(normalizeTableColumnWidthsPx(sparse)).toEqual([null, 120]);
		expect(normalizeTableColumnWidthsPx([0, Number.NaN, 10_001])).toBeUndefined();
	});

	it('routes generated CSS through the export context and omits unsafe model values', () => {
		const styleAttr = vi.fn((_declarations: string): string => ' class="notectl-size"');
		const ctx: HTMLExportContext = { styleAttr };

		expect(
			serializeTableDimensionAttrs(TABLE_COLUMN_WIDTH_DATA_ATTRIBUTE, 'width', 120.5, ctx),
		).toBe(' data-notectl-width-px="120.5" class="notectl-size"');
		expect(styleAttr).toHaveBeenCalledWith('width: 120.5px');

		expect(
			serializeTableDimensionAttrs(TABLE_COLUMN_WIDTH_DATA_ATTRIBUTE, 'width', '120', ctx),
		).toBe('');
		expect(styleAttr).toHaveBeenCalledTimes(1);
	});
});
