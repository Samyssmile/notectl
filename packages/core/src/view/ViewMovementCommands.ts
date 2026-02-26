/**
 * View-based movement commands that use the browser's `Selection.modify()` API
 * for word, line-boundary, and line granularity movement.
 *
 * Falls back to model-based commands when `Selection.modify` is unavailable
 * (e.g. in happy-dom test environments).
 */

import {
	findWordBoundaryBackward,
	findWordBoundaryForward,
	isVoidBlock,
} from '../commands/Commands.js';
import { moveToBlockEnd, moveToBlockStart } from '../commands/MovementCommands.js';
import { getBlockLength, getContentAtOffset } from '../model/Document.js';
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
import { canCrossBlockBoundary, navigateAcrossBlocks } from './CaretNavigation.js';
import { getSelection, readSelectionFromDOM } from './SelectionSync.js';

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
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

	const domSel: globalThis.Selection | null = getSelection(container);
	if (!domSel?.modify) {
		return fallbackMove(state, direction, granularity);
	}

	// Save original DOM selection
	const origAnchor: Node | null = domSel.anchorNode;
	const origAnchorOff: number = domSel.anchorOffset;
	const origFocus: Node | null = domSel.focusNode;
	const origFocusOff: number = domSel.focusOffset;
	if (!origAnchor || !origFocus) return fallbackMove(state, direction, granularity);

	try {
		domSel.modify('move', direction, granularity);

		const newSel = readSelectionFromDOM(container);
		if (!newSel) return null;

		const newBlockId: BlockId = newSel.anchor.blockId;
		const oldBlockId: BlockId = sel.anchor.blockId;

		// Validate isolating boundary crossing
		if (newBlockId !== oldBlockId && !canCrossBlockBoundary(state, oldBlockId, newBlockId)) {
			return null;
		}

		let newOffset: number = newSel.anchor.offset;

		// InlineNode boundary correction
		const block = state.getBlock(newBlockId);
		if (block) {
			const content = getContentAtOffset(block, newOffset);
			if (content?.kind === 'inline') {
				// Prefer landing after the InlineNode when moving forward
				if (direction === 'forward') {
					newOffset = Math.min(newOffset + 1, getBlockLength(block));
				}
			}
		}

		// Void block → NodeSelection
		if (isVoidBlock(state, newBlockId)) {
			const path: BlockId[] = (findNodePath(state.doc, newBlockId) ?? []) as BlockId[];
			return state
				.transaction('input')
				.setSelection(createNodeSelection(newBlockId, path))
				.setStoredMarks(null, state.storedMarks)
				.build();
		}

		return state
			.transaction('input')
			.setSelection(createCollapsedSelection(newBlockId, newOffset))
			.setStoredMarks(null, state.storedMarks)
			.build();
	} finally {
		// Restore original DOM selection (dispatch cycle will set the correct one)
		try {
			domSel.setBaseAndExtent(origAnchor, origAnchorOff, origFocus, origFocusOff);
		} catch {
			// Restore may fail if DOM changed
		}
	}
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
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

	const domSel: globalThis.Selection | null = getSelection(container);
	if (!domSel?.modify) {
		return fallbackExtend(state, direction, granularity);
	}

	const origAnchor: Node | null = domSel.anchorNode;
	const origAnchorOff: number = domSel.anchorOffset;
	const origFocus: Node | null = domSel.focusNode;
	const origFocusOff: number = domSel.focusOffset;
	if (!origAnchor || !origFocus) return fallbackExtend(state, direction, granularity);

	try {
		domSel.modify('extend', direction, granularity);

		const newSel = readSelectionFromDOM(container);
		if (!newSel) return null;

		// Validate isolating boundary crossing for head
		const oldHeadBlockId: BlockId = sel.head.blockId;
		const newHeadBlockId: BlockId = newSel.head.blockId;

		if (
			newHeadBlockId !== oldHeadBlockId &&
			!canCrossBlockBoundary(state, oldHeadBlockId, newHeadBlockId)
		) {
			return null;
		}

		let newHeadOffset: number = newSel.head.offset;

		// InlineNode boundary correction for head position
		const headBlock = state.getBlock(newSel.head.blockId);
		if (headBlock) {
			const content = getContentAtOffset(headBlock, newHeadOffset);
			if (content?.kind === 'inline') {
				if (direction === 'forward') {
					newHeadOffset = Math.min(newHeadOffset + 1, getBlockLength(headBlock));
				}
			}
		}

		return state
			.transaction('input')
			.setSelection(
				createSelection(
					{ blockId: sel.anchor.blockId, offset: sel.anchor.offset },
					{ blockId: newSel.head.blockId, offset: newHeadOffset },
				),
			)
			.setStoredMarks(null, state.storedMarks)
			.build();
	} finally {
		try {
			domSel.setBaseAndExtent(origAnchor, origAnchorOff, origFocus, origFocusOff);
		} catch {
			// Restore may fail
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
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

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
		return state
			.transaction('input')
			.setSelection(
				createSelection(
					{ blockId: sel.anchor.blockId, offset: sel.anchor.offset },
					{ blockId: targetId, offset: targetOffset },
				),
			)
			.setStoredMarks(null, state.storedMarks)
			.build();
	}

	return state
		.transaction('input')
		.setSelection(
			createSelection(
				{ blockId: sel.anchor.blockId, offset: sel.anchor.offset },
				{ blockId: head.blockId, offset: newOffset },
			),
		)
		.setStoredMarks(null, state.storedMarks)
		.build();
}

function fallbackWordMove(state: EditorState, direction: Direction): Transaction | null {
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

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

	return state
		.transaction('input')
		.setSelection(createCollapsedSelection(blockId, newOffset))
		.setStoredMarks(null, state.storedMarks)
		.build();
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

	if (isVoidBlock(state, targetId)) {
		const path: BlockId[] = (findNodePath(state.doc, targetId) ?? []) as BlockId[];
		return state
			.transaction('input')
			.setSelection(createNodeSelection(targetId, path))
			.setStoredMarks(null, state.storedMarks)
			.build();
	}

	const targetBlock = state.getBlock(targetId);
	if (!targetBlock) return null;

	const targetOffset: number = direction === 'forward' ? 0 : getBlockLength(targetBlock);
	return state
		.transaction('input')
		.setSelection(createCollapsedSelection(targetId, targetOffset))
		.setStoredMarks(null, state.storedMarks)
		.build();
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
