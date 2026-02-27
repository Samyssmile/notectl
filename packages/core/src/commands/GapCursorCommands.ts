/**
 * Commands for GapCursor: deleting void blocks adjacent to gap cursors
 * and inserting paragraphs at gap positions.
 */

import { generateBlockId, getBlockLength } from '../model/Document.js';
import { isVoidBlock } from '../model/NavigationUtils.js';
import { findNodePath } from '../model/NodeResolver.js';
import type { GapCursorSelection, NodeSelection } from '../model/Selection.js';
import { createCollapsedSelection, createNodeSelection } from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { createEmptyParagraph, getSiblings } from './CommandHelpers.js';
import { deleteNodeSelection } from './NodeSelectionCommands.js';

/**
 * Deletes the void block adjacent to a GapCursor when pressing Backspace.
 *
 * - `side === 'after'` → void block is behind the cursor → delete it.
 * - `side === 'before'` → void block is ahead → navigate backward (to previous block).
 * - At document start with `side === 'before'` → `null` (no-op).
 */
export function deleteBackwardAtGap(
	state: EditorState,
	sel: GapCursorSelection,
): Transaction | null {
	if (sel.side === 'after') {
		return deleteVoidAtGap(state, sel);
	}

	// side === 'before': navigate to previous block
	const blockOrder: readonly BlockId[] = state.getBlockOrder();
	const blockIdx: number = blockOrder.indexOf(sel.blockId);

	if (blockIdx <= 0) return null;

	const prevId: BlockId | undefined = blockOrder[blockIdx - 1];
	if (!prevId) return null;

	if (isVoidBlock(state, prevId)) {
		const path = findNodePath(state.doc, prevId) ?? [];
		return state
			.transaction('input')
			.setSelection(createNodeSelection(prevId, path as BlockId[]))
			.build();
	}

	const prevBlock = state.getBlock(prevId);
	if (!prevBlock) return null;
	const prevLen: number = getBlockLength(prevBlock);
	return state.transaction('input').setSelection(createCollapsedSelection(prevId, prevLen)).build();
}

/**
 * Deletes the void block adjacent to a GapCursor when pressing Delete.
 *
 * - `side === 'before'` → void block is ahead of the cursor → delete it.
 * - `side === 'after'` → void block is behind → navigate forward (to next block).
 * - At document end with `side === 'after'` → `null` (no-op).
 */
export function deleteForwardAtGap(
	state: EditorState,
	sel: GapCursorSelection,
): Transaction | null {
	if (sel.side === 'before') {
		return deleteVoidAtGap(state, sel);
	}

	// side === 'after': navigate to next block
	const blockOrder: readonly BlockId[] = state.getBlockOrder();
	const blockIdx: number = blockOrder.indexOf(sel.blockId);

	if (blockIdx >= blockOrder.length - 1) return null;

	const nextId: BlockId | undefined = blockOrder[blockIdx + 1];
	if (!nextId) return null;

	if (isVoidBlock(state, nextId)) {
		const path = findNodePath(state.doc, nextId) ?? [];
		return state
			.transaction('input')
			.setSelection(createNodeSelection(nextId, path as BlockId[]))
			.build();
	}

	return state.transaction('input').setSelection(createCollapsedSelection(nextId, 0)).build();
}

/** Deletes the void block that the GapCursor is adjacent to, delegating to deleteNodeSelection. */
function deleteVoidAtGap(state: EditorState, sel: GapCursorSelection): Transaction | null {
	const path = (findNodePath(state.doc, sel.blockId) ?? []) as BlockId[];
	const nodeSel: NodeSelection = createNodeSelection(sel.blockId, path);
	return deleteNodeSelection(state, nodeSel);
}

/** Inserts a new paragraph at a GapCursor position (before or after the void block). */
export function insertParagraphAtGap(
	state: EditorState,
	sel: GapCursorSelection,
): Transaction | null {
	const path = findNodePath(state.doc, sel.blockId);
	if (!path) return null;

	const parentPath: BlockId[] = path.length > 1 ? (path.slice(0, -1) as BlockId[]) : [];
	const siblings = getSiblings(state, parentPath);

	const index: number = siblings.findIndex((c) => 'id' in c && c.id === sel.blockId);
	if (index < 0) return null;

	const insertIdx: number = sel.side === 'before' ? index : index + 1;
	const newId = generateBlockId();
	const builder = state.transaction('input');
	builder.insertNode(parentPath, insertIdx, createEmptyParagraph(newId));
	builder.setSelection(createCollapsedSelection(newId, 0));
	return builder.build();
}

/** Inserts text in a new paragraph at a GapCursor position. */
export function insertTextAtGap(
	state: EditorState,
	sel: GapCursorSelection,
	text: string,
	origin: 'input' | 'paste',
): Transaction {
	const path = findNodePath(state.doc, sel.blockId);
	const parentPath: BlockId[] = path && path.length > 1 ? (path.slice(0, -1) as BlockId[]) : [];
	const siblings = getSiblings(state, parentPath);

	const index: number = siblings.findIndex((c) => 'id' in c && c.id === sel.blockId);
	const insertIdx: number =
		sel.side === 'before' ? Math.max(index, 0) : index >= 0 ? index + 1 : siblings.length;

	const newId = generateBlockId();
	const builder = state.transaction(origin);
	builder.insertNode(parentPath, insertIdx, createEmptyParagraph(newId));
	builder.insertText(newId, 0, text, []);
	builder.setSelection(createCollapsedSelection(newId, text.length));
	return builder.build();
}
