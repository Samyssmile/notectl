/**
 * Range-deletion helpers for multi-block text selections, split out of
 * Commands.ts. Handles two cases: a selection whose blocks share one root
 * ancestor (leaf range) and a selection spanning different root ancestors
 * (cross-root range).
 *
 * A void block (image, horizontal rule) at either end of a range is wholly
 * selected — it has no partial content and cannot host the caret — so it is
 * removed outright and never merged into (#224).
 *
 * Containers keep their shape: a free-flowing container (blockquote, list
 * item, table cell) loses the children a range covers, while a fixed-shape one
 * (a table, a table row) keeps every child and only has its content cleared.
 */

import { canContain } from '../model/ContentModel.js';
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
import { isVoidBlock, sharesParent } from '../state/NavigationQueries.js';
import type { TransactionBuilder } from '../state/Transaction.js';
import { isEmptyParagraph } from './BlockInsertion.js';
import { resolveSiblingContext } from './CommandHelpers.js';

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

/**
 * Deletes a multi-block selection where all blocks share the same root ancestor.
 *
 * Container boundaries survive: only consecutive leaves with the same immediate
 * parent merge into their group's first text leaf. Selected void blocks are
 * removed in place before any merges. Returns the first text leaf when it is
 * not the from-block (the caret then lands at offset 0), or the landing paragraph
 * swapped in when the range is void-only; undefined when the from-block survives.
 */
export function deleteLeafRange(
	state: EditorState,
	builder: TransactionBuilder,
	blockOrder: readonly BlockId[],
	range: DeletionRange,
	fromIdx: number,
	toIdx: number,
): BlockId | undefined {
	const rangeIds: readonly BlockId[] = blockOrder.slice(fromIdx, toIdx + 1);
	const survivorIdx: number = rangeIds.findIndex((id) => !isVoidBlock(state, id));
	if (survivorIdx < 0) return replaceVoidOnlyRange(state, builder, rangeIds);
	const survivorId: BlockId = rangeIds[survivorIdx] as BlockId;

	// Group the original leaf order, including voids: returning to a parent
	// after a nested container starts a new group, even if that container's
	// only leaf is a selected void that will be replaced below.
	const groups: BlockId[][] = [];
	let previousId: BlockId | undefined;
	let group: BlockId[] = [];
	for (const id of rangeIds) {
		if (!previousId || !sharesParent(state, previousId, id)) {
			group = [];
			groups.push(group);
		}
		if (!isVoidBlock(state, id)) group.push(id);
		previousId = id;
		const block: BlockNode | undefined = state.getBlock(id);
		if (block) deleteSelectedText(builder, block, range);
	}
	// Positional removals still refer to the original sibling indexes. All voids
	// must be removed (last first) before merging shifts any of those indexes.
	removeVoidBlocks(
		state,
		builder,
		rangeIds.filter((id) => isVoidBlock(state, id)),
	);
	for (const [targetId, ...sourceIds] of groups) {
		if (!targetId) continue;
		for (const sourceId of sourceIds) builder.mergeBlocksAt(targetId, sourceId);
	}

	return survivorIdx === 0 ? undefined : survivorId;
}

/** Deletes the part of `block`'s inline content that lies inside `range`. */
function deleteSelectedText(
	builder: TransactionBuilder,
	block: BlockNode,
	range: DeletionRange,
): void {
	const length: number = getBlockLength(block);
	const from: number = block.id === range.from.blockId ? range.from.offset : 0;
	const to: number = block.id === range.to.blockId ? range.to.offset : length;
	if (from < to) builder.deleteTextAt(block.id, from, to);
}

/**
 * Removes a range made only of void blocks and returns the empty paragraph
 * that takes their place and hosts the caret.
 */
function replaceVoidOnlyRange(
	state: EditorState,
	builder: TransactionBuilder,
	ids: readonly BlockId[],
): BlockId | undefined {
	const first: BlockId | undefined = ids[0];
	if (!first) return undefined;
	const { parentPath, index } = resolveSiblingContext(state, first);
	if (index < 0) return undefined;

	const swappedIn: BlockId | undefined = removeVoidBlocks(state, builder, ids);
	if (swappedIn) return swappedIn;

	// Earlier siblings are untouched, so the first block's slot is still `index`.
	const landingId: BlockId = generateBlockId();
	builder.insertNode(parentPath, index, createEmptyParagraph(landingId));
	return landingId;
}

/**
 * Removes void blocks in place, last first so positional indexes stay valid.
 * A parent about to lose its last child keeps an empty paragraph instead, so
 * containers such as table cells never end up empty. Returns the paragraph
 * swapped in for the first block, if one was needed.
 */
