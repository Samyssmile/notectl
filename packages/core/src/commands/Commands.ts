/**
 * Core editor commands and barrel re-exports from submodules.
 *
 * This module contains text insertion, block splitting, block merging,
 * selection deletion, and select-all. Mark, delete, gap-cursor, node-selection,
 * and word-boundary commands are re-exported from their respective modules.
 */

import {
	type Mark,
	createInlineNode,
	generateBlockId,
	getBlockLength,
	getBlockMarksAtOffset,
	isLeafBlock,
} from '../model/Document.js';
import { findNodePath } from '../model/NodeResolver.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	createSelection,
	isCollapsed,
	isGapCursor,
	isNodeSelection,
	isTextSelection,
	selectionRange,
} from '../model/Selection.js';
import { type BlockId, inlineType } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import {
	isInsideIsolating,
	isIsolatingBlock,
	isVoidBlock,
	sharesParent,
} from '../state/NavigationQueries.js';
import type { Transaction } from '../state/Transaction.js';
import type { TransactionBuilder } from '../state/Transaction.js';
import { createEmptyParagraph, resolveInsertPoint } from './CommandHelpers.js';
import { insertParagraphAtGap, insertTextAtGap } from './GapCursorCommands.js';
import {
	deleteNodeSelection,
	findFirstLeafBlockId,
	findLastLeafBlockId,
	insertParagraphAfterNodeSelection,
	insertTextAfterNodeSelection,
} from './NodeSelectionCommands.js';

// --- Re-exports from submodules ---

export {
	canCrossBlockBoundary,
	isInsideIsolating,
	isIsolatingBlock,
	isVoidBlock,
	sharesParent,
} from '../state/NavigationQueries.js';

export type { FeatureConfig } from './MarkCommands.js';
export {
	isMarkActive,
	toggleBold,
	toggleItalic,
	toggleMark,
	toggleUnderline,
} from './MarkCommands.js';

export {
	deleteBackward,
	deleteForward,
	deleteSoftLineBackward,
	deleteSoftLineForward,
	deleteWordBackward,
	deleteWordForward,
} from './DeleteCommands.js';

export {
	deleteNodeSelection,
	findFirstLeafBlockId,
	findLastLeafBlockId,
	insertParagraphAfterNodeSelection,
	insertTextAfterNodeSelection,
	navigateArrowIntoVoid,
} from './NodeSelectionCommands.js';

export {
	deleteBackwardAtGap,
	deleteForwardAtGap,
	insertParagraphAtGap,
	insertTextAtGap,
} from './GapCursorCommands.js';

export {
	findWordBoundaryBackward,
	findWordBoundaryForward,
} from './WordBoundary.js';

export {
	applyAttributedMark,
	getMarkAttrAtSelection,
	isAttributedMarkActive,
	removeAttributedMark,
} from './AttributedMarkCommands.js';

export { forEachBlockInRange } from './RangeIterator.js';

// --- Text Commands ---

/** Inserts text at the current selection, replacing any selected range. */
export function insertTextCommand(
	state: EditorState,
	text: string,
	origin: 'input' | 'paste' = 'input',
): Transaction {
	const sel = state.selection;

	// NodeSelection: insert paragraph after void block with the text
	if (isNodeSelection(sel)) {
		return insertTextAfterNodeSelection(state, sel, text, origin);
	}

	// GapCursor: insert paragraph at the gap position with the text
	if (isGapCursor(sel)) {
		return insertTextAtGap(state, sel, text, origin);
	}

	const builder = state.transaction(origin);
	const marks = resolveActiveMarks(state);

	let landingId: BlockId | undefined;
	if (!isCollapsed(sel)) {
		landingId = addDeleteSelectionSteps(state, builder);
	}

	const resolved = resolveInsertPoint(sel, state.getBlockOrder());
	const insertBlockId: BlockId = landingId ?? resolved.blockId;
	const insertOffset: number = landingId ? 0 : resolved.offset;

	builder.insertText(insertBlockId, insertOffset, text, marks);
	builder.setSelection(createCollapsedSelection(insertBlockId, insertOffset + text.length));

	return builder.build();
}

