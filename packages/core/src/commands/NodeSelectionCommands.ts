/**
 * Commands for NodeSelection: deleting void blocks, inserting paragraphs
 * after void blocks, and navigating arrow keys into/out of void blocks.
 */

import {
	createEmptyParagraph,
	generateBlockId,
	getBlockLength,
	isBlockNode,
} from '../model/Document.js';
import { findNodePath } from '../model/NodeResolver.js';
import type { NodeSelection } from '../model/Selection.js';
import {
	createCollapsedSelection,
	createGapCursor,
	createNodeSelection,
	isCollapsed,
	isGapCursor,
	isNodeSelection,
} from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import { isVoidBlock } from '../state/NavigationQueries.js';
import type { Transaction } from '../state/Transaction.js';
import {
	createSelectionForBlockBoundary,
	extractParentPath,
	findSiblingIndex,
	getSiblings,
} from './CommandHelpers.js';

export { findFirstLeafBlockId, findLastLeafBlockId } from './CommandHelpers.js';

/**
 * Deletes the selected block and places cursor on a valid adjacent position.
 * If it is the only child in its parent, replaces it with an empty paragraph.
 */
export function deleteNodeSelection(state: EditorState, sel: NodeSelection): Transaction | null {
	const path = findNodePath(state.doc, sel.nodeId);
	if (!path) return null;

	const parentPath: BlockId[] = extractParentPath(path);
	const siblings = getSiblings(state, parentPath);

	const index: number = findSiblingIndex(siblings, sel.nodeId);
	if (index < 0) return null;

	const builder = state.transaction('input');

	// Keep container invariants intact when removing the only child in any parent.
	if (siblings.length === 1) {
		const newId = generateBlockId();
		builder.insertNode(parentPath, 0, createEmptyParagraph(newId));
		builder.removeNode(parentPath, 1);
		builder.setSelection(createCollapsedSelection(newId, 0));
		return builder.build();
	}

	builder.removeNode(parentPath, index);

	// Prefer the previous sibling, matching Backspace/Delete semantics.
	const prevSibling = siblings[index - 1];
	if (prevSibling && isBlockNode(prevSibling)) {
		const selection = createSelectionForBlockBoundary(state, prevSibling.id, 'end');
		if (selection) {
			builder.setSelection(selection);
			return builder.build();
		}
	}

	const nextSibling = siblings[index + 1];
	if (nextSibling && isBlockNode(nextSibling)) {
		const selection = createSelectionForBlockBoundary(state, nextSibling.id, 'start');
		if (selection) {
			builder.setSelection(selection);
			return builder.build();
		}
	}

	return builder.build();
}

/** Inserts a new paragraph after a NodeSelection-targeted void block. */
export function insertParagraphAfterNodeSelection(
	state: EditorState,
	sel: NodeSelection,
): Transaction | null {
	const path = findNodePath(state.doc, sel.nodeId);
	if (!path) return null;

	const parentPath: BlockId[] = extractParentPath(path);
	const siblings = getSiblings(state, parentPath);

	const index: number = findSiblingIndex(siblings, sel.nodeId);
	if (index < 0) return null;

	const newId = generateBlockId();
	const builder = state.transaction('input');
	builder.insertNode(parentPath, index + 1, createEmptyParagraph(newId));
	builder.setSelection(createCollapsedSelection(newId, 0));
	return builder.build();
}

/** Inserts text in a new paragraph after a NodeSelection-targeted void block. */
export function insertTextAfterNodeSelection(
	state: EditorState,
	sel: NodeSelection,
	text: string,
	origin: 'input' | 'paste',
): Transaction {
	const path = findNodePath(state.doc, sel.nodeId);
	const parentPath: BlockId[] = extractParentPath(path);
	const siblings = getSiblings(state, parentPath);

	const index: number = findSiblingIndex(siblings, sel.nodeId);

	const newId = generateBlockId();
	const builder = state.transaction(origin);

	const insertIdx = index >= 0 ? index + 1 : siblings.length;
	builder.insertNode(parentPath, insertIdx, createEmptyParagraph(newId));
	builder.insertText(newId, 0, text, []);
	builder.setSelection(createCollapsedSelection(newId, text.length));
	return builder.build();
}

