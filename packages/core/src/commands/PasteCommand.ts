/**
 * PasteCommand: builds transactions from a ContentSlice and EditorState.
 * Handles three strategies: inline paste, single-block paste, multi-block paste.
 */

import type { ContentSlice, SliceBlock } from '../model/ContentSlice.js';
import { segmentsLength } from '../model/ContentSlice.js';
import {
	createBlockNode,
	createTextNode,
	generateBlockId,
	segmentsToInlineChildren,
} from '../model/Document.js';
import type { ContentSegment, TextSegment } from '../model/Document.js';
import { findNodePath } from '../model/NodeResolver.js';
import type { GapCursorSelection, Selection } from '../model/Selection.js';
import {
	createCollapsedSelection,
	isCollapsed,
	isGapCursor,
	isNodeSelection,
} from '../model/Selection.js';
import type { BlockId, NodeTypeName } from '../model/TypeBrands.js';
import { nodeType } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction, TransactionBuilder } from '../state/Transaction.js';
import type { InsertPoint } from './CommandHelpers.js';
import {
	extractParentPath,
	findSiblingIndex,
	getSiblings,
	resolveInsertPoint,
} from './CommandHelpers.js';
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

interface PasteTarget {
	readonly builder: TransactionBuilder;
	readonly landingId: BlockId | undefined;
	readonly resolved: InsertPoint;
	readonly insertBlockId: BlockId;
	readonly insertOffset: number;
}

/**
 * Shared preamble for the text-selection paste strategies: opens a paste
 * builder, deletes any range selection, and resolves the insert position.
 */
function resolvePasteTarget(state: EditorState, sel: Selection): PasteTarget {
	const builder: TransactionBuilder = state.transaction('paste');

	let landingId: BlockId | undefined;
	if (!isCollapsed(sel)) {
		landingId = addDeleteSelectionSteps(state, builder);
	}

	const resolved: InsertPoint = resolveInsertPoint(sel, state.getBlockOrder());
	const insertBlockId: BlockId = landingId ?? resolved.blockId;
	const insertOffset: number = landingId ? 0 : resolved.offset;

	return { builder, landingId, resolved, insertBlockId, insertOffset };
}

/**
 * Inserts content segments at a position by interleaving `insertText` and
 * `insertInlineNode` steps. Consecutive text segments are coalesced into a single
 * mark-preserving `insertText`. Returns the resulting end offset.
 */
function insertSegmentsAt(
	builder: TransactionBuilder,
	blockId: BlockId,
	startOffset: number,
	segments: readonly ContentSegment[],
): number {
	let offset: number = startOffset;
	let textRun: TextSegment[] = [];

	const flushTextRun = (): void => {
		if (textRun.length === 0) return;
		const text: string = textRun.map((s: TextSegment) => s.text).join('');
		if (text.length > 0) {
			builder.insertText(blockId, offset, text, [], textRun);
			offset += text.length;
		}
		textRun = [];
	};

	for (const segment of segments) {
		if (segment.kind === 'inline') {
			flushTextRun();
			builder.insertInlineNode(blockId, offset, segment.node);
			offset += 1;
		} else {
			textRun.push({ text: segment.text, marks: segment.marks });
		}
	}
	flushTextRun();

	return offset;
}