/** Deletes the current selection. */
export function deleteSelectionCommand(state: EditorState): Transaction | null {
	if (isNodeSelection(state.selection)) {
		return deleteNodeSelection(state, state.selection);
	}
	if (isGapCursor(state.selection)) return null;
	if (isCollapsed(state.selection)) return null;

	const builder = state.transaction('input');
	const landingId: BlockId | undefined = addDeleteSelectionSteps(state, builder);

	const range = selectionRange(state.selection, state.getBlockOrder());
	const cursorBlockId: BlockId = landingId ?? range.from.blockId;
	const cursorOffset: number = landingId ? 0 : range.from.offset;
	builder.setSelection(createCollapsedSelection(cursorBlockId, cursorOffset));

	return builder.build();
}

/** Splits the current block at the cursor position (Enter key). */
export function splitBlockCommand(state: EditorState): Transaction | null {
	const sel = state.selection;

	// NodeSelection: insert empty paragraph after the void block
	if (isNodeSelection(sel)) {
		return insertParagraphAfterNodeSelection(state, sel);
	}

	// GapCursor: insert empty paragraph at the gap position
	if (isGapCursor(sel)) {
		return insertParagraphAtGap(state, sel);
	}

	const builder = state.transaction('input');

	let landingId: BlockId | undefined;
	if (!isCollapsed(sel)) {
		landingId = addDeleteSelectionSteps(state, builder);
	}

	const resolved = resolveInsertPoint(sel, state.getBlockOrder());
	const blockId: BlockId = landingId ?? resolved.blockId;
	const offset: number = landingId ? 0 : resolved.offset;
	const newBlockId = generateBlockId();

	// splitBlock operates at the same level in the tree — the StepApplication
	// handles this correctly because it looks up the block by ID recursively.
	builder.splitBlock(blockId, offset, newBlockId);
	builder.setSelection(createCollapsedSelection(newBlockId, 0));

	return builder.build();
}

/** Inserts a hard line break (InlineNode) at the current cursor position. */
export function insertHardBreakCommand(state: EditorState): Transaction | null {
	const sel = state.selection;

	if (!isTextSelection(sel)) return null;

	const builder = state.transaction('input');

	let cursorBlockId: BlockId | undefined;
	if (!isCollapsed(sel)) {
		const landingId: BlockId | undefined = addDeleteSelectionSteps(state, builder);
		cursorBlockId = landingId;
	}

	if (cursorBlockId) {
		// Cross-root deletion replaced from-block; insert hard break in landing block
		builder.insertInlineNode(cursorBlockId, 0, createInlineNode(inlineType('hard_break')));
		builder.setSelection(createCollapsedSelection(cursorBlockId, 1));
	} else {
		const { blockId: insertBlockId, offset: insertOffset } = resolveInsertPoint(
			sel,
			state.getBlockOrder(),
		);
		builder.insertInlineNode(
			insertBlockId,
			insertOffset,
			createInlineNode(inlineType('hard_break')),
		);
		builder.setSelection(createCollapsedSelection(insertBlockId, insertOffset + 1));
	}

	return builder.build();
}

/**
 * Merges the current block with the previous block, respecting
 * isolating boundaries and void blocks.
 */
export function mergeBlockBackward(state: EditorState): Transaction | null {
	return mergeAdjacentBlock(state, 'backward');
}

/**
 * Merges the next block into the current block, respecting
 * isolating boundaries and void blocks.
 */
export function mergeBlockForward(state: EditorState): Transaction | null {
	return mergeAdjacentBlock(state, 'forward');
}

/**
 * Shared implementation for merging adjacent blocks in either direction.
 * Validates selection, isolating boundaries, and void blocks before merging.
 */
