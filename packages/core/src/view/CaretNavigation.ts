/**
 * Caret navigation utilities for layout-aware cursor movement.
 *
 * Provides `endOfTextblock()` for detecting visual block boundaries,
 * `navigateAcrossBlocks()` for cross-block cursor transitions, and
 * `navigateVerticalWithGoalColumn()` for column-preserving vertical nav.
 */

import { canCrossBlockBoundary, isVoidBlock } from '../commands/Commands.js';
import { type BlockNode, getBlockLength, getContentAtOffset } from '../model/Document.js';
import { findNodePath } from '../model/NodeResolver.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	isCollapsed,
	isGapCursor,
	isNodeSelection,
} from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { getTextDirection } from './Platform.js';
import { domPositionToState, getSelection } from './SelectionSync.js';

export type CaretDirection = 'left' | 'right' | 'up' | 'down';

/** Result of resolving the adjacent block for vertical navigation. */
interface NavigationTarget {
	readonly targetId: BlockId;
	readonly isVoid: boolean;
}

/**
 * Checks whether the cursor is at the visual edge of its text block.
 *
 * For horizontal directions (left/right), uses a pure offset check.
 * For vertical directions (up/down), tries `Selection.modify` probing
 * to detect visual line boundaries, falling back to offset heuristic.
 *
 * An optional `caretRect` parameter avoids redundant `getBoundingClientRect`
 * calls when the caller already measured the caret position.
 */
export function endOfTextblock(
	container: HTMLElement,
	state: EditorState,
	direction: CaretDirection,
	caretRect?: DOMRect | null,
): boolean {
	const sel = state.selection;

	if (isNodeSelection(sel) || isGapCursor(sel)) return false;
	if (!isCollapsed(sel)) return false;

	const block = state.getBlock(sel.anchor.blockId);
	if (!block) return false;

	const offset: number = sel.anchor.offset;
	const blockLength: number = getBlockLength(block);

	// Horizontal: direction-aware offset check
	const blockEl: Element | null = container.querySelector(
		`[data-block-id="${sel.anchor.blockId}"]`,
	);
	const isRtl: boolean = blockEl instanceof HTMLElement && getTextDirection(blockEl) === 'rtl';

	if (direction === 'left') return isRtl ? offset === blockLength : offset === 0;
	if (direction === 'right') return isRtl ? offset === 0 : offset === blockLength;

	// Vertical: quick offset check first
	if (direction === 'up' && offset === 0) return true;
	if (direction === 'down' && offset === blockLength) return true;

	// Vertical: try Selection.modify probing for multi-line blocks
	const domSel: globalThis.Selection | null = getSelection(container);
	if (!domSel || !domSel.modify) {
		// Fallback: offset heuristic (no Selection.modify in test environments)
		return direction === 'up' ? offset === 0 : offset === blockLength;
	}

	return probeVerticalBoundary(container, domSel, direction, caretRect);
}

/**
 * Creates a transaction to move the cursor to an adjacent block.
 *
 * Returns `null` if navigation is not possible (document boundary,
 * isolating boundary, or no adjacent block).
 */
export function navigateAcrossBlocks(
	state: EditorState,
	direction: CaretDirection,
): Transaction | null {
	const target: NavigationTarget | null = resolveNavigationTarget(state, direction);
	if (!target) return null;

	if (target.isVoid) return nodeSelTx(state, target.targetId);

	// Target is text → collapsed selection at start or end
	const targetBlock = state.getBlock(target.targetId);
	if (!targetBlock) return null;

	const targetOffset: number =
		direction === 'right' || direction === 'down' ? 0 : getBlockLength(targetBlock);

	return moveTx(state, target.targetId, targetOffset);
}

/**
 * Navigates vertically using a goal column for visual column preservation.
 *
 * Uses `caretPositionFromPoint` / `caretRangeFromPoint` to find the offset
 * in the target block that is closest to the given goalColumn X coordinate.
 * Falls back to start/end offset when goal column positioning is unavailable.
 */
