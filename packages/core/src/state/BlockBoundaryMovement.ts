/**
 * Block boundary movement: pure state-level functions for moving
 * the cursor to the start or end of the current block.
 *
 * These only depend on model/ and state/ types, so they belong
 * at the state layer rather than in commands/.
 */

import { getBlockLength } from '../model/Document.js';
import { isCollapsed, isGapCursor, isNodeSelection } from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import type { EditorState } from './EditorState.js';
import { moveTx } from './SelectionTransactions.js';
import type { Transaction } from './Transaction.js';

/** Moves the cursor to the start of the current block. */
export function moveToBlockStart(state: EditorState): Transaction | null {
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

	const blockId: BlockId = isCollapsed(sel) ? sel.anchor.blockId : sel.head.blockId;
	const offset: number = isCollapsed(sel) ? sel.anchor.offset : sel.head.offset;

	if (offset === 0) return null;
	return moveTx(state, blockId, 0);
}

/** Moves the cursor to the end of the current block. */
export function moveToBlockEnd(state: EditorState): Transaction | null {
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

	const blockId: BlockId = isCollapsed(sel) ? sel.anchor.blockId : sel.head.blockId;
	const block = state.getBlock(blockId);
	if (!block) return null;

	const blockLen: number = getBlockLength(block);
	const offset: number = isCollapsed(sel) ? sel.anchor.offset : sel.head.offset;

	if (offset === blockLen) return null;
	return moveTx(state, blockId, blockLen);
}
