/**
 * Range-deletion helpers for multi-block text selections, split out of
 * Commands.ts. Handles two cases: a selection whose blocks share one root
 * ancestor (leaf range) and a selection spanning different root ancestors
 * (cross-root range).
 */

import type { BlockNode } from '../model/Document.js';
import {
	createEmptyParagraph,
	generateBlockId,
	getBlockChildren,
	getBlockLength,
	isLeafBlock,
} from '../model/Document.js';
import { findNodePath } from '../model/NodeResolver.js';
import type { BlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { TransactionBuilder } from '../state/Transaction.js';

/**
 * Root container types whose children are free-flowing blocks and may be
 * removed individually when trimming a partially-selected root. Structured
 * containers (a `table`, whose rows must keep equal cell counts) are excluded:
 * trimming their children would leave a schema-invalid shape, so a
 * partially-selected one is removed wholesale instead — valid, if blunt, and
 * the behavior these containers already had before trimming existed.
 */
const FLAT_BLOCK_CONTAINERS: ReadonlySet<string> = new Set(['blockquote', 'list_item']);

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
 *
 * The selected span is deleted while every unselected leaf survives. A
 * composite/container root (a multi-block `list_item`, a `blockquote`, a
 * `table`) whose boundary sits *inside* it is trimmed, not wiped: the from-root
 * keeps everything before `range.from`, the to-root keeps everything after
 * `range.to`. A container is removed wholesale only when the boundary lands at
 * its very edge (offset 0 of its first leaf, or the end of its last leaf), so
 * the whole container is genuinely inside the selection. Root blocks strictly
 * between the endpoints are always removed.
 *
 * Returns a replacement cursor block ID when the from-root was removed wholesale
 * (its cursor block went with it); undefined otherwise, since the from boundary
 * leaf then survives and hosts the caret.
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

	const toLeaf = state.getBlock(range.to.blockId);
	if (!toLeaf) return undefined;

	const fromIsLeaf: boolean = isLeafBlock(fromRoot);
	const toIsLeaf: boolean = isLeafBlock(toRoot);

	// A composite root is removed wholesale (rather than trimmed) when it is not
	// a flat block container, or when the boundary sits at its very edge and so
	// covers the whole container: the from-root's edge is offset 0 of its first
	// leaf, the to-root's is the end of its last leaf.
	const fromAtStart: boolean =
		range.from.offset === 0 && firstLeafId(fromRoot) === range.from.blockId;
	const toAtEnd: boolean =
		range.to.offset === getBlockLength(toLeaf) && lastLeafId(toRoot) === range.to.blockId;
	const fromWholesale: boolean =
		!fromIsLeaf && (!FLAT_BLOCK_CONTAINERS.has(fromRoot.type) || fromAtStart);
	const toWholesale: boolean = !toIsLeaf && (!FLAT_BLOCK_CONTAINERS.has(toRoot.type) || toAtEnd);

	// --- from side: keep everything before range.from within the from-root ---
	if (fromIsLeaf) {
		const fromLen: number = getBlockLength(fromRoot);
		if (range.from.offset < fromLen) {
			builder.deleteTextAt(range.from.blockId, range.from.offset, fromLen);
		}
	} else if (!fromWholesale) {
		trimContainerTail(
			builder,
			[fromRoot.id],
			fromRoot,
			findNodePath(state.doc, range.from.blockId) ?? [],
			range.from.blockId,
			range.from.offset,
		);
	}

	// --- to side: keep everything after range.to within the to-root ---
	if (toIsLeaf) {
		if (range.to.offset > 0) builder.deleteTextAt(range.to.blockId, 0, range.to.offset);
	} else if (!toWholesale) {
		trimContainerHead(
			builder,
			[toRoot.id],
			toRoot,
			findNodePath(state.doc, range.to.blockId) ?? [],
			range.to.blockId,
			range.to.offset,
		);
	}

	// --- root-level removals: middle roots always, endpoints only when wholesale ---
	// A wholesale-removed from-root takes its cursor block with it, so a landing
	// paragraph is inserted to host the caret and any follow-up insert.
	let landingId: BlockId | undefined;
	let shift = 0;
	if (fromWholesale) {
		landingId = generateBlockId();
		builder.insertNode([], fromRootIdx, createEmptyParagraph(landingId));
		shift = 1;
	}

	const removeIdxs: number[] = [];
	if (fromWholesale) removeIdxs.push(fromRootIdx);
	for (let i = fromRootIdx + 1; i < toRootIdx; i++) removeIdxs.push(i);
	if (toWholesale) removeIdxs.push(toRootIdx);
	// Descending so each positional removal stays valid against the evolving doc.
	for (let k = removeIdxs.length - 1; k >= 0; k--) {
		builder.removeNode([], (removeIdxs[k] as number) + shift);
	}

	// Join the boundary only when both roots are leaves: their inline content
	// merges into one block (the "outta" behavior). Merging across a composite
	// boundary is deliberately skipped — trimming already preserved every
	// unselected leaf, and there is no single valid block to merge into.
	if (fromIsLeaf && toIsLeaf) {
		builder.mergeBlocksAt(range.from.blockId, range.to.blockId);
	}

	return landingId;
}