export function navigateVerticalWithGoalColumn(
	container: HTMLElement,
	state: EditorState,
	direction: 'up' | 'down',
	goalColumn: number | null,
): Transaction | null {
	const target: NavigationTarget | null = resolveNavigationTarget(state, direction);
	if (!target) return null;

	// Void → NodeSelection (goalColumn irrelevant)
	if (target.isVoid) return nodeSelTx(state, target.targetId);

	const targetBlock = state.getBlock(target.targetId);
	if (!targetBlock) return null;
	const blockLen: number = getBlockLength(targetBlock);

	// Try to resolve position using goalColumn
	if (goalColumn !== null) {
		const position = resolveGoalColumnPosition(container, target.targetId, direction, goalColumn);
		if (position) return moveTx(state, position.blockId, position.offset);
	}

	// Fallback: start (down) or end (up)
	const fallbackOffset: number = direction === 'down' ? 0 : blockLen;
	return moveTx(state, target.targetId, fallbackOffset);
}

/**
 * Skips over an InlineNode atomically when arrowing left/right.
 *
 * Returns a transaction moving the cursor past the InlineNode,
 * or `null` if the adjacent content is not an InlineNode (or
 * the direction is vertical).
 */
export function skipInlineNode(state: EditorState, direction: CaretDirection): Transaction | null {
	if (direction === 'up' || direction === 'down') return null;

	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;
	if (!isCollapsed(sel)) return null;

	const blockId: BlockId = sel.anchor.blockId;
	const block = state.getBlock(blockId);
	if (!block) return null;

	const offset: number = sel.anchor.offset;

	return direction === 'right'
		? skipInlineNodeRight(state, blockId, block, offset)
		: skipInlineNodeLeft(state, blockId, block, offset);
}

function skipInlineNodeRight(
	state: EditorState,
	blockId: BlockId,
	block: BlockNode,
	offset: number,
): Transaction | null {
	const content = getContentAtOffset(block, offset);
	if (!content || content.kind !== 'inline') return null;
	return moveTx(state, blockId, offset + 1);
}

function skipInlineNodeLeft(
	state: EditorState,
	blockId: BlockId,
	block: BlockNode,
	offset: number,
): Transaction | null {
	if (offset === 0) return null;
	const content = getContentAtOffset(block, offset - 1);
	if (!content || content.kind !== 'inline') return null;
	return moveTx(state, blockId, offset - 1);
}

/**
 * Navigates from a GapCursor position.
 *
 * - Arrow toward the adjacent void block → NodeSelection of that block.
 * - Arrow away from the void block → find next block: void → NodeSelection,
 *   text → TextSelection, document boundary → no-op.
 */
export function navigateFromGapCursor(
	state: EditorState,
	direction: CaretDirection,
): Transaction | null {
	const sel = state.selection;
	if (!isGapCursor(sel)) return null;

	const blockOrder: readonly BlockId[] = state.getBlockOrder();
	const blockIdx: number = blockOrder.indexOf(sel.blockId);
	if (blockIdx < 0) return null;

	const towardVoid: boolean =
		(sel.side === 'before' && (direction === 'right' || direction === 'down')) ||
		(sel.side === 'after' && (direction === 'left' || direction === 'up'));

	if (towardVoid) return nodeSelTx(state, sel.blockId);

	// Moving away from the void block — find the neighbor in the other direction
	const awayIdx: number = sel.side === 'before' ? blockIdx - 1 : blockIdx + 1;

	if (awayIdx < 0 || awayIdx >= blockOrder.length) return null;

	const targetId: BlockId | undefined = blockOrder[awayIdx];
	if (!targetId) return null;

	if (isVoidBlock(state, targetId)) return nodeSelTx(state, targetId);

	// Text block: place cursor at start or end
	const targetBlock = state.getBlock(targetId);
	if (!targetBlock) return null;

	const targetOffset: number =
		direction === 'left' || direction === 'up' ? getBlockLength(targetBlock) : 0;

	return moveTx(state, targetId, targetOffset);
}

