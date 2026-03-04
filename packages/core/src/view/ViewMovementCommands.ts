/**
 * View-based movement commands that use the browser's `Selection.modify()` API
 * for word, line-boundary, and line granularity movement.
 *
 * Falls back to model-based commands when `Selection.modify` is unavailable
 * (e.g. in happy-dom test environments).
 */

import { getBlockLength, getContentAtOffset } from '../model/Document.js';
import { isCollapsed, isTextSelection } from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import { findWordBoundaryBackward, findWordBoundaryForward } from '../model/WordBoundary.js';
import { moveToBlockEnd, moveToBlockStart } from '../state/BlockBoundaryMovement.js';
import type { EditorState } from '../state/EditorState.js';
import { canCrossBlockBoundary, isVoidBlock } from '../state/NavigationQueries.js';
import { extendTx, moveTx, nodeSelTx } from '../state/SelectionTransactions.js';
import type { Transaction } from '../state/Transaction.js';
import { navigateAcrossBlocks } from './CaretNavigation.js';
import type { SelectionEndpoints } from './SelectionSync.js';
import { getSelection, readDOMSelectionEndpoints, readSelectionFromDOM } from './SelectionSync.js';

type Direction = 'forward' | 'backward';
type Granularity = 'word' | 'lineboundary' | 'line';

// ---------------------------------------------------------------------------
// Core view movement
// ---------------------------------------------------------------------------

/**
 * Moves the cursor using `Selection.modify('move', direction, granularity)`.
 * Falls back to model-based movement when the API is unavailable.
 */
export function viewMove(
	container: HTMLElement,
	state: EditorState,
	direction: Direction,
	granularity: Granularity,
): Transaction | null {
	return viewModifySelection(container, state, 'move', direction, granularity);
}

/**
 * Extends the selection using `Selection.modify('extend', direction, granularity)`.
 * Falls back to model-based extension when the API is unavailable.
 */
export function viewExtend(
	container: HTMLElement,
	state: EditorState,
	direction: Direction,
	granularity: Granularity,
): Transaction | null {
	return viewModifySelection(container, state, 'extend', direction, granularity);
}

/**
 * Shared implementation for viewMove and viewExtend.
 * Uses Selection.modify() with save/restore of DOM selection,
 * with fallback to model-based movement.
 */
function viewModifySelection(
	container: HTMLElement,
	state: EditorState,
	mode: 'move' | 'extend',
	direction: Direction,
	granularity: Granularity,
): Transaction | null {
	const sel = state.selection;
	if (!isTextSelection(sel)) return null;

	const fallback = mode === 'move' ? fallbackMove : fallbackExtend;

	const domSel: globalThis.Selection | null = getSelection();
	if (!domSel?.modify) {
		return fallback(state, direction, granularity);
	}

	const origEndpoints: SelectionEndpoints | null = readDOMSelectionEndpoints(container, domSel);
	if (!origEndpoints) return fallback(state, direction, granularity);

	try {
		domSel.modify(mode, direction, granularity);

		const newSel = readSelectionFromDOM(container);
		if (!newSel) return null;

		// For move: check anchor; for extend: check head
		const oldBlockId: BlockId = mode === 'move' ? sel.anchor.blockId : sel.head.blockId;
		const newPosition = mode === 'move' ? newSel.anchor : newSel.head;
		const newBlockId: BlockId = newPosition.blockId;

		if (newBlockId !== oldBlockId && !canCrossBlockBoundary(state, oldBlockId, newBlockId)) {
			return null;
		}

		let newOffset: number = newPosition.offset;

		// InlineNode boundary correction
		const block = state.getBlock(newBlockId);
		if (block) {
			const content = getContentAtOffset(block, newOffset);
			if (content?.kind === 'inline' && direction === 'forward') {
				newOffset = Math.min(newOffset + 1, getBlockLength(block));
			}
		}

		if (mode === 'move') {
			if (isVoidBlock(state, newBlockId)) return nodeSelTx(state, newBlockId);
			return moveTx(state, newBlockId, newOffset);
		}

		return extendTx(state, sel.anchor.blockId, sel.anchor.offset, newBlockId, newOffset);
	} finally {
		try {
			domSel.setBaseAndExtent(
				origEndpoints.anchorNode,
				origEndpoints.anchorOffset,
				origEndpoints.focusNode,
				origEndpoints.focusOffset,
			);
		} catch {
			// Restore may fail if DOM changed
		}
	}
}

// ---------------------------------------------------------------------------
// Fallback (model-based) when Selection.modify is unavailable
// ---------------------------------------------------------------------------

function fallbackMove(
	state: EditorState,
	direction: Direction,
	granularity: Granularity,
): Transaction | null {
	if (granularity === 'word') {
		return fallbackWordMove(state, direction);
	}
	if (granularity === 'lineboundary') {
		return direction === 'forward' ? moveToBlockEnd(state) : moveToBlockStart(state);
	}
	// granularity === 'line' → cross-block
	const caretDir = direction === 'forward' ? 'down' : 'up';
	return navigateAcrossBlocks(state, caretDir);
}

