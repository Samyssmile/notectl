/**
 * Caret navigation utilities for layout-aware cursor movement.
 *
 * Provides `endOfTextblock()` for detecting visual block boundaries
 * and `navigateAcrossBlocks()` for cross-block cursor transitions.
 */

import {
	isInsideIsolating,
	isIsolatingBlock,
	isVoidBlock,
	sharesParent,
} from '../commands/Commands.js';
import { getBlockLength } from '../model/Document.js';
import { findNodePath } from '../model/NodeResolver.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	isCollapsed,
	isNodeSelection,
} from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { getSelection } from './SelectionSync.js';

export type CaretDirection = 'left' | 'right' | 'up' | 'down';

/**
 * Checks whether the cursor is at the visual edge of its text block.
 *
 * For horizontal directions (left/right), uses a pure offset check.
 * For vertical directions (up/down), tries `Selection.modify` probing
 * to detect visual line boundaries, falling back to offset heuristic.
 */
export function endOfTextblock(
	container: HTMLElement,
	state: EditorState,
	direction: CaretDirection,
): boolean {
	const sel = state.selection;

	if (isNodeSelection(sel)) return false;
	if (!isCollapsed(sel)) return false;

	const block = state.getBlock(sel.anchor.blockId);
	if (!block) return false;

	const offset: number = sel.anchor.offset;
	const blockLength: number = getBlockLength(block);

	// Horizontal: pure offset check
	if (direction === 'left') return offset === 0;
	if (direction === 'right') return offset === blockLength;

	// Vertical: quick offset check first
	if (direction === 'up' && offset === 0) return true;
	if (direction === 'down' && offset === blockLength) return true;

	// Vertical: try Selection.modify probing for multi-line blocks
	const domSel: globalThis.Selection | null = getSelection(container);
	if (!domSel || !domSel.modify) {
		// Fallback: offset heuristic (no Selection.modify in test environments)
		return direction === 'up' ? offset === 0 : offset === blockLength;
	}

	return probeVerticalBoundary(container, domSel, direction);
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
	const blockOrder: readonly BlockId[] = state.getBlockOrder();
	const sel = state.selection;
	if (isNodeSelection(sel)) return null;

	const currentIdx: number = blockOrder.indexOf(sel.anchor.blockId);
	if (currentIdx < 0) return null;

	const targetIdx: number =
		direction === 'left' || direction === 'up' ? currentIdx - 1 : currentIdx + 1;

	if (targetIdx < 0 || targetIdx >= blockOrder.length) return null;

	const targetId: BlockId | undefined = blockOrder[targetIdx];
	if (!targetId) return null;

	if (!canCrossBlockBoundary(state, sel.anchor.blockId, targetId)) return null;

	// Target is void → NodeSelection
	if (isVoidBlock(state, targetId)) {
		const path: BlockId[] = (findNodePath(state.doc, targetId) ?? []) as BlockId[];
		return state.transaction('input').setSelection(createNodeSelection(targetId, path)).build();
	}

	// Target is text → collapsed selection at start or end
	const targetBlock = state.getBlock(targetId);
	if (!targetBlock) return null;

	const targetOffset: number =
		direction === 'right' || direction === 'down' ? 0 : getBlockLength(targetBlock);

	return state
		.transaction('input')
		.setSelection(createCollapsedSelection(targetId, targetOffset))
		.build();
}

/**
 * Checks whether navigation between two blocks is allowed.
 * Prevents crossing isolating boundaries (e.g. table cells).
 */
function canCrossBlockBoundary(state: EditorState, fromId: BlockId, toId: BlockId): boolean {
	// A block that is itself isolating cannot be crossed into via arrow keys
	if (isIsolatingBlock(state, fromId) || isIsolatingBlock(state, toId)) return false;

	const fromInside: boolean = isInsideIsolating(state, fromId);
	const toInside: boolean = isInsideIsolating(state, toId);

	// One inside isolating, the other not → disallow
	if (fromInside !== toInside) return false;

	// Both inside isolating → must share the same parent
	if (fromInside && toInside) return sharesParent(state, fromId, toId);

	return true;
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
): boolean {
	const origAnchor: Node | null = domSel.anchorNode;
	const origAnchorOffset: number = domSel.anchorOffset;
	const origFocus: Node | null = domSel.focusNode;
	const origFocusOffset: number = domSel.focusOffset;

	// Cannot determine position → safe default: not at boundary (let browser handle)
	if (!origAnchor || !origFocus) return false;

	const origRect: DOMRect | null = getCaretRect(domSel);
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
			const newRect: DOMRect | null = getCaretRect(domSel);
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

/** Returns the bounding rect of the current caret position, or null. */
function getCaretRect(domSel: globalThis.Selection): DOMRect | null {
	if (domSel.rangeCount === 0) return null;
	const range: Range = domSel.getRangeAt(0);
	const rects: DOMRectList = range.getClientRects();
	if (rects.length > 0) return rects[0] ?? null;
	return range.getBoundingClientRect();
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
