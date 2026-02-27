/**
 * Commands for NodeSelection: deleting void blocks, inserting paragraphs
 * after void blocks, and navigating arrow keys into/out of void blocks.
 */

import { type BlockNode, generateBlockId, getBlockLength, isBlockNode } from '../model/Document.js';
import { isVoidBlock } from '../model/NavigationUtils.js';
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
import type { Transaction } from '../state/Transaction.js';
import { createEmptyParagraph, getSiblings } from './CommandHelpers.js';

/**
 * Deletes the void block targeted by a NodeSelection and places cursor
 * on the adjacent block. If it's the only block, replaces with empty paragraph.
 */
export function deleteNodeSelection(state: EditorState, sel: NodeSelection): Transaction | null {
	const path = findNodePath(state.doc, sel.nodeId);
	if (!path) return null;

	const parentPath: BlockId[] = path.length > 1 ? (path.slice(0, -1) as BlockId[]) : [];
	const siblings = getSiblings(state, parentPath);

	const index: number = siblings.findIndex((c) => 'id' in c && c.id === sel.nodeId);
	if (index < 0) return null;

	const builder = state.transaction('input');

	// If this is the only block in the document, insert empty paragraph first
	if (siblings.length === 1 && parentPath.length === 0) {
		const newId = generateBlockId();
		builder.insertNode(parentPath, 0, createEmptyParagraph(newId));
		builder.removeNode(parentPath, 1);
		builder.setSelection(createCollapsedSelection(newId, 0));
		return builder.build();
	}

	builder.removeNode(parentPath, index);

	// Find where to place cursor: prefer previous sibling leaf, else next sibling leaf.
	const prevSibling = siblings[index - 1];
	if (prevSibling && isBlockNode(prevSibling)) {
		const prevLeafId = findLastLeafBlockId(prevSibling);
		if (prevLeafId) {
			const prevLeaf = state.getBlock(prevLeafId);
			const prevLen = prevLeaf ? getBlockLength(prevLeaf) : 0;
			builder.setSelection(createCollapsedSelection(prevLeafId, prevLen));
		}
	} else {
		const nextSibling = siblings[index + 1];
		if (nextSibling && isBlockNode(nextSibling)) {
			const nextLeafId = findFirstLeafBlockId(nextSibling);
			if (nextLeafId) {
				builder.setSelection(createCollapsedSelection(nextLeafId, 0));
			}
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

	const parentPath: BlockId[] = path.length > 1 ? (path.slice(0, -1) as BlockId[]) : [];
	const siblings = getSiblings(state, parentPath);

	const index: number = siblings.findIndex((c) => 'id' in c && c.id === sel.nodeId);
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
	const parentPath: BlockId[] = path && path.length > 1 ? (path.slice(0, -1) as BlockId[]) : [];
	const siblings = getSiblings(state, parentPath);

	const index: number = siblings.findIndex((c) => 'id' in c && c.id === sel.nodeId);

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
 */
export function navigateArrowIntoVoid(
	state: EditorState,
	direction: 'left' | 'right' | 'up' | 'down',
): Transaction | null {
	const sel = state.selection;
	const blockOrder = state.getBlockOrder();

	// If currently on a NodeSelection, navigate away from it
	if (isNodeSelection(sel)) {
		return navigateAwayFromNodeSelection(state, sel, direction, blockOrder);
	}

	// GapCursor is handled by navigateFromGapCursor in CaretNavigation
	if (isGapCursor(sel)) return null;

	// Text selection: check if navigating into a void block
	if (!isCollapsed(sel)) return null;

	return navigateIntoVoid(state, sel, direction, blockOrder);
}

/** Finds the first leaf (deepest-first-child) block ID in a subtree. */
export function findFirstLeafBlockId(node: BlockNode): BlockId {
	let current: BlockNode = node;
	while (true) {
		const firstBlockChild = current.children.find((child): child is BlockNode =>
			isBlockNode(child),
		);
		if (!firstBlockChild) return current.id;
		current = firstBlockChild;
	}
}

/** Finds the last leaf (deepest-last-child) block ID in a subtree. */
export function findLastLeafBlockId(node: BlockNode): BlockId {
	let current: BlockNode = node;
	while (true) {
		let lastBlockChild: BlockNode | undefined;
		for (let i = current.children.length - 1; i >= 0; i--) {
			const child = current.children[i];
			if (child && isBlockNode(child)) {
				lastBlockChild = child;
				break;
			}
		}
		if (!lastBlockChild) return current.id;
		current = lastBlockChild;
	}
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
