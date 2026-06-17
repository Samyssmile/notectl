/**
 * Core editor commands and barrel re-exports from submodules.
 *
 * This module contains text insertion, block splitting, block merging,
 * selection deletion, and select-all. Mark, delete, gap-cursor, node-selection,
 * and word-boundary commands are re-exported from their respective modules.
 */

import {
	type Mark,
	createEmptyParagraph,
	createInlineNode,
	generateBlockId,
	getBlockLength,
	getBlockMarksAtOffset,
	getCursorMarks,
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
import { resolveInsertPoint } from './CommandHelpers.js';
import { isMarkInclusive } from './CursorMarks.js';
import { insertParagraphAtGap, insertTextAtGap } from './GapCursorCommands.js';
import {
	deleteNodeSelection,
	findFirstLeafBlockId,
	findLastLeafBlockId,
	insertParagraphAfterNodeSelection,
	insertTextAfterNodeSelection,
} from './NodeSelectionCommands.js';
import { deleteCrossRootRange, deleteLeafRange, getRootBlockIndex } from './SelectionDeletion.js';

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

export { forEachBlockIdInRange, forEachBlockInRange } from './RangeIterator.js';

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

	// Deleting a selection that spans the whole document resets it to the
	// canonical empty state (a single empty paragraph). Without this, the range
	// merge keeps the first block's type and attributes, leaving e.g. an empty
	// centered title behind so the placeholder never returns.
	if (selectionCoversDocument(state)) {
		return clearDocument(state);
	}

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
	const docRange = documentRange(state);
	if (!docRange) return state.transaction('command').setSelection(state.selection).build();

	return state
		.transaction('command')
		.setSelection(createSelection(docRange.from, docRange.to))
		.build();
}

// --- Internal Helpers ---

interface DocumentPosition {
	readonly blockId: BlockId;
	readonly offset: number;
}

/**
 * Endpoints of a full-document selection: the start of the first leaf block to
 * the end of the last leaf block. Returns `null` for an empty document.
 */
function documentRange(
	state: EditorState,
): { from: DocumentPosition; to: DocumentPosition } | null {
	const blocks = state.doc.children;
	const firstBlock = blocks[0];
	const lastBlock = blocks[blocks.length - 1];
	if (!firstBlock || !lastBlock) return null;

	const firstLeafId: BlockId = findFirstLeafBlockId(firstBlock);
	const lastLeafId: BlockId = findLastLeafBlockId(lastBlock);
	const lastLeaf = state.getBlock(lastLeafId);
	const lastLeafLen: number = lastLeaf ? getBlockLength(lastLeaf) : 0;

	return {
		from: { blockId: firstLeafId, offset: 0 },
		to: { blockId: lastLeafId, offset: lastLeafLen },
	};
}

/** True when the current text selection spans the entire document. */
function selectionCoversDocument(state: EditorState): boolean {
	if (!isTextSelection(state.selection)) return false;
	const docRange = documentRange(state);
	if (!docRange) return false;

	const range = selectionRange(state.selection, state.getBlockOrder());
	return (
		range.from.blockId === docRange.from.blockId &&
		range.from.offset === docRange.from.offset &&
		range.to.blockId === docRange.to.blockId &&
		range.to.offset === docRange.to.offset
	);
}

/**
 * Replaces the whole document with a single empty paragraph and places the
 * cursor inside it. The fresh paragraph is inserted before the originals are
 * removed so the document never passes through a zero-children state.
 */
function clearDocument(state: EditorState): Transaction {
	const newBlockId: BlockId = generateBlockId();
	const builder = state.transaction('input');
	const originalCount: number = state.doc.children.length;

	builder.insertNode([], 0, createEmptyParagraph(newBlockId));
	// The originals shifted to indices 1..originalCount; remove them descending
	// so each index stays valid as the document shrinks.
	for (let i = originalCount; i >= 1; i--) {
		builder.removeNode([], i);
	}
	builder.setSelection(createCollapsedSelection(newBlockId, 0));

	return builder.build();
}

function resolveActiveMarks(state: EditorState): readonly Mark[] {
	if (state.storedMarks) return state.storedMarks;

	const sel = state.selection;
	if (!isTextSelection(sel)) return [];

	const block = state.getBlock(sel.anchor.blockId);
	if (!block) return [];

	// A range replaced by typing inherits the marks at its anchor (raw content
	// marks); only a collapsed cursor honors right-boundary inclusivity.
	if (!isCollapsed(sel)) return getBlockMarksAtOffset(block, sel.anchor.offset);

	return getCursorMarks(block, sel.anchor.offset, (type) => isMarkInclusive(state.schema, type));
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
