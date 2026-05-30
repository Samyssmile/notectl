/**
 * Pure navigation query functions for block boundary and isolating checks.
 *
 * These utilities inspect the document structure and schema to answer
 * questions about block traversal — whether a block is void, isolating,
 * or whether navigation between two blocks is allowed.
 */

import type { BlockId } from '../model/TypeBrands.js';
import type { EditorState } from './EditorState.js';

/** Returns true if the block with the given ID is a void block (e.g. image, HR). */
export function isVoidBlock(state: EditorState, bid: BlockId): boolean {
	const block = state.getBlock(bid);
	if (!block) return false;
	const getNodeSpec = state.schema.getNodeSpec;
	if (!getNodeSpec) return false;
	return getNodeSpec(block.type)?.isVoid === true;
}

/** Checks whether two blocks share the same parent in the document tree. */
export function sharesParent(state: EditorState, blockIdA: BlockId, blockIdB: BlockId): boolean {
	const pathA = state.getNodePath(blockIdA);
	const pathB = state.getNodePath(blockIdB);
	if (!pathA || !pathB) return false;
	if (pathA.length !== pathB.length) return false;
	// Compare parent paths (all but last element)
	for (let i = 0; i < pathA.length - 1; i++) {
		if (pathA[i] !== pathB[i]) return false;
	}
	return true;
}

/** Checks whether a block is inside an isolating node (e.g. table_cell). */
export function isInsideIsolating(state: EditorState, blockId: BlockId): boolean {
	const getNodeSpec = state.schema.getNodeSpec;
	if (!getNodeSpec) return false;
	const path = state.getNodePath(blockId);
	if (!path || path.length <= 1) return false;

	// Check ancestors (not the block itself)
	for (let i = 0; i < path.length - 1; i++) {
		const ancestorId = path[i];
		if (!ancestorId) continue;
		const ancestor = state.getBlock(ancestorId);
		if (!ancestor) continue;
		const spec = getNodeSpec(ancestor.type);
		if (spec?.isolating) return true;
	}
	return false;
}

/** Returns true if the block itself has the isolating property. */
export function isIsolatingBlock(state: EditorState, blockId: BlockId): boolean {
	const getNodeSpec = state.schema.getNodeSpec;
	if (!getNodeSpec) return false;
	const block = state.getBlock(blockId);
	if (!block) return false;
	return getNodeSpec(block.type)?.isolating === true;
}

/** The block reached by crossing one block boundary, plus whether it is void. */
export interface AdjacentBlock {
	readonly targetId: BlockId;
	readonly isVoid: boolean;
}

/**
 * Resolves the block immediately before/after `fromBlockId` in document order
 * when the boundary may be crossed. Returns `null` at a document boundary or
 * when an isolating boundary blocks the crossing.
 */
export function resolveAdjacentBlock(
	state: EditorState,
	fromBlockId: BlockId,
	forward: boolean,
): AdjacentBlock | null {
	const blockOrder: readonly BlockId[] = state.getBlockOrder();
	const idx: number = blockOrder.indexOf(fromBlockId);
	if (idx < 0) return null;

	const targetIdx: number = forward ? idx + 1 : idx - 1;
	if (targetIdx < 0 || targetIdx >= blockOrder.length) return null;

	const targetId: BlockId | undefined = blockOrder[targetIdx];
	if (!targetId) return null;
	if (!canCrossBlockBoundary(state, fromBlockId, targetId)) return null;

	return { targetId, isVoid: isVoidBlock(state, targetId) };
}

/**
 * Checks whether navigation between two blocks is allowed.
 * Prevents crossing isolating boundaries (e.g. table cells).
 */
export function canCrossBlockBoundary(state: EditorState, fromId: BlockId, toId: BlockId): boolean {
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
