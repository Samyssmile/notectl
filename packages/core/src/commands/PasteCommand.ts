/**
 * PasteCommand: builds transactions from a ContentSlice and EditorState.
 * Handles three strategies: inline paste, single-block paste, multi-block paste.
 */

import type { ContentSlice, SliceBlock } from '../model/ContentSlice.js';
import { segmentsLength, segmentsToText } from '../model/ContentSlice.js';
import {
	createBlockNode,
	createTextNode,
	generateBlockId,
	isBlockNode,
} from '../model/Document.js';
import type { TextSegment } from '../model/Document.js';
import { findNodePath } from '../model/NodeResolver.js';
import type { GapCursorSelection } from '../model/Selection.js';
import {
	createCollapsedSelection,
	isCollapsed,
	isGapCursor,
	isNodeSelection,
	selectionRange,
} from '../model/Selection.js';
import type { BlockId, NodeTypeName } from '../model/TypeBrands.js';
import { nodeType } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction, TransactionBuilder } from '../state/Transaction.js';
import { addDeleteSelectionSteps } from './Commands.js';

/**
 * Builds a transaction that pastes the given ContentSlice into the editor state.
 * Selects the appropriate strategy based on the slice structure.
 */
export function pasteSlice(state: EditorState, slice: ContentSlice): Transaction {
	if (slice.blocks.length === 0) {
		return state.transaction('paste').setSelection(state.selection).build();
	}

	const firstBlock: SliceBlock | undefined = slice.blocks[0];
	if (!firstBlock) {
		return state.transaction('paste').setSelection(state.selection).build();
	}

	if (slice.blocks.length === 1 && firstBlock.type === nodeType('paragraph')) {
		return pasteInline(state, firstBlock.segments);
	}
	if (slice.blocks.length === 1) {
		return pasteSingleBlock(state, firstBlock);
	}
	return pasteMultiBlock(state, slice);
}

/** Case 1: single paragraph — insert segments into current block. */
function pasteInline(state: EditorState, segments: readonly TextSegment[]): Transaction {
	const sel = state.selection;
	if (isNodeSelection(sel)) {
		return state.transaction('paste').setSelection(sel).build();
	}
	if (isGapCursor(sel)) {
		return pasteInlineAtGap(state, sel, segments);
	}
	const builder: TransactionBuilder = state.transaction('paste');

	const range = isCollapsed(sel) ? null : selectionRange(sel, state.getBlockOrder());

	if (!isCollapsed(sel)) {
		addDeleteSelectionSteps(state, builder);
	}

	const insertBlockId = range ? range.from.blockId : sel.anchor.blockId;
	const insertOffset: number = range ? range.from.offset : sel.anchor.offset;
	const totalLength: number = segmentsLength(segments);
	const text: string = segmentsToText(segments);

	builder.insertText(insertBlockId, insertOffset, text, [], segments);
	builder.setSelection(createCollapsedSelection(insertBlockId, insertOffset + totalLength));

	return builder.build();
}

/** Case 2: single non-paragraph block — change block type and insert segments. */
function pasteSingleBlock(state: EditorState, block: SliceBlock): Transaction {
	const sel = state.selection;
	if (isNodeSelection(sel)) {
		return state.transaction('paste').setSelection(sel).build();
	}
	if (isGapCursor(sel)) {
		return pasteBlocksAtGap(state, sel, [block]);
	}
	const builder: TransactionBuilder = state.transaction('paste');

	const range = isCollapsed(sel) ? null : selectionRange(sel, state.getBlockOrder());

	if (!isCollapsed(sel)) {
		addDeleteSelectionSteps(state, builder);
	}

	const insertBlockId = range ? range.from.blockId : sel.anchor.blockId;
	const insertOffset: number = range ? range.from.offset : sel.anchor.offset;
	const totalLength: number = segmentsLength(block.segments);
	const text: string = segmentsToText(block.segments);

	builder.setBlockType(insertBlockId, block.type, block.attrs);
	builder.insertText(insertBlockId, insertOffset, text, [], block.segments);
	builder.setSelection(createCollapsedSelection(insertBlockId, insertOffset + totalLength));

	return builder.build();
}

