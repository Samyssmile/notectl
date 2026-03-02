/**
 * Keyboard handlers for blockquote boundary navigation and escape.
 *
 * Handles ArrowDown/ArrowUp at block boundaries, Enter on empty blockquote
 * (converts to paragraph), and Backspace at offset 0 (reverts to paragraph).
 */

import type { BlockNode } from '../../model/Document.js';
import { generateBlockId, getBlockLength } from '../../model/Document.js';
import {
	createCollapsedSelection,
	isCollapsed,
	isGapCursor,
	isNodeSelection,
} from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';

// --- Context Guard ---

interface BlockquoteContext {
	readonly state: EditorState;
	readonly block: BlockNode;
	readonly blockId: BlockId;
	readonly offset: number;
}

/**
 * Guards against non-blockquote contexts.
 * Returns false (not handled) if the cursor is not inside a blockquote.
 */
function withBlockquoteContext(
	context: PluginContext,
	handler: (ctx: BlockquoteContext) => boolean,
): boolean {
	const state: EditorState = context.getState();
	if (isNodeSelection(state.selection) || isGapCursor(state.selection)) return false;

	const sel = state.selection;
	if (!isCollapsed(sel)) return false;

	const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
	if (!block || block.type !== 'blockquote') return false;

	return handler({
		state,
		block,
		blockId: sel.anchor.blockId,
		offset: sel.anchor.offset,
	});
}

/** Registers blockquote keyboard handlers at context priority. */
export function registerBlockquoteKeymaps(context: PluginContext): void {
	context.registerKeymap(
		{
			ArrowDown: () => handleArrowDown(context),
			ArrowUp: () => handleArrowUp(context),
			Enter: () => handleEnterOnEmpty(context),
			Backspace: () => handleBackspaceAtStart(context),
		},
		{ priority: 'context' },
	);
}

// --- Handler Functions ---

/**
 * Moves cursor to the next block when at the end of the blockquote text.
 * If no next block exists, inserts a new paragraph after the blockquote.
 */
function handleArrowDown(context: PluginContext): boolean {
	return withBlockquoteContext(context, ({ state, block, blockId, offset }) => {
		const textLength: number = getBlockLength(block);
		if (offset !== textLength) return false;

		const blockOrder: readonly BlockId[] = state.getBlockOrder();
		const idx: number = blockOrder.indexOf(blockId);

		if (idx < blockOrder.length - 1) {
			const nextId: BlockId = blockOrder[idx + 1] as BlockId;
			const tr: Transaction = state
				.transaction('command')
				.setSelection(createCollapsedSelection(nextId, 0))
				.build();
			context.dispatch(tr);
		} else {
			insertParagraphAfter(context, blockId);
		}

		return true;
	});
}

/**
 * Moves cursor to the previous block when at the start of the blockquote text.
 * Returns false if no previous block exists.
 */
function handleArrowUp(context: PluginContext): boolean {
	return withBlockquoteContext(context, ({ state, blockId, offset }) => {
		if (offset !== 0) return false;

		const blockOrder: readonly BlockId[] = state.getBlockOrder();
		const idx: number = blockOrder.indexOf(blockId);

		if (idx > 0) {
			const prevId: BlockId = blockOrder[idx - 1] as BlockId;
			const prevBlock: BlockNode | undefined = state.getBlock(prevId);
			const prevLen: number = prevBlock ? getBlockLength(prevBlock) : 0;
			const tr: Transaction = state
				.transaction('command')
				.setSelection(createCollapsedSelection(prevId, prevLen))
				.build();
			context.dispatch(tr);
			return true;
		}

		return false;
	});
}

/**
 * Converts an empty blockquote to a paragraph on Enter.
 * Returns false for non-empty blockquotes, letting splitBlock handle them.
 */
function handleEnterOnEmpty(context: PluginContext): boolean {
	return withBlockquoteContext(context, ({ state, block, blockId }) => {
		if (getBlockLength(block) > 0) return false;

		const tr: Transaction = state
			.transaction('command')
			.setBlockType(blockId, nodeType('paragraph'))
			.setSelection(createCollapsedSelection(blockId, 0))
			.build();
		context.dispatch(tr);
		return true;
	});
}

/**
 * Converts a blockquote to a paragraph when Backspace is pressed at offset 0.
 */
function handleBackspaceAtStart(context: PluginContext): boolean {
	return withBlockquoteContext(context, ({ state, blockId, offset }) => {
		if (offset !== 0) return false;

		const tr: Transaction = state
			.transaction('input')
			.setBlockType(blockId, nodeType('paragraph'))
			.setSelection(state.selection)
			.build();
		context.dispatch(tr);
		return true;
	});
}

// --- Shared Helpers ---

function insertParagraphAfter(context: PluginContext, bid: BlockId): void {
	const state: EditorState = context.getState();
	const block: BlockNode | undefined = state.getBlock(bid);
	if (!block) return;

	const blockLength: number = getBlockLength(block);
	const newId: BlockId = generateBlockId();

	const tr: Transaction = state
		.transaction('command')
		.splitBlock(bid, blockLength, newId)
		.setBlockType(newId, nodeType('paragraph'))
		.setSelection(createCollapsedSelection(newId, 0))
		.build();

	context.dispatch(tr);
}