function mergeAdjacentBlock(
	state: EditorState,
	direction: 'backward' | 'forward',
): Transaction | null {
	const sel = state.selection;
	if (!isTextSelection(sel)) return null;

	const blockOrder = state.getBlockOrder();
	const blockIdx: number = blockOrder.indexOf(sel.anchor.blockId);

	const adjacentIdx: number = direction === 'backward' ? blockIdx - 1 : blockIdx + 1;
	if (adjacentIdx < 0 || adjacentIdx >= blockOrder.length) return null;

	const adjacentId: BlockId | undefined = blockOrder[adjacentIdx];
	if (!adjacentId) return null;

	if (isIsolatingBlock(state, sel.anchor.blockId) || isIsolatingBlock(state, adjacentId)) {
		return null;
	}
	if (!sharesParent(state, sel.anchor.blockId, adjacentId)) {
		if (isInsideIsolating(state, sel.anchor.blockId)) return null;
	}

	if (isVoidBlock(state, adjacentId)) {
		const path = findNodePath(state.doc, adjacentId) ?? [];
		return state
			.transaction('input')
			.setSelection(createNodeSelection(adjacentId, path as BlockId[]))
			.build();
	}

	if (direction === 'backward') {
		const prevBlock = state.getBlock(adjacentId);
		if (!prevBlock) return null;
		const prevLen: number = getBlockLength(prevBlock);
		return state
			.transaction('input')
			.mergeBlocksAt(adjacentId, sel.anchor.blockId)
			.setSelection(createCollapsedSelection(adjacentId, prevLen))
			.build();
	}

	return state
		.transaction('input')
		.mergeBlocksAt(sel.anchor.blockId, adjacentId)
		.setSelection(createCollapsedSelection(sel.anchor.blockId, sel.anchor.offset))
		.build();
}

/** Selects all content in the editor, using leaf block endpoints. */
export function selectAll(state: EditorState): Transaction {
	const blocks = state.doc.children;
	const firstBlock = blocks[0];
	const lastBlock = blocks[blocks.length - 1];
	if (!firstBlock || !lastBlock)
		return state.transaction('command').setSelection(state.selection).build();

	const firstLeafId: BlockId = findFirstLeafBlockId(firstBlock);
	const lastLeafId: BlockId = findLastLeafBlockId(lastBlock);
	const lastLeaf = state.getBlock(lastLeafId);
	const lastLeafLen: number = lastLeaf ? getBlockLength(lastLeaf) : 0;

	return state
		.transaction('command')
		.setSelection(
			createSelection(
				{ blockId: firstLeafId, offset: 0 },
				{ blockId: lastLeafId, offset: lastLeafLen },
			),
		)
		.build();
}

// --- Internal Helpers ---

function resolveActiveMarks(state: EditorState): readonly Mark[] {
	if (state.storedMarks) return state.storedMarks;
	if (!isTextSelection(state.selection)) return [];

	const block = state.getBlock(state.selection.anchor.blockId);
	if (!block) return [];

	return getBlockMarksAtOffset(block, state.selection.anchor.offset);
}

/**
 * Adds steps to delete the current text selection.
 * Returns a replacement cursor block ID when the original from-block
 * was inside a composite root that got removed (undefined otherwise).
 */
export function addDeleteSelectionSteps(
	state: EditorState,
	builder: TransactionBuilder,
): BlockId | undefined {
	if (!isTextSelection(state.selection)) return undefined;
	const blockOrder = state.getBlockOrder();
	const range = selectionRange(state.selection, blockOrder);
	const fromIdx = blockOrder.indexOf(range.from.blockId);
	const toIdx = blockOrder.indexOf(range.to.blockId);

	if (fromIdx === toIdx) {
		builder.deleteTextAt(range.from.blockId, range.from.offset, range.to.offset);
		return undefined;
	}

	const fromRootIdx: number = getRootBlockIndex(state, range.from.blockId);
	const toRootIdx: number = getRootBlockIndex(state, range.to.blockId);

	if (fromRootIdx === toRootIdx || fromRootIdx < 0 || toRootIdx < 0) {
		deleteLeafRange(state, builder, blockOrder, range, fromIdx, toIdx);
		return undefined;
	}

	return deleteCrossRootRange(state, builder, range, fromRootIdx, toRootIdx);
}

/** Returns the root-level ancestor index in doc.children for a given block. */
function getRootBlockIndex(state: EditorState, blockId: BlockId): number {
	const path = findNodePath(state.doc, blockId);
	if (!path || path.length === 0) return -1;
	const rootId: string = path[0] as string;
	return state.doc.children.findIndex((c) => c.id === rootId);
}

