/**
 * Delete commands: character, word, and soft-line deletion in both directions.
 */

import { type BlockNode, getBlockLength } from '../model/Document.js';
import {
	createCollapsedSelection,
	isCollapsed,
	isGapCursor,
	isNodeSelection,
} from '../model/Selection.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { deleteSelectionCommand, mergeBlockBackward, mergeBlockForward } from './Commands.js';
import { deleteNodeSelection } from './NodeSelectionCommands.js';
import { findWordBoundaryBackward, findWordBoundaryForward } from './WordBoundary.js';

interface DeleteConfig {
	readonly merge: (state: EditorState) => Transaction | null;
	readonly range: (block: BlockNode, offset: number) => readonly [number, number] | null;
}

function deleteInDirection(
	state: EditorState,
	config: DeleteConfig,
): Transaction | null {
	const sel = state.selection;

	if (isNodeSelection(sel)) return deleteNodeSelection(state, sel);
	if (isGapCursor(sel)) return null;
	if (!isCollapsed(sel)) return deleteSelectionCommand(state);

	const block = state.getBlock(sel.anchor.blockId);
	if (!block) return null;

	const range = config.range(block, sel.anchor.offset);
	if (!range) return config.merge(state);

	const [from, to] = range;
	return state
		.transaction('input')
		.deleteTextAt(block.id, from, to)
		.setSelection(createCollapsedSelection(block.id, from))
		.build();
}

/** Handles backspace key. */
export function deleteBackward(state: EditorState): Transaction | null {
	return deleteInDirection(state, {
		merge: mergeBlockBackward,
		range: (_block, offset) => (offset > 0 ? [offset - 1, offset] : null),
	});
}

/** Handles delete key. */
export function deleteForward(state: EditorState): Transaction | null {
	return deleteInDirection(state, {
		merge: mergeBlockForward,
		range: (block, offset) => {
			const len = getBlockLength(block);
			return offset < len ? [offset, offset + 1] : null;
		},
	});
}

/** Handles Ctrl+Backspace: delete word backward. */
export function deleteWordBackward(state: EditorState): Transaction | null {
	return deleteInDirection(state, {
		merge: mergeBlockBackward,
		range: (block, offset) =>
			offset > 0 ? [findWordBoundaryBackward(block, offset), offset] : null,
	});
}

/** Handles Ctrl+Delete: delete word forward. */
export function deleteWordForward(state: EditorState): Transaction | null {
	return deleteInDirection(state, {
		merge: mergeBlockForward,
		range: (block, offset) => {
			const len = getBlockLength(block);
			return offset < len ? [offset, findWordBoundaryForward(block, offset)] : null;
		},
	});
}

/** Handles Cmd+Backspace: delete to start of line/block. */
export function deleteSoftLineBackward(state: EditorState): Transaction | null {
	return deleteInDirection(state, {
		merge: mergeBlockBackward,
		range: (_block, offset) => (offset > 0 ? [0, offset] : null),
	});
}

/** Handles Cmd+Delete: delete to end of line/block. */
export function deleteSoftLineForward(state: EditorState): Transaction | null {
	return deleteInDirection(state, {
		merge: mergeBlockForward,
		range: (block, offset) => {
			const len = getBlockLength(block);
			return offset < len ? [offset, len] : null;
		},
	});
}