/** Returns the bounding rect of the current caret position, or null. */
export function getCaretRectFromSelection(domSel: globalThis.Selection): DOMRect | null {
	if (domSel.rangeCount === 0) return null;
	const range: Range = domSel.getRangeAt(0);
	const rects: DOMRectList = range.getClientRects();
	if (rects.length > 0) return rects[0] ?? null;
	return range.getBoundingClientRect();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Builds a collapsed-cursor transaction that clears storedMarks. */
function moveTx(state: EditorState, blockId: BlockId, offset: number): Transaction {
	return state
		.transaction('input')
		.setSelection(createCollapsedSelection(blockId, offset))
		.setStoredMarks(null, state.storedMarks)
		.build();
}

/** Builds a NodeSelection transaction that clears storedMarks. */
function nodeSelTx(state: EditorState, targetId: BlockId): Transaction {
	const path: BlockId[] = (findNodePath(state.doc, targetId) ?? []) as BlockId[];
	return state
		.transaction('input')
		.setSelection(createNodeSelection(targetId, path))
		.setStoredMarks(null, state.storedMarks)
		.build();
}

/**
 * Resolves the adjacent block in the given direction for cross-block navigation.
 * Performs boundary checks, isolating checks, and void detection.
 */
function resolveNavigationTarget(
	state: EditorState,
	direction: CaretDirection,
): NavigationTarget | null {
	const blockOrder: readonly BlockId[] = state.getBlockOrder();
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

	const currentIdx: number = blockOrder.indexOf(sel.anchor.blockId);
	if (currentIdx < 0) return null;

	const targetIdx: number =
		direction === 'left' || direction === 'up' ? currentIdx - 1 : currentIdx + 1;

	if (targetIdx < 0 || targetIdx >= blockOrder.length) return null;

	const targetId: BlockId | undefined = blockOrder[targetIdx];
	if (!targetId) return null;

	if (!canCrossBlockBoundary(state, sel.anchor.blockId, targetId)) return null;

	return { targetId, isVoid: isVoidBlock(state, targetId) };
}

/**
 * Resolves an editor position in the target block by using the goalColumn
 * X coordinate and `caretPositionFromPoint` / `caretRangeFromPoint`.
 *
 * Returns `null` when the point-to-caret API is unavailable, when the
 * resolved DOM node falls outside the target block, or when the resulting
 * position doesn't belong to the target block — triggering the fallback
 * (block-end for up, block-start for down) in `navigateVerticalWithGoalColumn`.
 */
function resolveGoalColumnPosition(
	container: HTMLElement,
	targetId: BlockId,
	direction: 'up' | 'down',
	goalColumn: number,
): { blockId: BlockId; offset: number } | null {
	const blockEl: Element | null = container.querySelector(`[data-block-id="${targetId}"]`);
	if (!blockEl) return null;

	const rect: DOMRect = blockEl.getBoundingClientRect();
	// Small inset to ensure we hit inside the line, not on the border
	const y: number = direction === 'down' ? rect.top + 2 : rect.bottom - 2;
	// Clamp goalColumn within the block's horizontal bounds to avoid
	// caretPositionFromPoint returning unexpected results for out-of-bounds X.
	const clampedX: number = Math.min(Math.max(goalColumn, rect.left), rect.right - 1);

	const root: Document | ShadowRoot = container.getRootNode() as Document | ShadowRoot;

	let domNode: Node | null = null;
	let domOffset = 0;

	// Standard API
	if ('caretPositionFromPoint' in root) {
		const cp = (root as Document).caretPositionFromPoint(clampedX, y);
		if (cp) {
			domNode = cp.offsetNode;
			domOffset = cp.offset;
		}
	}

	// Fallback
	if (!domNode && 'caretRangeFromPoint' in root) {
		const range = (root as Document).caretRangeFromPoint(clampedX, y);
		if (range) {
			domNode = range.startContainer;
			domOffset = range.startOffset;
		}
	}

	// Also try on the document when the root is a ShadowRoot and returned nothing
	if (!domNode && root !== container.ownerDocument) {
		const doc: Document = container.ownerDocument;
		if ('caretRangeFromPoint' in doc) {
			const range = doc.caretRangeFromPoint(clampedX, y);
			if (range) {
				domNode = range.startContainer;
				domOffset = range.startOffset;
			}
		}
	}

	if (!domNode) return null;

	// Verify the DOM node is inside the target block
	if (!blockEl.contains(domNode)) return null;

	const position = domPositionToState(container, domNode, domOffset);
	if (!position) return null;

	// Ensure the resolved position is in the target block
	if (position.blockId !== targetId) return null;

	return position;
}

/**
 * Probes whether the cursor is at the top/bottom visual line of a block.
 *
 * Strategy:
 * 1. `Selection.modify('move', direction, 'line')` — moves one visual line.
 * 2. If the cursor left the block or didn't move, it's at the boundary.
 * 3. Cross-check with `getBoundingClientRect`: compare the caret rect before
 *    and after the probe. If the vertical position didn't change, the probe
 *    hit the block edge even though `Selection.modify` reported movement
 *    (can happen with certain inline element layouts).
 *
 * Original DOM selection is always restored before returning.
 */
function probeVerticalBoundary(
	container: HTMLElement,
	domSel: globalThis.Selection,
	direction: 'up' | 'down',
	preReadRect?: DOMRect | null,
): boolean {
	const origAnchor: Node | null = domSel.anchorNode;
	const origAnchorOffset: number = domSel.anchorOffset;
	const origFocus: Node | null = domSel.focusNode;
	const origFocusOffset: number = domSel.focusOffset;

	// Cannot determine position → safe default: not at boundary (let browser handle)
	if (!origAnchor || !origFocus) return false;

	const origRect: DOMRect | null = preReadRect ?? getCaretRectFromSelection(domSel);
	const dirStr: string = direction === 'up' ? 'backward' : 'forward';

	try {
		domSel.modify('move', dirStr, 'line');

		const newFocus: Node | null = domSel.focusNode;
		if (!newFocus) return false;

		// Check if the new position is still within the same block
		const origBlock: HTMLElement | null = findBlockAncestor(container, origFocus);
		const newBlock: HTMLElement | null = findBlockAncestor(container, newFocus);

		// Moved to a different block → definitely at boundary
		if (origBlock !== newBlock) return true;

		// Selection didn't move at all → at boundary
		const didNotMove: boolean =
			domSel.anchorNode === origAnchor &&
			domSel.anchorOffset === origAnchorOffset &&
			domSel.focusNode === origFocus &&
			domSel.focusOffset === origFocusOffset;
		if (didNotMove) return true;

		// Cross-check with getBoundingClientRect: if vertical position unchanged,
		// the probe was a no-op visually (edge case with inline elements)
		if (origRect) {
			const newRect: DOMRect | null = getCaretRectFromSelection(domSel);
			if (newRect) {
				const verticalDelta: number = Math.abs(newRect.top - origRect.top);
				if (verticalDelta < 1) return true;
			}
		}

		// Stayed in same block and moved vertically → not at boundary
		return false;
	} finally {
		// Restore original selection
		try {
			domSel.setBaseAndExtent(origAnchor, origAnchorOffset, origFocus, origFocusOffset);
		} catch {
			// Selection restore may fail if DOM changed
		}
	}
}

/** Finds the closest ancestor element with `data-block-id`. */
function findBlockAncestor(container: HTMLElement, node: Node): HTMLElement | null {
	let current: Node | null = node;
	while (current && current !== container) {
		if (current instanceof HTMLElement && current.hasAttribute('data-block-id')) {
			return current;
		}
		current = current.parentNode;
	}
	return null;
}