/** Case 3: multiple blocks — split-insert-merge strategy. */
function pasteMultiBlock(state: EditorState, slice: ContentSlice): Transaction {
	const sel = state.selection;
	if (isNodeSelection(sel)) {
		return state.transaction('paste').setSelection(sel).build();
	}
	if (isGapCursor(sel)) {
		return pasteBlocksAtGap(state, sel, slice.blocks);
	}
	const builder: TransactionBuilder = state.transaction('paste');

	const range = isCollapsed(sel) ? null : selectionRange(sel, state.getBlockOrder());

	if (!isCollapsed(sel)) {
		addDeleteSelectionSteps(state, builder);
	}

	const blockId = range ? range.from.blockId : sel.anchor.blockId;
	const offset: number = range ? range.from.offset : sel.anchor.offset;
	const blockOrder = state.getBlockOrder();
	const blockIdx: number = blockOrder.indexOf(blockId);

	const firstSlice: SliceBlock | undefined = slice.blocks[0];
	const lastSlice: SliceBlock | undefined = slice.blocks[slice.blocks.length - 1];
	if (!firstSlice || !lastSlice) {
		return builder.build();
	}
	const middleSlices: readonly SliceBlock[] = slice.blocks.slice(1, -1);

	// 1. Insert first slice's segments into current block
	const firstLen: number = segmentsLength(firstSlice.segments);
	if (firstSlice.segments.length > 0 && firstLen > 0) {
		builder.insertText(
			blockId,
			offset,
			segmentsToText(firstSlice.segments),
			[],
			firstSlice.segments,
		);
	}

	// 2. Change block type if first slice is not a paragraph
	if (firstSlice.type !== nodeType('paragraph')) {
		builder.setBlockType(blockId, firstSlice.type, firstSlice.attrs);
	}

	// 3. Split current block after inserted text
	const splitOffset: number = offset + firstLen;
	const tailBlockId = generateBlockId();
	builder.splitBlock(blockId, splitOffset, tailBlockId);

	// 4. Insert middle blocks between first and tail
	let insertAt: number = blockIdx + 1;
	for (const mid of middleSlices) {
		const textNodes = mid.segments.map((s: TextSegment) => createTextNode(s.text, [...s.marks]));
		const newBlock = createBlockNode(
			mid.type,
			textNodes.length > 0 ? textNodes : undefined,
			generateBlockId(),
			mid.attrs,
		);
		builder.insertNode([], insertAt, newBlock);
		insertAt++;
	}

	// 5. Insert last slice's segments at start of tail block
	const lastLen: number = segmentsLength(lastSlice.segments);
	if (lastSlice.segments.length > 0 && lastLen > 0) {
		builder.insertText(tailBlockId, 0, segmentsToText(lastSlice.segments), [], lastSlice.segments);
	}

	// 6. Change tail block type if needed
	if (lastSlice.type !== nodeType('paragraph')) {
		builder.setBlockType(tailBlockId, lastSlice.type, lastSlice.attrs);
	}

	// 7. Set cursor to end of inserted content
	builder.setSelection(createCollapsedSelection(tailBlockId, lastLen));

	return builder.build();
}

// --- GapCursor Paste Helpers ---

/**
 * Resolves the insert position for a GapCursor: parent path and index
 * within siblings where new blocks should be inserted.
 */
function gapInsertIndex(
	state: EditorState,
	sel: GapCursorSelection,
): { parentPath: BlockId[]; insertIndex: number } | null {
	const path = findNodePath(state.doc, sel.blockId);
	if (!path) return null;

	const parentPath: BlockId[] = path.length > 1 ? (path.slice(0, -1) as BlockId[]) : [];

	const siblings =
		parentPath.length === 0
			? state.doc.children
			: (() => {
					const parent = state.getBlock(parentPath[parentPath.length - 1] as BlockId);
					return parent ? parent.children : [];
				})();

	const index: number = siblings.findIndex((c) => isBlockNode(c) && c.id === sel.blockId);
	if (index < 0) return null;

	const insertIndex: number = sel.side === 'before' ? index : index + 1;
	return { parentPath, insertIndex };
}

/** Pastes inline segments (single paragraph) at a GapCursor position. */
function pasteInlineAtGap(
	state: EditorState,
	sel: GapCursorSelection,
	segments: readonly TextSegment[],
): Transaction {
	const gap = gapInsertIndex(state, sel);
	if (!gap) {
		return state.transaction('paste').setSelection(sel).build();
	}

	const newId: BlockId = generateBlockId();
	const text: string = segmentsToText(segments);
	const totalLength: number = segmentsLength(segments);
	const builder: TransactionBuilder = state.transaction('paste');

	builder.insertNode(
		gap.parentPath,
		gap.insertIndex,
		createBlockNode(nodeType('paragraph') as NodeTypeName, [createTextNode('')], newId),
	);
	if (text.length > 0) {
		builder.insertText(newId, 0, text, [], segments);
	}
	builder.setSelection(createCollapsedSelection(newId, totalLength));

	return builder.build();
}

/** Pastes one or more blocks at a GapCursor position. */
function pasteBlocksAtGap(
	state: EditorState,
	sel: GapCursorSelection,
	blocks: readonly SliceBlock[],
): Transaction {
	const gap = gapInsertIndex(state, sel);
	if (!gap) {
		return state.transaction('paste').setSelection(sel).build();
	}

	const builder: TransactionBuilder = state.transaction('paste');
	let insertAt: number = gap.insertIndex;
	let lastBlockId: BlockId | undefined;
	let lastTextLen = 0;

	for (const block of blocks) {
		const newId: BlockId = generateBlockId();
		const text: string = segmentsToText(block.segments);
		const textNodes = block.segments.map((s: TextSegment) => createTextNode(s.text, [...s.marks]));
		const newBlock = createBlockNode(
			block.type,
			textNodes.length > 0 ? textNodes : [createTextNode('')],
			newId,
			block.attrs,
		);
		builder.insertNode(gap.parentPath, insertAt, newBlock);
		insertAt++;
		lastBlockId = newId;
		lastTextLen = text.length;
	}

	if (lastBlockId) {
		builder.setSelection(createCollapsedSelection(lastBlockId, lastTextLen));
	}

	return builder.build();
}
