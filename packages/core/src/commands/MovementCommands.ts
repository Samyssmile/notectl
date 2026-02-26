/**
 * Model-based movement commands for programmatic cursor navigation.
 *
 * All functions are pure: they take an EditorState and return a Transaction
 * or `null` (when the movement is not applicable). None touch the DOM.
 *
 * Move commands produce a collapsed cursor. Extend commands keep the anchor
 * and move the head, producing a range selection. All clear storedMarks.
 */

import {
	blockOffsetToTextOffset,
	getBlockLength,
	getBlockText,
	getContentAtOffset,
} from '../model/Document.js';
import { nextGraphemeSize, prevGraphemeSize } from '../model/GraphemeUtils.js';
import { findNodePath } from '../model/NodeResolver.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	createSelection,
	isCollapsed,
	isGapCursor,
	isNodeSelection,
} from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { canCrossBlockBoundary } from '../view/CaretNavigation.js';
import { isVoidBlock } from './Commands.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolves the effective head position from any text selection. */
function resolveHead(state: EditorState): { blockId: BlockId; offset: number } | null {
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;
	return { blockId: sel.head.blockId, offset: sel.head.offset };
}

/** Returns the adjacent block ID in the given direction, or `null`. */
function adjacentBlockId(
	state: EditorState,
	currentBlockId: BlockId,
	direction: 'forward' | 'backward',
): BlockId | null {
	const blockOrder: readonly BlockId[] = state.getBlockOrder();
	const idx: number = blockOrder.indexOf(currentBlockId);
	if (idx < 0) return null;
	const targetIdx: number = direction === 'forward' ? idx + 1 : idx - 1;
	if (targetIdx < 0 || targetIdx >= blockOrder.length) return null;
	return blockOrder[targetIdx] ?? null;
}

/** Builds a transaction that moves the cursor and clears storedMarks. */
function moveTx(state: EditorState, blockId: BlockId, offset: number): Transaction {
	return state
		.transaction('input')
		.setSelection(createCollapsedSelection(blockId, offset))
		.setStoredMarks(null, state.storedMarks)
		.build();
}

/** Builds a transaction that extends the selection and clears storedMarks. */
function extendTx(
	state: EditorState,
	anchorBlockId: BlockId,
	anchorOffset: number,
	headBlockId: BlockId,
	headOffset: number,
): Transaction {
	return state
		.transaction('input')
		.setSelection(
			createSelection(
				{ blockId: anchorBlockId, offset: anchorOffset },
				{ blockId: headBlockId, offset: headOffset },
			),
		)
		.setStoredMarks(null, state.storedMarks)
		.build();
}

// ---------------------------------------------------------------------------
// Character Movement
// ---------------------------------------------------------------------------

/** Moves the cursor one character forward, skipping InlineNodes atomically. */
export function moveCharacterForward(state: EditorState): Transaction | null {
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

	// If range selection, collapse to head
	if (!isCollapsed(sel)) {
		return moveTx(state, sel.head.blockId, sel.head.offset);
	}

	const blockId: BlockId = sel.anchor.blockId;
	const block = state.getBlock(blockId);
	if (!block) return null;

	const offset: number = sel.anchor.offset;
	const blockLen: number = getBlockLength(block);

	if (offset < blockLen) {
		// InlineNode: skip atomically (+1)
		const content = getContentAtOffset(block, offset);
		if (content?.kind === 'inline') {
			return moveTx(state, blockId, offset + 1);
		}
		// Text: advance by one grapheme cluster
		const text: string = getBlockText(block);
		const textOffset: number = blockOffsetToTextOffset(block, offset);
		const step: number = nextGraphemeSize(text, textOffset) || 1;
		return moveTx(state, blockId, offset + step);
	}

	// At block end → cross-block
	const nextId: BlockId | null = adjacentBlockId(state, blockId, 'forward');
	if (!nextId) return null;
	if (!canCrossBlockBoundary(state, blockId, nextId)) return null;

	if (isVoidBlock(state, nextId)) {
		const path: BlockId[] = (findNodePath(state.doc, nextId) ?? []) as BlockId[];
		return state
			.transaction('input')
			.setSelection(createNodeSelection(nextId, path))
			.setStoredMarks(null, state.storedMarks)
			.build();
	}

	return moveTx(state, nextId, 0);
}

