/**
 * Image plugin commands: insert, remove, and attribute updates.
 * Supports both root-level and nested contexts (e.g. images inside table cells).
 */

import type { BlockAttrs, BlockNode } from '../../model/Document.js';
import { createBlockNode, getBlockChildren, isBlockNode } from '../../model/Document.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	isNodeSelection,
} from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { PluginContext } from '../Plugin.js';
import type { ImageAttrs } from './ImageUpload.js';

/**
 * Inserts an image block. When the cursor is inside a table cell,
 * the image is inserted as a child of the cell. Otherwise it is
 * inserted after the current block at document root.
 */
export function insertImage(
	context: PluginContext,
	attrs: Partial<ImageAttrs> & { readonly src: string },
): boolean {
	const state = context.getState();
	const sel = state.selection;

	const imageAttrs: BlockAttrs = {
		src: attrs.src,
		alt: attrs.alt ?? '',
		align: attrs.align ?? 'center',
		...(attrs.width !== undefined ? { width: attrs.width } : {}),
		...(attrs.height !== undefined ? { height: attrs.height } : {}),
	};

	const anchorBlockId: BlockId = isNodeSelection(sel) ? sel.nodeId : sel.anchor.blockId;

	// Check if we're inside a table cell
	const cellId: BlockId | undefined = findTableCellAncestor(state, anchorBlockId);
	if (cellId) {
		return insertImageIntoCell(state, context, cellId, imageAttrs);
	}

	return insertImageAtRoot(state, context, anchorBlockId, imageAttrs);
}

/** Finds a table_cell ancestor for the given block (or the block itself). */
function findTableCellAncestor(state: EditorState, bid: BlockId): BlockId | undefined {
	const block: BlockNode | undefined = state.getBlock(bid);
	if (block?.type === 'table_cell') return bid;

	const path: BlockId[] | undefined = state.getNodePath(bid);
	if (!path) return undefined;

	for (const id of path) {
		const node: BlockNode | undefined = state.getBlock(id);
		if (node?.type === 'table_cell') return id;
	}
	return undefined;
}

/** Inserts an image at document root after the anchor block. */
function insertImageAtRoot(
	state: EditorState,
	context: PluginContext,
	anchorBlockId: BlockId,
	imageAttrs: BlockAttrs,
): boolean {
	const blockIndex: number = state.doc.children.findIndex((b) => b.id === anchorBlockId);
	if (blockIndex === -1) return false;

	const imageBlock: BlockNode = createBlockNode(nodeType('image'), [], undefined, imageAttrs);
	const newParagraph: BlockNode = createBlockNode(nodeType('paragraph'));

	const tr = state
		.transaction('command')
		.insertNode([], blockIndex + 1, imageBlock)
		.insertNode([], blockIndex + 2, newParagraph)
		.setSelection(createNodeSelection(imageBlock.id, []))
		.build();

	context.dispatch(tr);
	return true;
}

/** Inserts an image as a child of a table cell. */
function insertImageIntoCell(
	state: EditorState,
	context: PluginContext,
	cellId: BlockId,
	imageAttrs: BlockAttrs,
): boolean {
	const cellPath: BlockId[] | undefined = state.getNodePath(cellId);
	if (!cellPath) return false;

	const imageBlock: BlockNode = createBlockNode(nodeType('image'), [], undefined, imageAttrs);

	// Remove existing block children first (if any)
	const cell: BlockNode | undefined = state.getBlock(cellId);
	if (!cell) return false;

	const builder = state.transaction('command');
	const blockChildren: readonly BlockNode[] = getBlockChildren(cell);
	for (let i = blockChildren.length - 1; i >= 0; i--) {
		// Find the raw index in children array
		const rawIndex: number = cell.children.findIndex(
			(c) => isBlockNode(c) && c.id === blockChildren[i]?.id,
		);
		if (rawIndex !== -1) {
			builder.removeNode(cellPath, rawIndex);
		}
	}

	// Insert image at index 0 (before any text nodes)
	builder.insertNode(cellPath, 0, imageBlock);
	builder.setSelection(createNodeSelection(imageBlock.id, [...cellPath, imageBlock.id]));

	context.dispatch(builder.build());
	return true;
}

/** Removes the currently selected image block (works for nested images too). */
export function removeImage(context: PluginContext): boolean {
	const state = context.getState();
	const sel = state.selection;
	if (!isNodeSelection(sel)) return false;

	const block: BlockNode | undefined = state.getBlock(sel.nodeId);
	if (!block || block.type !== 'image') return false;

	const nodePath: BlockId[] | undefined = state.getNodePath(sel.nodeId);
	if (!nodePath || nodePath.length === 0) return false;

	// parentPath = all IDs except the last (the image itself)
	const parentPath: BlockId[] = nodePath.slice(0, -1);

	// Find the index of the image in its parent's children
	let parent: BlockNode | { readonly children: readonly BlockNode[] } | undefined;
	if (parentPath.length === 0) {
		parent = state.doc;
	} else {
		const parentId: BlockId | undefined = parentPath[parentPath.length - 1];
		parent = parentId ? state.getBlock(parentId) : undefined;
	}
	if (!parent) return false;

	const imageIndex: number = parent.children.findIndex(
		(c) => isBlockNode(c) && c.id === sel.nodeId,
	);
	if (imageIndex === -1) return false;

	// Determine where to place the cursor after removal
	const selectionTarget: BlockId | undefined = findSelectionTargetAfterRemoval(
		state,
		parentPath,
		sel.nodeId,
	);
	if (!selectionTarget) return false;

	const tr = state
		.transaction('command')
		.removeNode(parentPath, imageIndex)
		.setSelection(createCollapsedSelection(selectionTarget, 0))
		.build();

	context.dispatch(tr);
	return true;
}

/** Finds a suitable block to select after removing an image. */
function findSelectionTargetAfterRemoval(
	state: EditorState,
	parentPath: readonly BlockId[],
	removedId: BlockId,
): BlockId | undefined {
	if (parentPath.length === 0) {
		// Root level: select adjacent block
		const rootChildren: readonly BlockNode[] = state.doc.children;
		const idx: number = rootChildren.findIndex((b) => b.id === removedId);
		const adjacent: BlockNode | undefined = rootChildren[idx + 1] ?? rootChildren[idx - 1];
		return adjacent?.id;
	}

	// Nested (e.g. inside table cell): select the cell itself
	const cellId: BlockId | undefined = parentPath[parentPath.length - 1];
	return cellId;
}

/** Updates attributes on the currently selected image block. */
export function setImageAttr(context: PluginContext, attrs: Partial<ImageAttrs>): boolean {
	const state = context.getState();
	const sel = state.selection;
	if (!isNodeSelection(sel)) return false;

	const block: BlockNode | undefined = state.getBlock(sel.nodeId);
	if (!block || block.type !== 'image') return false;

	const path: BlockId[] | undefined = state.getNodePath(sel.nodeId);
	if (!path) return false;

	const merged: BlockAttrs = { ...(block.attrs ?? {}), ...attrs };
	const tr = state.transaction('command').setNodeAttr(path, merged).build();

	context.dispatch(tr);
	return true;
}

/** Registers all image commands on the plugin context. */
export function registerImageCommands(context: PluginContext): void {
	context.registerCommand('insertImage', () => {
		return insertImage(context, { src: '' });
	});

	context.registerCommand('removeImage', () => {
		return removeImage(context);
	});
}
