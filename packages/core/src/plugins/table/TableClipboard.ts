/** Clipboard integration for the plugin's logical rectangular cell selection. */

import {
	type BlockNode,
	createBlockNode,
	createTextNode,
	generateBlockId,
	getBlockChildren,
	getBlockText,
	isLeafBlock,
} from '../../model/Document.js';
import { createCollapsedSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import { isEventFromEditorContent } from '../../platform/EditorEventBoundary.js';
import { serializeDocumentToHTML } from '../../serialization/DocumentSerializer.js';
import type { EditorState } from '../../state/EditorState.js';
import type { TransactionBuilder } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import { createTableGrid, sliceTableToRange } from './TableGrid.js';
import type { CellRange, TableSelectionService } from './TableSelection.js';

/** Installs copy/cut handling for TableSelectionService ranges. */
export function installTableClipboard(
	context: PluginContext,
	selectionService: TableSelectionService,
): () => void {
	const container: HTMLElement = context.getContainer();

	const onCopy = (event: ClipboardEvent): void => {
		if (!isEventFromEditorContent(event, container)) return;
		writeSelectedTableRange(event, context, selectionService);
	};
	const onCut = (event: ClipboardEvent): void => {
		if (!isEventFromEditorContent(event, container)) return;
		if (context.isReadOnly?.()) return;
		if (!writeSelectedTableRange(event, context, selectionService)) return;
		clearSelectedTableCells(context, selectionService);
	};

	// Capture wins over the generic text clipboard handler on the same editor root.
	container.addEventListener('copy', onCopy, true);
	container.addEventListener('cut', onCut, true);
	return () => {
		container.removeEventListener('copy', onCopy, true);
		container.removeEventListener('cut', onCut, true);
	};
}

function writeSelectedTableRange(
	event: ClipboardEvent,
	context: PluginContext,
	selectionService: TableSelectionService,
): boolean {
	const clipboardData: DataTransfer | null = event.clipboardData;
	const range: CellRange | null = selectionService.getSelectedRange();
	if (!clipboardData || !range) return false;
	const state: EditorState = context.getState();
	const table: BlockNode | undefined = state.getBlock(range.tableId);
	if (!table || table.type !== 'table') return false;
	const slice: BlockNode | null = sliceTableToRange(table, {
		fromRow: range.fromRow,
		fromColumn: range.fromCol,
		toRow: range.toRow,
		toColumn: range.toCol,
	});
	if (!slice) return false;

	event.preventDefault();
	event.stopImmediatePropagation();
	clipboardData.setData(
		'text/html',
		serializeDocumentToHTML({ children: [slice] }, context.getSchemaRegistry()),
	);
	clipboardData.setData('text/plain', tableFragmentPlainText(slice));
	return true;
}

/** Cut clears each selected logical cell once and keeps table structure/dimensions intact. */
function clearSelectedTableCells(
	context: PluginContext,
	selectionService: TableSelectionService,
): void {
	const range: CellRange | null = selectionService.getSelectedRange();
	if (!range) return;
	const state: EditorState = context.getState();
	const table: BlockNode | undefined = state.getBlock(range.tableId);
	if (!table || table.type !== 'table') return;
	const cells = createTableGrid(table).cellsInRange({
		fromRow: range.fromRow,
		fromColumn: range.fromCol,
		toRow: range.toRow,
		toColumn: range.toCol,
	});
	if (cells.length === 0) return;

	const builder: TransactionBuilder = state.transaction('input');
	let firstParagraphId: BlockId | null = null;
	for (const entry of cells) {
		const path: readonly BlockId[] | undefined = state.getNodePath(entry.cell.id);
		if (!path) return;
		const children: readonly BlockNode[] = getBlockChildren(entry.cell);
		for (let index = children.length - 1; index >= 0; index--) builder.removeNode(path, index);
		const paragraphId: BlockId = generateBlockId();
		const paragraph: BlockNode = createBlockNode(
			nodeType('paragraph'),
			[createTextNode('')],
			paragraphId,
		);
		builder.insertNode(path, 0, paragraph);
		firstParagraphId ??= paragraphId;
	}
	if (!firstParagraphId) return;
	builder.setSelection(createCollapsedSelection(firstParagraphId, 0));
	context.dispatch(builder.build());
	selectionService.clearSelectionSilent();
}

/** Serializes a table fragment as logical TSV, including empty span placeholders. */
export function tableFragmentPlainText(table: BlockNode): string {
	const grid = createTableGrid(table);
	return Array.from({ length: grid.rowCount }, (_unused: unknown, row: number): string => {
		return Array.from({ length: grid.columnCount }, (_column: unknown, column: number): string => {
			const entry = grid.cellAt(row, column);
			if (!entry || entry.rowStart !== row || entry.columnStart !== column) return '';
			return blockTreePlainText(entry.cell);
		}).join('\t');
	}).join('\n');
}

function blockTreePlainText(block: BlockNode): string {
	if (isLeafBlock(block)) return getBlockText(block);
	return getBlockChildren(block).map(blockTreePlainText).join('\n');
}