/** The id of a block's first leaf descendant (itself when already a leaf). */
function firstLeafId(block: BlockNode): BlockId {
	if (isLeafBlock(block)) return block.id;
	const first: BlockNode | undefined = getBlockChildren(block)[0];
	return first ? firstLeafId(first) : block.id;
}

/** The id of a block's last leaf descendant (itself when already a leaf). */
function lastLeafId(block: BlockNode): BlockId {
	if (isLeafBlock(block)) return block.id;
	const children: readonly BlockNode[] = getBlockChildren(block);
	const last: BlockNode | undefined = children[children.length - 1];
	return last ? lastLeafId(last) : block.id;
}

/**
 * Trims a container to keep only content up to `(leafId, leafOffset)`, removing
 * every child after the boundary at each level and the boundary leaf's tail
 * text. `containerPath` is the path to (and including) `container`; `leafPath`
 * is the boundary leaf's full node path, used to descend to the boundary child.
 */
function trimContainerTail(
	builder: TransactionBuilder,
	containerPath: readonly BlockId[],
	container: BlockNode,
	leafPath: readonly string[],
	leafId: BlockId,
	leafOffset: number,
): void {
	const children: readonly BlockNode[] = getBlockChildren(container);
	const pos: number = leafPath.indexOf(container.id);
	const targetChildId: string | undefined = pos >= 0 ? leafPath[pos + 1] : undefined;
	const boundaryIdx: number = children.findIndex((c) => c.id === targetChildId);
	if (boundaryIdx < 0) return;

	for (let i = children.length - 1; i > boundaryIdx; i--) {
		builder.removeNode(containerPath, i);
	}

	const boundaryChild: BlockNode = children[boundaryIdx] as BlockNode;
	if (boundaryChild.id === leafId) {
		const len: number = getBlockLength(boundaryChild);
		if (leafOffset < len) builder.deleteTextAt(leafId, leafOffset, len);
		return;
	}
	trimContainerTail(
		builder,
		[...containerPath, boundaryChild.id],
		boundaryChild,
		leafPath,
		leafId,
		leafOffset,
	);
}

/**
 * Trims a container to keep only content from `(leafId, leafOffset)` onward,
 * removing every child before the boundary at each level and the boundary
 * leaf's head text. Mirrors {@link trimContainerTail}.
 */
function trimContainerHead(
	builder: TransactionBuilder,
	containerPath: readonly BlockId[],
	container: BlockNode,
	leafPath: readonly string[],
	leafId: BlockId,
	leafOffset: number,
): void {
	const children: readonly BlockNode[] = getBlockChildren(container);
	const pos: number = leafPath.indexOf(container.id);
	const targetChildId: string | undefined = pos >= 0 ? leafPath[pos + 1] : undefined;
	const boundaryIdx: number = children.findIndex((c) => c.id === targetChildId);
	if (boundaryIdx < 0) return;

	// Descending so each removal stays valid; the boundary keeps its identity.
	for (let i = boundaryIdx - 1; i >= 0; i--) {
		builder.removeNode(containerPath, i);
	}

	const boundaryChild: BlockNode = children[boundaryIdx] as BlockNode;
	if (boundaryChild.id === leafId) {
		if (leafOffset > 0) builder.deleteTextAt(leafId, 0, leafOffset);
		return;
	}
	trimContainerHead(
		builder,
		[...containerPath, boundaryChild.id],
		boundaryChild,
		leafPath,
		leafId,
		leafOffset,
	);
}
