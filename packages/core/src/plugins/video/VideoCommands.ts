/**
 * Video plugin commands: insert (root + table cell), source/caption/align/resize
 * updates, paste-to-embed replacement, and removal. Every content operation builds
 * an invertible transaction, so undo/redo works automatically. Mirrors the image
 * plugin's command shape for nested-context support.
 */

import { deleteNodeSelection } from '../../commands/NodeSelectionCommands.js';
import type { BlockAttrs, BlockNode } from '../../model/Document.js';
import {
	createBlockNode,
	getBlockChildren,
	getBlockText,
	isBlockNode,
} from '../../model/Document.js';
import { createNodeSelection, isGapCursor, isNodeSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { PluginContext } from '../Plugin.js';
import { type VideoMatch, parseVideoUrl } from './VideoProviders.js';
import {
	VIDEO_TYPE,
	type VideoAlign,
	type VideoAttrs,
	type VideoPluginConfig,
	clampWidthPercent,
	sanitizeAspectRatio,
} from './VideoTypes.js';

/** A contiguous text range, used to replace a pasted URL with an embed. */
export interface VideoTextRange {
	readonly blockId: BlockId;
	readonly start: number;
	readonly end: number;
}

/** Validated fields from the insert/edit form. */
export interface VideoEditInput {
	readonly url: string;
	readonly title: string;
	readonly caption: string;
	readonly aspectRatio: string;
}

/**
 * Builds full video attributes from validated form input, parsing the URL into a
 * provider/id (and hash). Returns null when the URL matches no provider.
 */
export function buildVideoAttrsFromForm(
	input: VideoEditInput,
	config: VideoPluginConfig,
): VideoAttrs | null {
	const match: VideoMatch | null = parseVideoUrl(input.url, config.providers);
	if (!match) return null;
	return {
		provider: match.provider,
		videoId: match.videoId,
		...(match.hash ? { hash: match.hash } : {}),
		aspectRatio: sanitizeAspectRatio(input.aspectRatio, config),
		widthPercent: config.defaultWidthPercent,
		align: 'center',
		title: input.title,
		...(input.caption ? { caption: input.caption } : {}),
		privacy: config.privacy,
	};
}

/** Converts structured video attributes into a plain block-attrs object. */
function toBlockAttrs(attrs: VideoAttrs): BlockAttrs {
	return {
		provider: attrs.provider,
		videoId: attrs.videoId,
		aspectRatio: attrs.aspectRatio,
		widthPercent: attrs.widthPercent,
		align: attrs.align,
		title: attrs.title,
		privacy: attrs.privacy,
		...(attrs.hash ? { hash: attrs.hash } : {}),
		...(attrs.caption ? { caption: attrs.caption } : {}),
	};
}

/** Copies block attributes into a mutable object, omitting the given keys. */
function omitAttrs(
	attrs: BlockAttrs | undefined,
	keys: readonly string[],
): Record<string, string | number | boolean> {
	const out: Record<string, string | number | boolean> = {};
	for (const [key, value] of Object.entries(attrs ?? {})) {
		if (!keys.includes(key)) out[key] = value;
	}
	return out;
}

/** Returns the currently selected video block and its node path, or null. */
function selectedVideo(state: EditorState): { block: BlockNode; path: BlockId[] } | null {
	const sel = state.selection;
	if (!isNodeSelection(sel)) return null;
	const block: BlockNode | undefined = state.getBlock(sel.nodeId);
	if (!block || block.type !== VIDEO_TYPE) return null;
	const path: BlockId[] | undefined = state.getNodePath(sel.nodeId);
	if (!path) return null;
	return { block, path };
}

/** Finds a table_cell ancestor for the given block (or the block itself). */
function findTableCellAncestor(state: EditorState, bid: BlockId): BlockId | undefined {
	const block: BlockNode | undefined = state.getBlock(bid);
	if (block?.type === 'table_cell') return bid;
	const path: BlockId[] | undefined = state.getNodePath(bid);
	if (!path) return undefined;
	for (const id of path) {
		if (state.getBlock(id)?.type === 'table_cell') return id;
	}
	return undefined;
}

// --- Insertion ---

/**
 * Inserts a video block. Inside a table cell the video becomes the cell's child;
 * otherwise it is inserted after the anchor block at document root.
 */
export function insertVideo(context: PluginContext, attrs: VideoAttrs): boolean {
	const state = context.getState();
	const sel = state.selection;
	if (isGapCursor(sel)) return false;

	const blockAttrs: BlockAttrs = toBlockAttrs(attrs);
	const anchorBlockId: BlockId = isNodeSelection(sel) ? sel.nodeId : sel.anchor.blockId;

	const cellId: BlockId | undefined = findTableCellAncestor(state, anchorBlockId);
	if (cellId) return insertVideoIntoCell(state, context, cellId, blockAttrs);
	return insertVideoAtRoot(state, context, anchorBlockId, blockAttrs);
}

/** Inserts a video at document root after the anchor block, with a trailing paragraph. */
function insertVideoAtRoot(
	state: EditorState,
	context: PluginContext,
	anchorBlockId: BlockId,
	blockAttrs: BlockAttrs,
): boolean {
	const blockIndex: number = state.doc.children.findIndex((b) => b.id === anchorBlockId);
	if (blockIndex === -1) return false;

	const videoBlock: BlockNode = createBlockNode(nodeType(VIDEO_TYPE), [], undefined, blockAttrs);
	const trailingParagraph: BlockNode = createBlockNode(nodeType('paragraph'));

	const tr = state
		.transaction('command')
		.insertNode([], blockIndex + 1, videoBlock)
		.insertNode([], blockIndex + 2, trailingParagraph)
		.setSelection(createNodeSelection(videoBlock.id, []))
		.build();
	context.dispatch(tr);
	return true;
}

/** Inserts a video as the sole content of a table cell. */
function insertVideoIntoCell(
	state: EditorState,
	context: PluginContext,
	cellId: BlockId,
	blockAttrs: BlockAttrs,
): boolean {
	const cellPath: BlockId[] | undefined = state.getNodePath(cellId);
	const cell: BlockNode | undefined = state.getBlock(cellId);
	if (!cellPath || !cell) return false;

	const videoBlock: BlockNode = createBlockNode(nodeType(VIDEO_TYPE), [], undefined, blockAttrs);
	const builder = state.transaction('command');

	const blockChildren: readonly BlockNode[] = getBlockChildren(cell);
	for (let i = blockChildren.length - 1; i >= 0; i--) {
		const rawIndex: number = cell.children.findIndex(
			(c) => isBlockNode(c) && c.id === blockChildren[i]?.id,
		);
		if (rawIndex !== -1) builder.removeNode(cellPath, rawIndex);
	}

	builder.insertNode(cellPath, 0, videoBlock);
	builder.setSelection(createNodeSelection(videoBlock.id, [...cellPath, videoBlock.id]));
	context.dispatch(builder.build());
	return true;
}

/**
 * Replaces a pasted URL (the given text range) with a video embed in a single
 * transaction. When the range is the block's entire content, the empty paragraph
 * is replaced outright; otherwise the video is inserted after it. Used by the
 * ask-first paste flow.
 */
export function insertVideoReplacingRange(
	context: PluginContext,
	range: VideoTextRange,
	attrs: VideoAttrs,
): boolean {
	const state = context.getState();
	const block: BlockNode | undefined = state.getBlock(range.blockId);
	if (!block) return false;
	const loc = locateBlock(state, range.blockId);
	if (!loc) return false;

	const remaining: number = Math.max(0, getBlockText(block).length - (range.end - range.start));
	const replaceWhole: boolean = remaining === 0 && block.type === 'paragraph';
	const videoBlock: BlockNode = createBlockNode(
		nodeType(VIDEO_TYPE),
		[],
		undefined,
		toBlockAttrs(attrs),
	);
	const selectionPath: BlockId[] =
		loc.parentPath.length === 0 ? [] : [...loc.parentPath, videoBlock.id];

	const builder = state.transaction('command');
	if (replaceWhole) {
		builder.removeNode(loc.parentPath, loc.index);
		builder.insertNode(loc.parentPath, loc.index, videoBlock);
		// Keep something editable after a root-level embed that is now the last block.
		if (loc.parentPath.length === 0 && loc.index >= state.doc.children.length - 1) {
			builder.insertNode([], loc.index + 1, createBlockNode(nodeType('paragraph')));
		}
	} else {
		builder.deleteTextAt(range.blockId, range.start, range.end);
		builder.insertNode(loc.parentPath, loc.index + 1, videoBlock);
	}
	builder.setSelection(createNodeSelection(videoBlock.id, selectionPath));
	context.dispatch(builder.build());
	return true;
}

/** Locates a block's parent path and its raw index within that parent. */
function locateBlock(
	state: EditorState,
	blockId: BlockId,
): { parentPath: BlockId[]; index: number } | null {
	const path: BlockId[] | undefined = state.getNodePath(blockId);
	if (!path || path.length === 0) return null;

	if (path.length === 1) {
		const index: number = state.doc.children.findIndex((b) => b.id === blockId);
		return index === -1 ? null : { parentPath: [], index };
	}

	const parentId: BlockId | undefined = path[path.length - 2];
	const parent: BlockNode | undefined = parentId ? state.getBlock(parentId) : undefined;
	if (!parent) return null;
	const index: number = parent.children.findIndex((c) => isBlockNode(c) && c.id === blockId);
	return index === -1 ? null : { parentPath: path.slice(0, -1), index };
}

// --- Attribute updates (operate on the selected video) ---

/** Merges attributes onto the selected video, replacing the full attr set. */
function applyVideoAttrs(context: PluginContext, attrs: BlockAttrs): boolean {
	const state = context.getState();
	const selected = selectedVideo(state);
	if (!selected) return false;
	context.dispatch(state.transaction('command').setNodeAttr(selected.path, attrs).build());
	return true;
}

/** Updates the selected video's provider/id/hash (and privacy) from a parsed URL. */
export function setVideoSource(
	context: PluginContext,
	match: VideoMatch,
	privacy: boolean,
): boolean {
	const selected = selectedVideo(context.getState());
	if (!selected) return false;
	const next: Record<string, string | number | boolean> = omitAttrs(selected.block.attrs, ['hash']);
	next.provider = match.provider;
	next.videoId = match.videoId;
	next.privacy = privacy;
	if (match.hash) next.hash = match.hash;
	return applyVideoAttrs(context, next);
}

/** Sets the alignment of the selected video. */
export function setVideoAlign(context: PluginContext, align: VideoAlign): boolean {
	const selected = selectedVideo(context.getState());
	if (!selected) return false;
	return applyVideoAttrs(context, { ...(selected.block.attrs ?? {}), align });
}

/** Sets (or clears) the caption of the selected video. */
export function setVideoCaption(context: PluginContext, caption: string): boolean {
	const selected = selectedVideo(context.getState());
	if (!selected) return false;
	const next: Record<string, string | number | boolean> = omitAttrs(selected.block.attrs, [
		'caption',
	]);
	if (caption.trim()) next.caption = caption.trim();
	return applyVideoAttrs(context, next);
}

/** Sets the accessible title of the selected video. */
export function setVideoTitle(context: PluginContext, title: string): boolean {
	const selected = selectedVideo(context.getState());
	if (!selected) return false;
	return applyVideoAttrs(context, { ...(selected.block.attrs ?? {}), title });
}

/** Sets the aspect ratio of the selected video. */
export function setVideoAspectRatio(context: PluginContext, aspectRatio: string): boolean {
	const selected = selectedVideo(context.getState());
	if (!selected) return false;
	return applyVideoAttrs(context, { ...(selected.block.attrs ?? {}), aspectRatio });
}

/**
 * Applies a full edit (URL, title, caption, aspect ratio) to the selected video
 * in a single undoable transaction. Returns false when nothing is selected or the
 * URL matches no provider.
 */
export function applyVideoEdit(
	context: PluginContext,
	input: VideoEditInput,
	config: VideoPluginConfig,
): boolean {
	const selected = selectedVideo(context.getState());
	if (!selected) return false;
	const match: VideoMatch | null = parseVideoUrl(input.url, config.providers);
	if (!match) return false;

	const next: Record<string, string | number | boolean> = omitAttrs(selected.block.attrs, [
		'hash',
		'caption',
	]);
	next.provider = match.provider;
	next.videoId = match.videoId;
	next.title = input.title;
	next.aspectRatio = sanitizeAspectRatio(input.aspectRatio, config);
	if (match.hash) next.hash = match.hash;
	if (input.caption.trim()) next.caption = input.caption.trim();
	return applyVideoAttrs(context, next);
}

/** Resizes the selected video by a width-percentage delta. */
export function resizeVideoByDelta(
	context: PluginContext,
	delta: number,
	config: VideoPluginConfig,
): boolean {
	const selected = selectedVideo(context.getState());
	if (!selected) return false;
	const current: number =
		(selected.block.attrs?.widthPercent as number | undefined) ?? config.defaultWidthPercent;
	const next: number = clampWidthPercent(current + delta, config);
	if (next === current) return false;
	return applyVideoAttrs(context, { ...(selected.block.attrs ?? {}), widthPercent: next });
}

/** Resets the selected video to the default responsive width. */
export function resetVideoSize(context: PluginContext, config: VideoPluginConfig): boolean {
	const selected = selectedVideo(context.getState());
	if (!selected) return false;
	return applyVideoAttrs(context, {
		...(selected.block.attrs ?? {}),
		widthPercent: config.defaultWidthPercent,
	});
}

/** Removes the currently selected video block. */
export function removeVideo(context: PluginContext): boolean {
	const state = context.getState();
	const selected = selectedVideo(state);
	if (!selected) return false;
	const tr = deleteNodeSelection(state, createNodeSelection(selected.block.id, selected.path));
	if (!tr) return false;
	context.dispatch(tr);
	return true;
}

/** Returns the selected video's current width percentage, or null. */
export function selectedVideoWidthPercent(
	state: EditorState,
	config: VideoPluginConfig,
): number | null {
	const selected = selectedVideo(state);
	if (!selected) return null;
	return (selected.block.attrs?.widthPercent as number | undefined) ?? config.defaultWidthPercent;
}

/** Registers the non-UI video commands (removal). Insert/resize are wired by the plugin. */
export function registerVideoCommands(context: PluginContext): void {
	context.registerCommand('removeVideo', () => removeVideo(context));
}