function removeVoidBlocks(
	state: EditorState,
	builder: TransactionBuilder,
	ids: readonly BlockId[],
): BlockId | undefined {
	const removedPerParent = new Map<string, number>();
	let swappedInForFirst: BlockId | undefined;

	for (let i = ids.length - 1; i >= 0; i--) {
		const { parentPath, siblings, index } = resolveSiblingContext(state, ids[i] as BlockId);
		if (index < 0) continue;
		const parentKey: string = parentPath.join('/');
		const removedBefore: number = removedPerParent.get(parentKey) ?? 0;
		removedPerParent.set(parentKey, removedBefore + 1);

		if (siblings.length - removedBefore > 1) {
			builder.removeNode(parentPath, index);
			continue;
		}
		// Last remaining child (so at index 0): swap in an empty paragraph.
		const replacementId: BlockId = generateBlockId();
		builder.insertNode(parentPath, 0, createEmptyParagraph(replacementId));
		builder.removeNode(parentPath, 1);
		if (i === 0) swappedInForFirst = replacementId;
	}

	return swappedInForFirst;
}

/** A leaf block that can hold a caret: any leaf except a void one. */
function isTextLeaf(state: EditorState, block: BlockNode): boolean {
	return isLeafBlock(block) && !isVoidBlock(state, block.id);
}

/**
 * Deletes a selection spanning different root-level ancestors.
 *
 * The selected span is deleted while every unselected leaf survives. A
 * composite/container root (a multi-block `list_item`, a `blockquote`, a
 * `table`) whose boundary sits *inside* it is trimmed, not wiped: the from-root
 * keeps everything before `range.from`, the to-root keeps everything after
 * `range.to`. Trimming keeps the shape of fixed-shape containers (see
 * {@link hasFlowContent}): the covered cells of a table are cleared, never
 * removed, so its rows keep equal cell counts. A container is removed wholesale
 * only when the boundary lands at its very edge (offset 0 of its first leaf, or
 * the end of its last leaf), so the whole container is genuinely inside the
 * selection. Root blocks strictly between the endpoints are always removed, and
 * a void root at either end is always removed wholesale.
 *
 * Returns the block hosting the caret when the from-root was removed wholesale
 * (its cursor block went with it): the surviving to-leaf, or a landing paragraph
 * inserted in the from-root's slot. Undefined otherwise, since the from boundary
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

	const fromIsLeaf: boolean = isTextLeaf(state, fromRoot);
	const toIsLeaf: boolean = isTextLeaf(state, toRoot);

	// A non-text root is removed wholesale (rather than trimmed) when it is void,
	// or when the boundary sits at its very edge and so covers the whole
	// container: the from-root's edge is offset 0 of its first leaf, the
	// to-root's is the end of its last leaf.
	const fromAtStart: boolean =
		range.from.offset === 0 && firstLeafId(fromRoot) === range.from.blockId;
	const toAtEnd: boolean =
		range.to.offset === getBlockLength(toLeaf) && lastLeafId(toRoot) === range.to.blockId;
	const fromWholesale: boolean = !fromIsLeaf && (isLeafBlock(fromRoot) || fromAtStart);
	const toWholesale: boolean = !toIsLeaf && (isLeafBlock(toRoot) || toAtEnd);

	// --- from side: keep everything before range.from within the from-root ---
	if (fromIsLeaf) {
		deleteSelectedText(builder, fromRoot, range);
	} else if (!fromWholesale) {
		trimContainerTail(
			state,
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
		deleteSelectedText(builder, toRoot, range);
	} else if (!toWholesale) {
		trimContainerHead(
			state,
			builder,
			[toRoot.id],
			toRoot,
			findNodePath(state.doc, range.to.blockId) ?? [],
			range.to.blockId,
			range.to.offset,
		);
	}

	// --- root-level removals: middle roots always, endpoints only when wholesale ---
	// A wholesale-removed from-root takes its cursor block with it. A surviving
	// to-leaf slides into the from-root's slot and hosts the caret at its start;
	// otherwise a landing paragraph is inserted there for the caret and any
	// follow-up insert.
	let landingId: BlockId | undefined;
	let shift = 0;
	if (fromWholesale && toIsLeaf) {
		landingId = range.to.blockId;
	} else if (fromWholesale) {
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
 * Whether a container's children are free-flowing blocks that a deletion may
 * remove one by one. That holds when its content rule admits a paragraph
 * (blockquote, list item, table cell), since an empty paragraph can always
 * stand in for removed content. Any other container has a fixed shape (a
 * table's rows, a row's cells, which must keep equal counts), so a deletion
 * clears its covered children instead. Without a content rule the shape is
 * unknown, and keeping it is the safe choice.
 */
