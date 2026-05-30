/**
 * Range-deletion helpers for multi-block text selections, split out of
 * Commands.ts. Handles two cases: a selection whose blocks share one root
 * ancestor (leaf range) and a selection spanning different root ancestors
 * (cross-root range).
 */

import {
	createEmptyParagraph,
	generateBlockId,
	getBlockLength,
	isLeafBlock,
} from '../model/Document.js';
import { findNodePath } from '../model/NodeResolver.js';
import type { BlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { TransactionBuilder } from '../state/Transaction.js';

/** A normalized text-selection range (document-order from/to positions). */
export interface DeletionRange {
	readonly from: { readonly blockId: BlockId; readonly offset: number };
	readonly to: { readonly blockId: BlockId; readonly offset: number };
}

/** Returns the root-level ancestor index in `doc.children` for a given block. */
export function getRootBlockIndex(state: EditorState, blockId: BlockId): number {
	const path = findNodePath(state.doc, blockId);
	if (!path || path.length === 0) return -1;
	const rootId: string = path[0] as string;
	return state.doc.children.findIndex((c) => c.id === rootId);
}

/** Deletes a multi-block selection where all blocks share the same root ancestor. */
export function deleteLeafRange(
	state: EditorState,
	builder: TransactionBuilder,
	blockOrder: readonly BlockId[],
	range: DeletionRange,
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
export function deleteCrossRootRange(
	state: EditorState,
	builder: TransactionBuilder,
	range: DeletionRange,
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