/**
 * Navigates arrow keys into/out of void blocks.
 * Returns a transaction if navigation should create a NodeSelection, or null.
 *
 * @param isRtl — When true, flips left/right to account for RTL block direction.
 */
export function navigateArrowIntoVoid(
	state: EditorState,
	direction: 'left' | 'right' | 'up' | 'down',
	isRtl?: boolean,
): Transaction | null {
	const sel = state.selection;
	const blockOrder = state.getBlockOrder();
	const effectiveDir: 'left' | 'right' | 'up' | 'down' =
		isRtl && (direction === 'left' || direction === 'right')
			? direction === 'left'
				? 'right'
				: 'left'
			: direction;

	// If currently on a NodeSelection, navigate away from it
	if (isNodeSelection(sel)) {
		return navigateAwayFromNodeSelection(state, sel, effectiveDir, blockOrder);
	}

	// GapCursor is handled by navigateFromGapCursor in CaretNavigation
	if (isGapCursor(sel)) return null;

	// Text selection: check if navigating into a void block
	if (!isCollapsed(sel)) return null;

	return navigateIntoVoid(state, sel, effectiveDir, blockOrder);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Handles navigation away from a NodeSelection (arrow keys while void is selected). */
function navigateAwayFromNodeSelection(
	state: EditorState,
	sel: NodeSelection,
	direction: 'left' | 'right' | 'up' | 'down',
	blockOrder: readonly BlockId[],
): Transaction | null {
	const nodeIdx = blockOrder.indexOf(sel.nodeId);
	const nodePath = (findNodePath(state.doc, sel.nodeId) ?? []) as BlockId[];

	if (direction === 'left' || direction === 'up') {
		if (nodeIdx > 0) {
			const prevId = blockOrder[nodeIdx - 1];
			if (!prevId) return null;
			if (isVoidBlock(state, prevId)) {
				return state
					.transaction('input')
					.setSelection(createGapCursor(sel.nodeId, 'before', nodePath))
					.build();
			}
			const prevBlock = state.getBlock(prevId);
			const prevLen = prevBlock ? getBlockLength(prevBlock) : 0;
			return state
				.transaction('input')
				.setSelection(createCollapsedSelection(prevId, prevLen))
				.build();
		}
		return state
			.transaction('input')
			.setSelection(createGapCursor(sel.nodeId, 'before', nodePath))
			.build();
	}

	// right or down
	if (nodeIdx < blockOrder.length - 1) {
		const nextId = blockOrder[nodeIdx + 1];
		if (!nextId) return null;
		if (isVoidBlock(state, nextId)) {
			return state
				.transaction('input')
				.setSelection(createGapCursor(sel.nodeId, 'after', nodePath))
				.build();
		}
		return state.transaction('input').setSelection(createCollapsedSelection(nextId, 0)).build();
	}
	return state
		.transaction('input')
		.setSelection(createGapCursor(sel.nodeId, 'after', nodePath))
		.build();
}

/** Handles text selection navigating into an adjacent void block. */
function navigateIntoVoid(
	state: EditorState,
	sel: { readonly anchor: { readonly blockId: BlockId; readonly offset: number } },
	direction: 'left' | 'right' | 'up' | 'down',
	blockOrder: readonly BlockId[],
): Transaction | null {
	const blockIdx = blockOrder.indexOf(sel.anchor.blockId);
	const block = state.getBlock(sel.anchor.blockId);
	if (!block) return null;
	const blockLen = getBlockLength(block);

	if (direction === 'right' || direction === 'down') {
		if (sel.anchor.offset === blockLen && blockIdx < blockOrder.length - 1) {
			const nextId = blockOrder[blockIdx + 1];
			if (nextId && isVoidBlock(state, nextId)) {
				const path = findNodePath(state.doc, nextId) ?? [];
				return state
					.transaction('input')
					.setSelection(createNodeSelection(nextId, path as BlockId[]))
					.build();
			}
		}
	}

	if (direction === 'left' || direction === 'up') {
		if (sel.anchor.offset === 0 && blockIdx > 0) {
			const prevId = blockOrder[blockIdx - 1];
			if (prevId && isVoidBlock(state, prevId)) {
				const path = findNodePath(state.doc, prevId) ?? [];
				return state
					.transaction('input')
					.setSelection(createNodeSelection(prevId, path as BlockId[]))
					.build();
			}
		}
	}

	return null;
}