/** Moves the cursor one character backward, skipping InlineNodes atomically. */
export function moveCharacterBackward(state: EditorState): Transaction | null {
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

	// If range selection, collapse to head
	if (!isCollapsed(sel)) {
		return moveTx(state, sel.head.blockId, sel.head.offset);
	}

	const blockId: BlockId = sel.anchor.blockId;
	const block = state.getBlock(blockId);
	if (!block) return null;

	const offset: number = sel.anchor.offset;

	if (offset > 0) {
		// InlineNode: skip atomically (-1)
		const content = getContentAtOffset(block, offset - 1);
		if (content?.kind === 'inline') {
			return moveTx(state, blockId, offset - 1);
		}
		// Text: retreat by one grapheme cluster
		const text: string = getBlockText(block);
		const textOffset: number = blockOffsetToTextOffset(block, offset);
		const step: number = prevGraphemeSize(text, textOffset) || 1;
		return moveTx(state, blockId, offset - step);
	}

	// At block start → cross-block
	const prevId: BlockId | null = adjacentBlockId(state, blockId, 'backward');
	if (!prevId) return null;
	if (!canCrossBlockBoundary(state, blockId, prevId)) return null;

	if (isVoidBlock(state, prevId)) {
		const path: BlockId[] = (findNodePath(state.doc, prevId) ?? []) as BlockId[];
		return state
			.transaction('input')
			.setSelection(createNodeSelection(prevId, path))
			.setStoredMarks(null, state.storedMarks)
			.build();
	}

	const prevBlock = state.getBlock(prevId);
	if (!prevBlock) return null;
	return moveTx(state, prevId, getBlockLength(prevBlock));
}

// ---------------------------------------------------------------------------
// Block Boundary Movement
// ---------------------------------------------------------------------------

/** Moves the cursor to the start of the current block. */
export function moveToBlockStart(state: EditorState): Transaction | null {
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

	const blockId: BlockId = isCollapsed(sel) ? sel.anchor.blockId : sel.head.blockId;
	const offset: number = isCollapsed(sel) ? sel.anchor.offset : sel.head.offset;

	if (offset === 0) return null;
	return moveTx(state, blockId, 0);
}

/** Moves the cursor to the end of the current block. */
export function moveToBlockEnd(state: EditorState): Transaction | null {
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

	const blockId: BlockId = isCollapsed(sel) ? sel.anchor.blockId : sel.head.blockId;
	const block = state.getBlock(blockId);
	if (!block) return null;

	const blockLen: number = getBlockLength(block);
	const offset: number = isCollapsed(sel) ? sel.anchor.offset : sel.head.offset;

	if (offset === blockLen) return null;
	return moveTx(state, blockId, blockLen);
}

// ---------------------------------------------------------------------------
// Document Boundary Movement
// ---------------------------------------------------------------------------

/** Moves the cursor to the beginning of the document. */
export function moveToDocumentStart(state: EditorState): Transaction | null {
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

	const blockOrder: readonly BlockId[] = state.getBlockOrder();
	const firstId: BlockId | undefined = blockOrder[0];
	if (!firstId) return null;

	if (isVoidBlock(state, firstId)) {
		const path: BlockId[] = (findNodePath(state.doc, firstId) ?? []) as BlockId[];
		return state
			.transaction('input')
			.setSelection(createNodeSelection(firstId, path))
			.setStoredMarks(null, state.storedMarks)
			.build();
	}

	return moveTx(state, firstId, 0);
}

/** Moves the cursor to the end of the document. */
export function moveToDocumentEnd(state: EditorState): Transaction | null {
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

	const blockOrder: readonly BlockId[] = state.getBlockOrder();
	const lastId: BlockId | undefined = blockOrder[blockOrder.length - 1];
	if (!lastId) return null;

	if (isVoidBlock(state, lastId)) {
		const path: BlockId[] = (findNodePath(state.doc, lastId) ?? []) as BlockId[];
		return state
			.transaction('input')
			.setSelection(createNodeSelection(lastId, path))
			.setStoredMarks(null, state.storedMarks)
			.build();
	}

	const lastBlock = state.getBlock(lastId);
	if (!lastBlock) return null;
	return moveTx(state, lastId, getBlockLength(lastBlock));
}

