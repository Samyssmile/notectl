import { getBlockLength } from '../model/Document.js';
import { isGapCursor } from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import { getTextDirection } from '../platform/Platform.js';
import type { EditorState } from '../state/EditorState.js';
import { isVoidBlock } from '../state/NavigationQueries.js';
import { moveTx, nodeSelTx } from '../state/SelectionTransactions.js';
import type { Transaction } from '../state/Transaction.js';

export type GapCursorDirection = 'left' | 'right' | 'up' | 'down';

/**
 * Navigates from a GapCursor position.
 *
 * - Arrow toward the adjacent void block -> NodeSelection of that block.
 * - Arrow away from the void block -> find next block: void -> NodeSelection,
 *   text -> TextSelection, document boundary -> no-op.
 */
export function navigateFromGapCursor(
	state: EditorState,
	direction: GapCursorDirection,
	container?: HTMLElement,
): Transaction | null {
	const sel = state.selection;
	if (!isGapCursor(sel)) return null;

	const blockOrder: readonly BlockId[] = state.getBlockOrder();
	const blockIdx: number = blockOrder.indexOf(sel.blockId);
	if (blockIdx < 0) return null;

	// Resolve effective horizontal direction for RTL blocks
	const effectiveDir: GapCursorDirection = resolveEffectiveDirection(
		direction,
		sel.blockId,
		container,
	);

	const towardVoid: boolean =
		(sel.side === 'before' && (effectiveDir === 'right' || effectiveDir === 'down')) ||
		(sel.side === 'after' && (effectiveDir === 'left' || effectiveDir === 'up'));

	if (towardVoid) return nodeSelTx(state, sel.blockId);

	// Moving away from the void block - find the neighbor in the other direction
	const awayIdx: number = sel.side === 'before' ? blockIdx - 1 : blockIdx + 1;
	if (awayIdx < 0 || awayIdx >= blockOrder.length) return null;

	const targetId: BlockId | undefined = blockOrder[awayIdx];
	if (!targetId) return null;

	if (isVoidBlock(state, targetId)) return nodeSelTx(state, targetId);

	// Text block: place cursor at start or end
	const targetBlock = state.getBlock(targetId);
	if (!targetBlock) return null;

	const targetOffset: number =
		effectiveDir === 'left' || effectiveDir === 'up' ? getBlockLength(targetBlock) : 0;
	return moveTx(state, targetId, targetOffset);
}

/**
 * Resolves the effective navigation direction by flipping left/right
 * when the block is RTL. Vertical directions are unaffected.
 */
function resolveEffectiveDirection(
	direction: GapCursorDirection,
	blockId: BlockId,
	container?: HTMLElement,
): GapCursorDirection {
	if (!container) return direction;
	if (direction !== 'left' && direction !== 'right') return direction;

	const blockEl: Element | null = container.querySelector(`[data-block-id="${blockId}"]`);
	if (!(blockEl instanceof HTMLElement)) return direction;

	const isRtl: boolean = getTextDirection(blockEl) === 'rtl';
	if (!isRtl) return direction;

	return direction === 'left' ? 'right' : 'left';
}
