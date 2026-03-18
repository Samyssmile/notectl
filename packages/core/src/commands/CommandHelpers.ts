/**
 * Shared helpers used across multiple command modules.
 *
 * - {@link getSiblings} — resolves a parent path to its child list
 * - {@link resolveInsertPoint} — normalizes a text selection to a single insert position
 */

import type { BlockNode, ChildNode, Document } from '../model/Document.js';
import { getBlockLength, isBlockNode, isLeafBlock } from '../model/Document.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	isCollapsed,
	selectionRange,
} from '../model/Selection.js';
import type { EditorSelection, Selection } from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import { isVoidBlock } from '../state/NavigationQueries.js';

/** The resolved insert position within a single block. */
export interface InsertPoint {
	readonly blockId: BlockId;
	readonly offset: number;
}

/** Resolves the children of a parent path: doc root or a nested block. */
export function getSiblings(
	state: EditorState,
	parentPath: readonly BlockId[],
): readonly ChildNode[] {
	if (parentPath.length === 0) return state.doc.children;
	const parent: BlockNode | undefined = state.getBlock(
		parentPath[parentPath.length - 1] as BlockId,
	);
	return parent ? parent.children : [];
}

/**
 * Normalizes a text selection to a single insert point.
 *
 * - Collapsed selection → anchor position.
 * - Range selection → normalized `from` position (document-order start).
 */
export function resolveInsertPoint(sel: Selection, blockOrder: readonly BlockId[]): InsertPoint {
	if (isCollapsed(sel)) {
		return { blockId: sel.anchor.blockId, offset: sel.anchor.offset };
	}
	const range = selectionRange(sel, blockOrder);
	return { blockId: range.from.blockId, offset: range.from.offset };
}

/** Extracts the parent path from a full node path (all elements except the last). */
export function extractParentPath(path: readonly string[] | undefined): BlockId[] {
	return path && path.length > 1 ? (path.slice(0, -1) as BlockId[]) : [];
}

/** Finds the index of a block by ID within a sibling list. */
export function findSiblingIndex(siblings: readonly ChildNode[], targetId: BlockId): number {
	return siblings.findIndex((c) => isBlockNode(c) && c.id === targetId);
}

/** Finds the first leaf block ID in a subtree. */
export function findFirstLeafBlockId(node: BlockNode): BlockId {
	if (isLeafBlock(node)) return node.id;

	for (const child of node.children) {
		if (!isBlockNode(child)) continue;
		return findFirstLeafBlockId(child);
	}

	return node.id;
}

/** Finds the last leaf block ID in a subtree. */
export function findLastLeafBlockId(node: BlockNode): BlockId {
	if (isLeafBlock(node)) return node.id;

	for (let i = node.children.length - 1; i >= 0; i--) {
		const child = node.children[i];
		if (child && isBlockNode(child)) {
			return findLastLeafBlockId(child);
		}
	}

	return node.id;
}

/**
 * Resolves a valid editor selection at the start or end of a block subtree.
 * Void blocks become NodeSelections; text-capable blocks resolve to leaf cursors.
 */
export function createSelectionForBlockBoundary(
	state: EditorState,
	blockId: BlockId,
	boundary: 'start' | 'end',
): EditorSelection | null {
	const block = state.getBlock(blockId);
	if (!block) return null;

	if (isVoidBlock(state, blockId)) {
		const path = state.getNodePath(blockId);
		return path ? createNodeSelection(blockId, path) : null;
	}

	const leafId: BlockId =
		boundary === 'start' ? findFirstLeafBlockId(block) : findLastLeafBlockId(block);
	const leaf = state.getBlock(leafId);
	if (!leaf) return null;

	const offset = boundary === 'start' ? 0 : getBlockLength(leaf);
	return createCollapsedSelection(leafId, offset);
}

/** Returns the root-level block IDs in document order. */
export function getRootBlockIds(doc: Document): readonly BlockId[] {
	return doc.children.map((child) => child.id);
}