// ---------------------------------------------------------------------------
// Extend (Selection Extension) Commands
// ---------------------------------------------------------------------------

/** Extends the selection one character forward. */
export function extendCharacterForward(state: EditorState): Transaction | null {
	const head = resolveHead(state);
	if (!head) return null;

	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

	const block = state.getBlock(head.blockId);
	if (!block) return null;

	const blockLen: number = getBlockLength(block);

	if (head.offset < blockLen) {
		const content = getContentAtOffset(block, head.offset);
		const step: number =
			content?.kind === 'inline'
				? 1
				: nextGraphemeSize(getBlockText(block), blockOffsetToTextOffset(block, head.offset)) || 1;
		return extendTx(state, sel.anchor.blockId, sel.anchor.offset, head.blockId, head.offset + step);
	}

	// Cross-block
	const nextId: BlockId | null = adjacentBlockId(state, head.blockId, 'forward');
	if (!nextId) return null;
	if (!canCrossBlockBoundary(state, head.blockId, nextId)) return null;

	return extendTx(state, sel.anchor.blockId, sel.anchor.offset, nextId, 0);
}

/** Extends the selection one character backward. */
export function extendCharacterBackward(state: EditorState): Transaction | null {
	const head = resolveHead(state);
	if (!head) return null;

	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

	if (head.offset > 0) {
		const block = state.getBlock(head.blockId);
		if (!block) return null;
		const content = getContentAtOffset(block, head.offset - 1);
		const step: number =
			content?.kind === 'inline'
				? 1
				: prevGraphemeSize(getBlockText(block), blockOffsetToTextOffset(block, head.offset)) || 1;
		return extendTx(state, sel.anchor.blockId, sel.anchor.offset, head.blockId, head.offset - step);
	}

	// Cross-block
	const prevId: BlockId | null = adjacentBlockId(state, head.blockId, 'backward');
	if (!prevId) return null;
	if (!canCrossBlockBoundary(state, head.blockId, prevId)) return null;

	const prevBlock = state.getBlock(prevId);
	if (!prevBlock) return null;

	return extendTx(state, sel.anchor.blockId, sel.anchor.offset, prevId, getBlockLength(prevBlock));
}

/** Extends the selection to the start of the current block. */
export function extendToBlockStart(state: EditorState): Transaction | null {
	const head = resolveHead(state);
	if (!head) return null;

	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

	if (head.offset === 0) return null;
	return extendTx(state, sel.anchor.blockId, sel.anchor.offset, head.blockId, 0);
}

/** Extends the selection to the end of the current block. */
export function extendToBlockEnd(state: EditorState): Transaction | null {
	const head = resolveHead(state);
	if (!head) return null;

	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

	const block = state.getBlock(head.blockId);
	if (!block) return null;

	const blockLen: number = getBlockLength(block);
	if (head.offset === blockLen) return null;

	return extendTx(state, sel.anchor.blockId, sel.anchor.offset, head.blockId, blockLen);
}

/** Extends the selection to the start of the document. */
export function extendToDocumentStart(state: EditorState): Transaction | null {
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

	const blockOrder: readonly BlockId[] = state.getBlockOrder();
	const firstId: BlockId | undefined = blockOrder[0];
	if (!firstId) return null;

	// No-op if head is already at document start
	if (sel.head.blockId === firstId && sel.head.offset === 0) return null;

	return extendTx(state, sel.anchor.blockId, sel.anchor.offset, firstId, 0);
}

/** Extends the selection to the end of the document. */
export function extendToDocumentEnd(state: EditorState): Transaction | null {
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

	const blockOrder: readonly BlockId[] = state.getBlockOrder();
	const lastId: BlockId | undefined = blockOrder[blockOrder.length - 1];
	if (!lastId) return null;

	const lastBlock = state.getBlock(lastId);
	if (!lastBlock) return null;

	const lastBlockLen: number = getBlockLength(lastBlock);

	// No-op if head is already at document end
	if (sel.head.blockId === lastId && sel.head.offset === lastBlockLen) return null;

	return extendTx(state, sel.anchor.blockId, sel.anchor.offset, lastId, lastBlockLen);
}
