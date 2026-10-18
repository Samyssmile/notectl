/**
 * Image plugin commands: insert, remove, and attribute updates.
 * Supports both root-level and nested contexts (e.g. images inside table cells).
 */

import {
	findTableCellAncestor,
	insertBlockObjectOnOwnLine,
} from '../../commands/BlockInsertion.js';
import { deleteNodeSelection } from '../../commands/NodeSelectionCommands.js';
import {
	type ReplacementTarget,
	resolveReplacementTarget,
} from '../../commands/SelectionReplacement.js';
import type { BlockAttrs, BlockNode } from '../../model/Document.js';
import { createBlockNode, getBlockChildren, isBlockNode } from '../../model/Document.js';
import { createNodeSelection, isGapCursor, isNodeSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { TransactionBuilder } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import type { ImageAttrs } from './ImageUpload.js';

/** Attributes for a new image: a source plus any optional image attributes. */
type ImageInsertAttrs = Partial<ImageAttrs> & { readonly src: string };

/** Places a new image at the selection: {@link insertImage} or {@link pasteImage}. */
export type ImagePlacement = (context: PluginContext, attrs: ImageInsertAttrs) => boolean;

/**
 * Inserts an image block. When the cursor is inside a table cell,
 * the image is inserted as a child of the cell. Otherwise it is
 * inserted after the current block at document root.
 */
export function insertImage(context: PluginContext, attrs: ImageInsertAttrs): boolean {
	const state = context.getState();
	const sel = state.selection;
	if (isGapCursor(sel)) return false;

	const anchorBlockId: BlockId = isNodeSelection(sel) ? sel.nodeId : sel.anchor.blockId;
	return placeImage(context, state, state.transaction('command'), anchorBlockId, attrs);
}

/**
 * Pastes an image block. Unlike {@link insertImage}, a range selection is
 * replaced, as by every other paste (#267): the range is deleted and the image
 * is placed relative to the block that receives the range start, in the same
 * transaction, so one undo restores both.
 */
export function pasteImage(context: PluginContext, attrs: ImageInsertAttrs): boolean {
	const state = context.getState();
	if (isGapCursor(state.selection)) return false;

	const builder: TransactionBuilder = state.transaction('paste');
	const target: ReplacementTarget = resolveReplacementTarget(state, builder);
	return placeImage(context, target.state, builder, target.blockId, attrs);
}

/**
 * Adds the steps placing an image relative to `anchorBlockId` in `state` to
 * `builder` and dispatches the transaction. Returns false, dispatching
 * nothing, when the anchor cannot be resolved.
 */
function placeImage(
	context: PluginContext,
	state: EditorState,
	builder: TransactionBuilder,
	anchorBlockId: BlockId,
	attrs: ImageInsertAttrs,
): boolean {
	const imageAttrs: BlockAttrs = {
		src: attrs.src,
		alt: attrs.alt ?? '',
		align: attrs.align ?? 'center',
		...(attrs.width !== undefined ? { width: attrs.width } : {}),
		...(attrs.height !== undefined ? { height: attrs.height } : {}),
	};

	const cellId: BlockId | undefined = findTableCellAncestor(state, anchorBlockId);
	const placed: boolean = cellId
		? insertImageIntoCell(state, builder, cellId, imageAttrs)
		: insertImageAtRoot(state, builder, anchorBlockId, imageAttrs);
	if (!placed) return false;

	context.dispatch(builder.build());
	return true;
}

/** Inserts an image on its own line at document root, after the anchor block. */
function insertImageAtRoot(
	state: EditorState,
	builder: TransactionBuilder,
	anchorBlockId: BlockId,
	imageAttrs: BlockAttrs,
): boolean {
	const imageBlock: BlockNode = createBlockNode(nodeType('image'), [], undefined, imageAttrs);
	const trailing = insertBlockObjectOnOwnLine(state, builder, anchorBlockId, imageBlock);
	if (!trailing) return false;

	builder.setSelection(createNodeSelection(imageBlock.id, []));
	return true;
}

/** Inserts an image as a child of a table cell. */
function insertImageIntoCell(
	state: EditorState,
	builder: TransactionBuilder,
	cellId: BlockId,
	imageAttrs: BlockAttrs,
): boolean {
	const cellPath: BlockId[] | undefined = state.getNodePath(cellId);
	if (!cellPath) return false;

	const imageBlock: BlockNode = createBlockNode(nodeType('image'), [], undefined, imageAttrs);

	// Remove existing block children first (if any)
	const cell: BlockNode | undefined = state.getBlock(cellId);
	if (!cell) return false;

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

	const tr = deleteNodeSelection(state, createNodeSelection(sel.nodeId, nodePath));
	if (!tr) return false;
	context.dispatch(tr);
	return true;
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

/** Minimum image width in pixels (shared with NodeView). */
export const MIN_IMAGE_WIDTH = 50;

/**
 * Resizes the currently selected image by a pixel delta, preserving aspect ratio.
 * Returns false if no image is selected or the image has no width/height attributes.
 */
export function resizeImageByDelta(
	context: PluginContext,
	delta: number,
	maxWidth: number,
): boolean {
	const state = context.getState();
	const sel = state.selection;
	if (!isNodeSelection(sel)) return false;

	const block: BlockNode | undefined = state.getBlock(sel.nodeId);
	if (!block || block.type !== 'image') return false;

	const currentWidth: number | undefined = block.attrs?.width as number | undefined;
	const currentHeight: number | undefined = block.attrs?.height as number | undefined;
	if (currentWidth === undefined || currentHeight === undefined) return false;

	const aspectRatio: number = currentHeight > 0 ? currentWidth / currentHeight : 1;
	const clampedWidth: number = Math.max(MIN_IMAGE_WIDTH, Math.min(maxWidth, currentWidth + delta));
	const newHeight: number = Math.round(clampedWidth / aspectRatio);

	if (clampedWidth === currentWidth && newHeight === currentHeight) return false;

	return setImageAttr(context, { width: clampedWidth, height: newHeight });
}

/** Resets the currently selected image to its natural size by removing width/height. */
export function resetImageSize(context: PluginContext): boolean {
	const state = context.getState();
	const sel = state.selection;
	if (!isNodeSelection(sel)) return false;

	const block: BlockNode | undefined = state.getBlock(sel.nodeId);
	if (!block || block.type !== 'image') return false;

	const path: BlockId[] | undefined = state.getNodePath(sel.nodeId);
	if (!path) return false;

	const attrs: BlockAttrs = { ...(block.attrs ?? {}) };
	const cleaned: BlockAttrs = Object.fromEntries(
		Object.entries(attrs).filter(([k]) => k !== 'width' && k !== 'height'),
	);

	const tr = state.transaction('command').setNodeAttr(path, cleaned).build();
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
