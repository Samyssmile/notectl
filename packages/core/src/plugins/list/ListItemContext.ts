/**
 * Shared resolution helpers for container list items (#194).
 *
 * With `list_item` a hybrid leaf/container block, the caret may sit inside a
 * block child of an item. Commands and keyboard handlers resolve the owning
 * item through the ancestor chain and address structural edits through the
 * item's location (parent path + child index), mirroring the blockquote
 * container conventions.
 */

import type { BlockNode } from '../../model/Document.js';
import { getBlockChildren } from '../../model/Document.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { TransactionBuilder } from '../../state/TransactionBuilder.js';

/** A list item's structural address: its parent path and child index. */
export interface ListItemLocation {
	readonly item: BlockNode;
	/** Path from the document root to the item's parent ([] = root). */
	readonly parentPath: readonly BlockId[];
	/** The item's index among its parent's block children. */
	readonly index: number;
}

/**
 * Resolves the list item owning a block: the block itself when it is a
 * `list_item`, otherwise its nearest `list_item` ancestor.
 */
export function resolveListItem(state: EditorState, id: BlockId): BlockNode | undefined {
	const block: BlockNode | undefined = state.getBlock(id);
	if (block?.type === 'list_item') return block;
	const path: readonly BlockId[] | undefined = state.getNodePath(id);
	if (!path) return undefined;
	for (let i = path.length - 2; i >= 0; i--) {
		const ancestorId: BlockId | undefined = path[i];
		const ancestor: BlockNode | undefined = ancestorId ? state.getBlock(ancestorId) : undefined;
		if (ancestor?.type === 'list_item') return ancestor;
	}
	return undefined;
}

/** Locates a list item's structural address, or undefined if it is not found. */
export function locateListItem(state: EditorState, itemId: BlockId): ListItemLocation | undefined {
	const item: BlockNode | undefined = state.getBlock(itemId);
	if (!item || item.type !== 'list_item') return undefined;
	const path: readonly BlockId[] | undefined = state.getNodePath(itemId);
	if (!path) return undefined;

	const parentPath: readonly BlockId[] = path.slice(0, -1);
	const parentId: BlockId | undefined = parentPath[parentPath.length - 1];
	const siblings: readonly BlockNode[] = parentId
		? getBlockChildren(state.getBlock(parentId) as BlockNode)
		: state.doc.children;
	const index: number = siblings.findIndex((sibling) => sibling.id === itemId);
	if (index < 0) return undefined;
	return { item, parentPath, index };
}

/**
 * Replaces a container list item with its block children in place. The
 * children keep their IDs, so a selection inside them survives the lift.
 * Leaf items must not be dissolved (their inline content is not a block);
 * convert those via `setBlockType` instead.
 */
export function dissolveListItem(builder: TransactionBuilder, location: ListItemLocation): void {
	builder.removeNode(location.parentPath, location.index);
	const children: readonly BlockNode[] = getBlockChildren(location.item);
	children.forEach((child, offset) => {
		builder.insertNode(location.parentPath, location.index + offset, child);
	});
}