function hasFlowContent(state: EditorState, container: BlockNode): boolean {
	if (!state.schema.getNodeSpec?.(container.type)?.content) return false;
	return canContain(state.schema, container.type, 'paragraph');
}

/**
 * Deletes the children of `container` in `[from, to)`, last first so positional
 * removals stay valid: a flow container removes them, a fixed-shape container
 * clears them in place (see {@link hasFlowContent}).
 */
function deleteCoveredChildren(
	state: EditorState,
	builder: TransactionBuilder,
	containerPath: readonly BlockId[],
	container: BlockNode,
	from: number,
	to: number,
): void {
	const children: readonly BlockNode[] = getBlockChildren(container);
	const removable: boolean = hasFlowContent(state, container);
	for (let i = to - 1; i >= from; i--) {
		const child: BlockNode | undefined = children[i];
		if (!child) continue;
		if (removable) builder.removeNode(containerPath, i);
		else clearBlockContent(state, builder, [...containerPath, child.id], child);
	}
}

/**
 * Empties a fully covered block while keeping the block itself: a flow
 * container ends up holding one empty paragraph (as a cut table cell does), a
 * fixed-shape container clears each child, and a text leaf loses its text. A
 * void leaf has no text (length 0), so it stays as it is.
 */
function clearBlockContent(
	state: EditorState,
	builder: TransactionBuilder,
	path: readonly BlockId[],
	block: BlockNode,
): void {
	if (isLeafBlock(block)) {
		const length: number = getBlockLength(block);
		if (length > 0) builder.deleteTextAt(block.id, 0, length);
		return;
	}

	const children: readonly BlockNode[] = getBlockChildren(block);
	if (!hasFlowContent(state, block)) {
		deleteCoveredChildren(state, builder, path, block, 0, children.length);
		return;
	}
	const only: BlockNode | undefined = children.length === 1 ? children[0] : undefined;
	if (only && isEmptyParagraph(only)) return;
	for (let i = children.length - 1; i >= 0; i--) builder.removeNode(path, i);
	builder.insertNode(path, 0, createEmptyParagraph(generateBlockId()));
}

/** Index of the child of `container` on the path to the boundary leaf, or -1. */
function boundaryChildIndex(container: BlockNode, leafPath: readonly string[]): number {
	const pos: number = leafPath.indexOf(container.id);
	const targetChildId: string | undefined = pos >= 0 ? leafPath[pos + 1] : undefined;
	return getBlockChildren(container).findIndex((c) => c.id === targetChildId);
}

/**
 * Trims a container to keep only content up to `(leafId, leafOffset)`, deleting
 * every child after the boundary at each level (see {@link deleteCoveredChildren})
 * and the boundary leaf's tail text. `containerPath` is the path to (and
 * including) `container`; `leafPath` is the boundary leaf's full node path, used
 * to descend to the boundary child.
 */
function trimContainerTail(
	state: EditorState,
	builder: TransactionBuilder,
	containerPath: readonly BlockId[],
	container: BlockNode,
	leafPath: readonly string[],
	leafId: BlockId,
	leafOffset: number,
): void {
	const children: readonly BlockNode[] = getBlockChildren(container);
	const boundaryIdx: number = boundaryChildIndex(container, leafPath);
	if (boundaryIdx < 0) return;

	deleteCoveredChildren(state, builder, containerPath, container, boundaryIdx + 1, children.length);

	const boundaryChild: BlockNode = children[boundaryIdx] as BlockNode;
	if (boundaryChild.id === leafId) {
		const len: number = getBlockLength(boundaryChild);
		if (leafOffset < len) builder.deleteTextAt(leafId, leafOffset, len);
		return;
	}
	trimContainerTail(
		state,
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
 * deleting every child before the boundary at each level and the boundary
 * leaf's head text. Mirrors {@link trimContainerTail}.
 */
function trimContainerHead(
	state: EditorState,
	builder: TransactionBuilder,
	containerPath: readonly BlockId[],
	container: BlockNode,
	leafPath: readonly string[],
	leafId: BlockId,
	leafOffset: number,
): void {
	const children: readonly BlockNode[] = getBlockChildren(container);
	const boundaryIdx: number = boundaryChildIndex(container, leafPath);
	if (boundaryIdx < 0) return;

	// The boundary keeps its identity, so the descent below still finds it.
	deleteCoveredChildren(state, builder, containerPath, container, 0, boundaryIdx);

	const boundaryChild: BlockNode = children[boundaryIdx] as BlockNode;
	if (boundaryChild.id === leafId) {
		if (leafOffset > 0) builder.deleteTextAt(leafId, 0, leafOffset);
		return;
	}
	trimContainerHead(
		state,
		builder,
		[...containerPath, boundaryChild.id],
		boundaryChild,
		leafPath,
		leafId,
		leafOffset,
	);
}
