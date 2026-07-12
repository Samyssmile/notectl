import { describe, expect, it } from 'vitest';
import {
	type BlockNode,
	createBlockNode,
	createTextNode,
	getBlockChildren,
} from '../../model/Document.js';
import type { BlockId, NodeTypeName } from '../../model/TypeBrands.js';
import {
	createTableGrid,
	projectTableColumnWidthsForSlice,
	sliceTableToRange,
} from './TableGrid.js';

function cell(id: string, colspan = 1, rowspan = 1) {
	return createBlockNode(
		'table_cell' as NodeTypeName,
		[createBlockNode('paragraph' as NodeTypeName, [createTextNode(id)], `p-${id}` as BlockId)],
		id as BlockId,
		{
			...(colspan > 1 ? { colspan } : {}),
			...(rowspan > 1 ? { rowspan } : {}),
		},
	);
}

function row(id: string, ...cells: ReturnType<typeof cell>[]) {
	return createBlockNode('table_row' as NodeTypeName, cells, id as BlockId);
}

describe('createTableGrid', () => {
	it('maps colspan and rowspan cells to logical coordinates once', () => {
		const spanning = cell('a', 2, 2);
		const table = createBlockNode(
			'table' as NodeTypeName,
			[row('r0', spanning, cell('b')), row('r1', cell('c'))],
			'table' as BlockId,
		);

		const grid = createTableGrid(table);

		expect(grid.rowCount).toBe(2);
		expect(grid.columnCount).toBe(3);
		expect(grid.cellAt(0, 0)?.cell.id).toBe('a');
		expect(grid.cellAt(0, 1)?.cell.id).toBe('a');
		expect(grid.cellAt(1, 0)?.cell.id).toBe('a');
		expect(grid.cellAt(1, 1)?.cell.id).toBe('a');
		expect(grid.cellAt(1, 2)?.cell.id).toBe('c');

		expect(grid.cellById('a' as BlockId)).toMatchObject({
			rowStart: 0,
			rowEnd: 2,
			columnStart: 0,
			columnEnd: 2,
			sourceRowIndex: 0,
			sourceCellIndex: 0,
		});
	});

	it('returns each spanning cell only once for a rectangular range', () => {
		const table = createBlockNode(
			'table' as NodeTypeName,
			[row('r0', cell('a', 2, 1), cell('b')), row('r1', cell('c'), cell('d'), cell('e'))],
			'table' as BlockId,
		);

		const ids = createTableGrid(table)
			.cellsInRange({ fromRow: 0, fromColumn: 0, toRow: 1, toColumn: 1 })
			.map((entry) => entry.cell.id);

		expect(ids).toEqual(['a', 'c', 'd']);
	});

	it('normalizes unsafe spans instead of allocating an unbounded grid', () => {
		const malformed = cell('unsafe');
		const table = createBlockNode(
			'table' as NodeTypeName,
			[
				row('r0', {
					...malformed,
					attrs: { colspan: Number.POSITIVE_INFINITY, rowspan: -10 },
				}),
			],
			'table' as BlockId,
		);

		const grid = createTableGrid(table);
		expect(grid.columnCount).toBe(1);
		expect(grid.cellAt(0, 0)?.cell.id).toBe('unsafe');
	});

	it('projects widths to a contiguous clipboard column slice', () => {
		const first = cell('first');
		const second = cell('second');
		const third = cell('third');
		const original = createBlockNode(
			'table' as NodeTypeName,
			[row('r0', first, second, third)],
			'table' as BlockId,
			{ borderColor: '#fff', columnWidthsPx: [100, 200, 300] },
		);
		const slice = {
			...original,
			children: [row('r0', second, third)],
		};

		expect(projectTableColumnWidthsForSlice(original, slice).attrs).toEqual({
			borderColor: '#fff',
			columnWidthsPx: [200, 300],
		});
	});

	it('drops widths when sliced rows have different original column origins', () => {
		const first = cell('first');
		const second = cell('second');
		const third = cell('third');
		const fourth = cell('fourth');
		const fifth = cell('fifth');
		const sixth = cell('sixth');
		const original = createBlockNode(
			'table' as NodeTypeName,
			[row('r0', first, second, third), row('r1', fourth, fifth, sixth)],
			'table' as BlockId,
			{ borderColor: '#fff', columnWidthsPx: [100, 200, 300] },
		);
		const diagonalTextSlice = {
			...original,
			children: [row('r0', second, third), row('r1', fourth)],
		};

		expect(projectTableColumnWidthsForSlice(original, diagonalTextSlice).attrs).toEqual({
			borderColor: '#fff',
		});
	});

	it('removes semantic ancestor ids from partial rectangular table slices', () => {
		const original = createBlockNode(
			'table' as NodeTypeName,
			[
				{
					...row('r0', cell('first'), cell('second')),
					htmlId: 'source-row',
				},
			],
			'table' as BlockId,
			{ columnWidthsPx: [100, 200] },
			'source-table',
		);

		const partial = sliceTableToRange(original, {
			fromRow: 0,
			fromColumn: 1,
			toRow: 0,
			toColumn: 1,
		});
		const partialRow = partial ? getBlockChildren(partial)[0] : undefined;
		expect(partial?.htmlId).toBeUndefined();
		expect(partialRow?.htmlId).toBeUndefined();

		const complete = sliceTableToRange(original, {
			fromRow: 0,
			fromColumn: 0,
			toRow: 0,
			toColumn: 1,
		});
		expect(complete?.htmlId).toBe('source-table');
		expect(complete ? getBlockChildren(complete)[0]?.htmlId : undefined).toBe('source-row');
	});

	it('clips ordinary text-selection spans to the retained rows', () => {
		const spanning = cell('a', 2, 2);
		const original = createBlockNode(
			'table' as NodeTypeName,
			[row('r0', spanning, cell('b')), row('r1', cell('c'))],
			'table' as BlockId,
			{ columnWidthsPx: [90, 110, 140] },
		);
		const partial = { ...original, children: [row('r0', spanning)] };

		const projected = projectTableColumnWidthsForSlice(original, partial);
		const projectedCell = getBlockCell(projected);
		expect(projected.attrs?.columnWidthsPx).toEqual([90, 110]);
		expect(projectedCell?.attrs?.colspan).toBe(2);
		expect(projectedCell?.attrs?.rowspan).toBeUndefined();
	});

	it('expands across spanning owners and projects all covered row/column dimensions', () => {
		const spanning = cell('a', 2, 2);
		const table = createBlockNode(
			'table' as NodeTypeName,
			[
				{ ...row('r0', spanning, cell('b')), attrs: { minHeightPx: 30 } },
				{ ...row('r1', cell('c')), attrs: { minHeightPx: 44 } },
			],
			'table' as BlockId,
			{ borderColor: '#fff', columnWidthsPx: [90, 110, 140] },
		);

		const slice = sliceTableToRange(table, {
			fromRow: 1,
			fromColumn: 1,
			toRow: 1,
			toColumn: 2,
		});

		expect(slice?.attrs).toEqual({
			borderColor: '#fff',
			columnWidthsPx: [90, 110, 140],
		});
		expect(slice?.children).toHaveLength(2);
		expect((slice?.children[0] as ReturnType<typeof row>).attrs?.minHeightPx).toBe(30);
		expect((slice?.children[1] as ReturnType<typeof row>).attrs?.minHeightPx).toBe(44);
		const firstRowCells = (slice?.children[0] as ReturnType<typeof row>).children;
		expect(firstRowCells.map((entry) => entry.id)).toEqual(['a', 'b']);
		expect((firstRowCells[0] as ReturnType<typeof cell>).attrs).toMatchObject({
			colspan: 2,
			rowspan: 2,
		});
	});
});

function getBlockCell(table: BlockNode): BlockNode | undefined {
	const firstRow: BlockNode | undefined = getBlockChildren(table)[0];
	return firstRow ? getBlockChildren(firstRow)[0] : undefined;
}