function fallbackExtend(
	state: EditorState,
	direction: Direction,
	granularity: Granularity,
): Transaction | null {
	const sel = state.selection;
	if (!isTextSelection(sel)) return null;

	const head = sel.head;
	const block = state.getBlock(head.blockId);
	if (!block) return null;

	let newOffset: number = head.offset;

	if (granularity === 'word') {
		newOffset =
			direction === 'forward'
				? findWordBoundaryForward(block, head.offset)
				: findWordBoundaryBackward(block, head.offset);
	} else if (granularity === 'lineboundary') {
		newOffset = direction === 'forward' ? getBlockLength(block) : 0;
	} else {
		// line: extend to next block boundary
		const blockOrder: readonly BlockId[] = state.getBlockOrder();
		const idx: number = blockOrder.indexOf(head.blockId);
		const targetIdx: number = direction === 'forward' ? idx + 1 : idx - 1;

		if (targetIdx < 0 || targetIdx >= blockOrder.length) return null;

		const targetId: BlockId | undefined = blockOrder[targetIdx];
		if (!targetId) return null;
		if (!canCrossBlockBoundary(state, head.blockId, targetId)) return null;

		if (isVoidBlock(state, targetId)) {
			// Cannot extend a text selection into a void block
			return null;
		}

		const targetBlock = state.getBlock(targetId);
		if (!targetBlock) return null;

		const targetOffset: number = direction === 'forward' ? 0 : getBlockLength(targetBlock);
		return extendTx(state, sel.anchor.blockId, sel.anchor.offset, targetId, targetOffset);
	}

	return extendTx(state, sel.anchor.blockId, sel.anchor.offset, head.blockId, newOffset);
}

function fallbackWordMove(state: EditorState, direction: Direction): Transaction | null {
	const sel = state.selection;
	if (!isTextSelection(sel)) return null;

	const blockId: BlockId = isCollapsed(sel) ? sel.anchor.blockId : sel.head.blockId;
	const offset: number = isCollapsed(sel) ? sel.anchor.offset : sel.head.offset;
	const block = state.getBlock(blockId);
	if (!block) return null;

	const newOffset: number =
		direction === 'forward'
			? findWordBoundaryForward(block, offset)
			: findWordBoundaryBackward(block, offset);

	if (newOffset === offset) {
		// At block boundary — try crossing blocks
		return fallbackCrossBlock(state, blockId, direction);
	}

	return moveTx(state, blockId, newOffset);
}

/**
 * Crosses a block boundary from `blockId` in the given direction.
 * Checks `canCrossBlockBoundary` and handles void blocks (→ NodeSelection).
 */
function fallbackCrossBlock(
	state: EditorState,
	blockId: BlockId,
	direction: Direction,
): Transaction | null {
	const blockOrder: readonly BlockId[] = state.getBlockOrder();
	const idx: number = blockOrder.indexOf(blockId);
	const targetIdx: number = direction === 'forward' ? idx + 1 : idx - 1;

	if (targetIdx < 0 || targetIdx >= blockOrder.length) return null;

	const targetId: BlockId | undefined = blockOrder[targetIdx];
	if (!targetId) return null;
	if (!canCrossBlockBoundary(state, blockId, targetId)) return null;

	if (isVoidBlock(state, targetId)) return nodeSelTx(state, targetId);

	const targetBlock = state.getBlock(targetId);
	if (!targetBlock) return null;

	const targetOffset: number = direction === 'forward' ? 0 : getBlockLength(targetBlock);
	return moveTx(state, targetId, targetOffset);
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

/** Moves the cursor one word forward. */
export function moveWordForward(container: HTMLElement, state: EditorState): Transaction | null {
	return viewMove(container, state, 'forward', 'word');
}

/** Moves the cursor one word backward. */
export function moveWordBackward(container: HTMLElement, state: EditorState): Transaction | null {
	return viewMove(container, state, 'backward', 'word');
}

/** Moves the cursor to the start of the line (visual). */
export function moveToLineStart(container: HTMLElement, state: EditorState): Transaction | null {
	return viewMove(container, state, 'backward', 'lineboundary');
}

/** Moves the cursor to the end of the line (visual). */
export function moveToLineEnd(container: HTMLElement, state: EditorState): Transaction | null {
	return viewMove(container, state, 'forward', 'lineboundary');
}

/** Moves the cursor one visual line up. */
export function moveLineUp(container: HTMLElement, state: EditorState): Transaction | null {
	return viewMove(container, state, 'backward', 'line');
}

/** Moves the cursor one visual line down. */
export function moveLineDown(container: HTMLElement, state: EditorState): Transaction | null {
	return viewMove(container, state, 'forward', 'line');
}

/** Extends the selection one word forward. */
export function extendWordForward(container: HTMLElement, state: EditorState): Transaction | null {
	return viewExtend(container, state, 'forward', 'word');
}

/** Extends the selection one word backward. */
export function extendWordBackward(container: HTMLElement, state: EditorState): Transaction | null {
	return viewExtend(container, state, 'backward', 'word');
}

/** Extends the selection to the start of the line. */
export function extendToLineStart(container: HTMLElement, state: EditorState): Transaction | null {
	return viewExtend(container, state, 'backward', 'lineboundary');
}

/** Extends the selection to the end of the line. */
export function extendToLineEnd(container: HTMLElement, state: EditorState): Transaction | null {
	return viewExtend(container, state, 'forward', 'lineboundary');
}

/** Extends the selection one visual line up. */
export function extendLineUp(container: HTMLElement, state: EditorState): Transaction | null {
	return viewExtend(container, state, 'backward', 'line');
}

/** Extends the selection one visual line down. */
export function extendLineDown(container: HTMLElement, state: EditorState): Transaction | null {
	return viewExtend(container, state, 'forward', 'line');
}
