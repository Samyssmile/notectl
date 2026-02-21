/**
 * Shared test helpers for table plugin tests.
 * Provides consistent table state creation across TablePlugin, TableCommands, and TableNavigation tests.
 */

import {
	type BlockNode,
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockChildren,
} from '../../model/Document.js';
import { createCollapsedSelection } from '../../model/Selection.js';
import type { BlockId, NodeTypeName } from '../../model/TypeBrands.js';
import { EditorState } from '../../state/EditorState.js';
import { createTable } from './TableHelpers.js';

/** Standard schema for table tests. */
export const TABLE_SCHEMA = {
	nodeTypes: ['paragraph', 'table', 'table_row', 'table_cell'],
	markTypes: ['bold', 'italic', 'underline'],
};

/**
 * Creates a table BlockNode with predictable IDs.
 *
 * ID scheme:
 * - Table: `tableId` (default `'t1'`)
 * - Rows: `row{r}` (e.g. `row0`, `row1`)
 * - Cells: `c{r}_{c}` (e.g. `c0_0`, `c1_2`)
 * - Paragraphs: `p{r}_{c}` (e.g. `p0_0`, `p1_2`)
 */
export function createTestTableNode(
	rows: number,
	cols: number,
	tableId = 't1',
	cellText?: (row: number, col: number) => string,
): { table: BlockNode; cellIds: string[][] } {
	const cellIds: string[][] = [];
	const rowNodes: BlockNode[] = [];

	for (let r = 0; r < rows; r++) {
		const cellNodes: BlockNode[] = [];
		const rowCellIds: string[] = [];
		for (let c = 0; c < cols; c++) {
			const paraId: string = `p${r}_${c}`;
			const cellId: string = `c${r}_${c}`;
			const text: string = cellText ? cellText(r, c) : '';
			rowCellIds.push(cellId);
			cellNodes.push(
				createBlockNode(
					'table_cell' as NodeTypeName,
					[createBlockNode('paragraph' as NodeTypeName, [createTextNode(text)], paraId as BlockId)],
					cellId as BlockId,
				),
			);
		}
		cellIds.push(rowCellIds);
		rowNodes.push(createBlockNode('table_row' as NodeTypeName, cellNodes, `row${r}` as BlockId));
	}

	const table: BlockNode = createBlockNode('table' as NodeTypeName, rowNodes, tableId as BlockId);
	return { table, cellIds };
}

/** Options for creating a table-containing EditorState. */
export interface CreateTableStateOptions {
	readonly rows?: number;
	readonly cols?: number;
	readonly cursorRow?: number;
	readonly cursorCol?: number;
	readonly cursorOffset?: number;
	readonly tableId?: string;
	readonly extraBlocks?: 'before' | 'after' | 'both';
	readonly cellText?: (row: number, col: number) => string;
}

/**
 * Creates an EditorState containing a table with predictable IDs.
 *
 * Extra blocks use IDs `'before'` and `'after'`.
 * Cursor is placed in the paragraph at `p{cursorRow}_{cursorCol}`.
 */
export function createTableState(options: CreateTableStateOptions = {}): EditorState {
	const {
		rows = 2,
		cols = 2,
		cursorRow = 0,
		cursorCol = 0,
		cursorOffset = 0,
		tableId = 't1',
		extraBlocks = 'both',
		cellText,
	} = options;

	const { table } = createTestTableNode(rows, cols, tableId, cellText);
	const cursorParaId: string = `p${cursorRow}_${cursorCol}`;

	const blocks: BlockNode[] = [];

	if (extraBlocks === 'before' || extraBlocks === 'both') {
		blocks.push(
			createBlockNode('paragraph' as NodeTypeName, [createTextNode('before')], 'before' as BlockId),
		);
	}

	blocks.push(table);

	if (extraBlocks === 'after' || extraBlocks === 'both') {
		blocks.push(
			createBlockNode('paragraph' as NodeTypeName, [createTextNode('after')], 'after' as BlockId),
		);
	}

	return EditorState.create({
		doc: createDocument(blocks),
		selection: createCollapsedSelection(cursorParaId as BlockId, cursorOffset),
		schema: TABLE_SCHEMA,
	});
}

/**
 * Creates a table state using random IDs (via TableHelpers.createTable).
 * Cursor is placed in the cell paragraph at [cursorRow][cursorCol].
 * Includes an extra paragraph after the table with id `'para-after'`.
 */
export function createTableStateWithRandomIds(
	rows = 2,
	cols = 3,
	cursorRow = 0,
	cursorCol = 0,
): EditorState {
	const table: BlockNode = createTable(rows, cols);
	const para: BlockNode = createBlockNode(
		'paragraph' as NodeTypeName,
		[createTextNode('')],
		'para-after' as BlockId,
	);

	const doc = createDocument([table, para]);

	const tableRows: readonly BlockNode[] = getBlockChildren(table);
	const row = tableRows[cursorRow];
	if (!row) throw new Error(`Row ${cursorRow} not found`);
	const cells: readonly BlockNode[] = getBlockChildren(row);
	const cell = cells[cursorCol];
	if (!cell) throw new Error(`Cell ${cursorCol} not found`);
	const cellParagraph = getBlockChildren(cell)[0];
	if (!cellParagraph) throw new Error('Cell paragraph not found');

	const schema = {
		nodeTypes: ['paragraph', 'table', 'table_row', 'table_cell'],
		markTypes: ['bold', 'italic', 'underline'],
		getNodeSpec: (type: string) => {
			if (type === 'table' || type === 'table_cell') {
				return { type, isolating: true, toDOM: () => document.createElement('div') };
			}
			return { type, toDOM: () => document.createElement('div') };
		},
	};

	return EditorState.create({
		doc,
		selection: createCollapsedSelection(cellParagraph.id, 0),
		schema,
	});
}
