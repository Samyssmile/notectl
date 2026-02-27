/**
 * Shared helpers used across multiple command modules.
 *
 * - {@link getSiblings} — resolves a parent path to its child list
 * - {@link createEmptyParagraph} — builds an empty paragraph BlockNode
 * - {@link resolveInsertPoint} — normalizes a text selection to a single insert position
 */

import type { BlockNode, ChildNode } from '../model/Document.js';
import { createBlockNode, createTextNode } from '../model/Document.js';
import { isCollapsed, selectionRange } from '../model/Selection.js';
import type { Selection } from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import { nodeType } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';

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

/** Creates an empty paragraph block node with the given ID. */
export function createEmptyParagraph(id: BlockId): BlockNode {
	return createBlockNode(nodeType('paragraph'), [createTextNode('')], id);
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