/** Deletes a multi-block selection where all blocks share the same root ancestor. */
function deleteLeafRange(
	state: EditorState,
	builder: TransactionBuilder,
	blockOrder: readonly BlockId[],
	range: {
		readonly from: { readonly blockId: BlockId; readonly offset: number };
		readonly to: { readonly blockId: BlockId; readonly offset: number };
	},
	fromIdx: number,
	toIdx: number,
): void {
	const firstBlock = state.getBlock(range.from.blockId);
	if (!firstBlock) return;
	const firstLen = getBlockLength(firstBlock);

	if (range.from.offset < firstLen) {
		builder.deleteTextAt(range.from.blockId, range.from.offset, firstLen);
	}

	if (range.to.offset > 0) {
		builder.deleteTextAt(range.to.blockId, 0, range.to.offset);
	}

	for (let i = fromIdx + 1; i < toIdx; i++) {
		const midBlockId = blockOrder[i];
		if (!midBlockId) continue;
		const midBlock = state.getBlock(midBlockId);
		if (!midBlock) continue;
		const midLen = getBlockLength(midBlock);
		if (midLen > 0) {
			builder.deleteTextAt(midBlockId, 0, midLen);
		}
		builder.mergeBlocksAt(range.from.blockId, midBlockId);
	}

	builder.mergeBlocksAt(range.from.blockId, range.to.blockId);
}

/**
 * Deletes a selection spanning different root-level ancestors.
 * Removes intermediate and composite root blocks, merges leaf roots.
 * Returns a replacement cursor block ID if from was inside a removed composite.
 */
function deleteCrossRootRange(
	state: EditorState,
	builder: TransactionBuilder,
	range: {
		readonly from: { readonly blockId: BlockId; readonly offset: number };
		readonly to: { readonly blockId: BlockId; readonly offset: number };
	},
	fromRootIdx: number,
	toRootIdx: number,
): BlockId | undefined {
	const fromRoot = state.doc.children[fromRootIdx];
	const toRoot = state.doc.children[toRootIdx];
	if (!fromRoot || !toRoot) return undefined;

	const fromIsLeaf: boolean = isLeafBlock(fromRoot);
	const toIsLeaf: boolean = isLeafBlock(toRoot);

	// When from is inside a composite root, insert a landing paragraph
	// so callers can reference a surviving block for cursor/insert.
	let landingId: BlockId | undefined;
	let indexShift = 0;

	if (!fromIsLeaf) {
		landingId = generateBlockId();
		builder.insertNode([], fromRootIdx, createEmptyParagraph(landingId));
		indexShift = 1;
	}

	// Delete text in from-leaf (only for leaf roots; composite roots are removed entirely)
	if (fromIsLeaf) {
		const fromBlock = state.getBlock(range.from.blockId);
		if (fromBlock) {
			const fromLen: number = getBlockLength(fromBlock);
			if (range.from.offset < fromLen) {
				builder.deleteTextAt(range.from.blockId, range.from.offset, fromLen);
			}
		}
	}

	// Delete text in to-leaf (only for leaf roots)
	if (toIsLeaf && range.to.offset > 0) {
		builder.deleteTextAt(range.to.blockId, 0, range.to.offset);
	}

	// Remove root-level blocks in descending index order.
	// Keep from-root if it's a leaf; remove if composite (shifted by indexShift).
	// Keep to-root if it's a leaf (will merge into from); remove if composite.
	const removeEnd: number = toIsLeaf ? toRootIdx - 1 + indexShift : toRootIdx + indexShift;
	const removeStart: number = fromIsLeaf ? fromRootIdx + 1 : fromRootIdx + indexShift;

	for (let i = removeEnd; i >= removeStart; i--) {
		builder.removeNode([], i);
	}

	// Merge to-root into from if both are leaf roots
	if (fromIsLeaf && toIsLeaf) {
		builder.mergeBlocksAt(range.from.blockId, range.to.blockId);
	}

	return landingId;
}