/** Case 1: single paragraph — insert segments into current block. */
function pasteInline(state: EditorState, segments: readonly ContentSegment[]): Transaction {
	const sel = state.selection;
	if (isNodeSelection(sel)) {
		return state.transaction('paste').setSelection(sel).build();
	}
	if (isGapCursor(sel)) {
		return pasteInlineAtGap(state, sel, segments);
	}
	const { builder, insertBlockId, insertOffset } = resolvePasteTarget(state, sel);
	const endOffset: number = insertSegmentsAt(builder, insertBlockId, insertOffset, segments);
	builder.setSelection(createCollapsedSelection(insertBlockId, endOffset));

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
	const { builder, insertBlockId, insertOffset } = resolvePasteTarget(state, sel);

	builder.setBlockType(insertBlockId, block.type, block.attrs);
	const endOffset: number = insertSegmentsAt(builder, insertBlockId, insertOffset, block.segments);
	builder.setSelection(createCollapsedSelection(insertBlockId, endOffset));

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
	const {
		builder,
		landingId,
		resolved,
		insertBlockId: blockId,
		insertOffset: offset,
	} = resolvePasteTarget(state, sel);
	const blockOrder = state.getBlockOrder();

	let blockIdx: number;
	if (landingId) {
		// Landing block was inserted at the from-block's root-level position
		const fromPath = findNodePath(state.doc, resolved.blockId);
		const rootId: string | undefined = fromPath?.[0];
		blockIdx = rootId ? state.doc.children.findIndex((c) => c.id === rootId) : 0;
	} else {
		blockIdx = blockOrder.indexOf(blockId);
	}

	const firstSlice: SliceBlock | undefined = slice.blocks[0];
	const lastSlice: SliceBlock | undefined = slice.blocks[slice.blocks.length - 1];
	if (!firstSlice || !lastSlice) {
		return builder.build();
	}
	const middleSlices: readonly SliceBlock[] = slice.blocks.slice(1, -1);

	// 1. Insert first slice's segments into current block
	const firstEnd: number = insertSegmentsAt(builder, blockId, offset, firstSlice.segments);

	// 2. Change block type if first slice is not a paragraph
	if (firstSlice.type !== nodeType('paragraph')) {
		builder.setBlockType(blockId, firstSlice.type, firstSlice.attrs);
	}

	// 3. Split current block after the inserted content
	const tailBlockId = generateBlockId();
	builder.splitBlock(blockId, firstEnd, tailBlockId);

	// 4. Insert middle blocks between first and tail
	let insertAt: number = blockIdx + 1;
	for (const mid of middleSlices) {
		const newBlock = createBlockNode(
			mid.type,
			segmentsToInlineChildren(mid.segments),
			generateBlockId(),
			mid.attrs,
		);
		builder.insertNode([], insertAt, newBlock);
		insertAt++;
	}

	// 5. Insert last slice's segments at start of tail block
	insertSegmentsAt(builder, tailBlockId, 0, lastSlice.segments);

	// 6. Change tail block type if needed
	if (lastSlice.type !== nodeType('paragraph')) {
		builder.setBlockType(tailBlockId, lastSlice.type, lastSlice.attrs);
	}

	// 7. Set cursor to end of inserted content
	builder.setSelection(createCollapsedSelection(tailBlockId, segmentsLength(lastSlice.segments)));

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

	const parentPath: BlockId[] = extractParentPath(path);
	const siblings = getSiblings(state, parentPath);

	const index: number = findSiblingIndex(siblings, sel.blockId);
	if (index < 0) return null;

	const insertIndex: number = sel.side === 'before' ? index : index + 1;
	return { parentPath, insertIndex };
}

/** Pastes inline segments (single paragraph) at a GapCursor position. */
function pasteInlineAtGap(
	state: EditorState,
	sel: GapCursorSelection,
	segments: readonly ContentSegment[],
): Transaction {
	const gap = gapInsertIndex(state, sel);
	if (!gap) {
		return state.transaction('paste').setSelection(sel).build();
	}

	const newId: BlockId = generateBlockId();
	const builder: TransactionBuilder = state.transaction('paste');

	builder.insertNode(
		gap.parentPath,
		gap.insertIndex,
		createBlockNode(nodeType('paragraph') as NodeTypeName, [createTextNode('')], newId),
	);
	const endOffset: number = insertSegmentsAt(builder, newId, 0, segments);
	builder.setSelection(createCollapsedSelection(newId, endOffset));

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
	let lastLen = 0;

	for (const block of blocks) {
		const newId: BlockId = generateBlockId();
		const newBlock = createBlockNode(
			block.type,
			segmentsToInlineChildren(block.segments),
			newId,
			block.attrs,
		);
		builder.insertNode(gap.parentPath, insertAt, newBlock);
		insertAt++;
		lastBlockId = newId;
		lastLen = segmentsLength(block.segments);
	}

	if (lastBlockId) {
		builder.setSelection(createCollapsedSelection(lastBlockId, lastLen));
	}

	return builder.build();
}
