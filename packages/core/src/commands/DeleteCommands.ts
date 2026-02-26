/**
 * Delete commands: character, word, and soft-line deletion in both directions.
 */

import { getBlockLength } from '../model/Document.js';
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

/** Handles backspace key. */
export function deleteBackward(state: EditorState): Transaction | null {
	const sel = state.selection;

	if (isNodeSelection(sel)) {
		return deleteNodeSelection(state, sel);
	}
	if (isGapCursor(sel)) return null;

	if (!isCollapsed(sel)) {
		return deleteSelectionCommand(state);
	}

	const block = state.getBlock(sel.anchor.blockId);
	if (!block) return null;

	if (sel.anchor.offset > 0) {
		return state
			.transaction('input')
			.deleteTextAt(block.id, sel.anchor.offset - 1, sel.anchor.offset)
			.setSelection(createCollapsedSelection(block.id, sel.anchor.offset - 1))
			.build();
	}

	// At start of block — merge with previous
	return mergeBlockBackward(state);
}

/** Handles delete key. */
export function deleteForward(state: EditorState): Transaction | null {
	const sel = state.selection;

	if (isNodeSelection(sel)) {
		return deleteNodeSelection(state, sel);
	}
	if (isGapCursor(sel)) return null;

	if (!isCollapsed(sel)) {
		return deleteSelectionCommand(state);
	}

	const block = state.getBlock(sel.anchor.blockId);
	if (!block) return null;

	const blockLen = getBlockLength(block);

	if (sel.anchor.offset < blockLen) {
		return state
			.transaction('input')
			.deleteTextAt(block.id, sel.anchor.offset, sel.anchor.offset + 1)
			.setSelection(createCollapsedSelection(block.id, sel.anchor.offset))
			.build();
	}

	// At end of block — merge with next
	return mergeBlockForward(state);
}

/** Handles Ctrl+Backspace: delete word backward. */
export function deleteWordBackward(state: EditorState): Transaction | null {
	const sel = state.selection;

	if (isNodeSelection(sel)) {
		return deleteNodeSelection(state, sel);
	}
	if (isGapCursor(sel)) return null;

	if (!isCollapsed(sel)) {
		return deleteSelectionCommand(state);
	}

	const block = state.getBlock(sel.anchor.blockId);
	if (!block) return null;

	if (sel.anchor.offset === 0) {
		return mergeBlockBackward(state);
	}

	const wordStart = findWordBoundaryBackward(block, sel.anchor.offset);

	return state
		.transaction('input')
		.deleteTextAt(block.id, wordStart, sel.anchor.offset)
		.setSelection(createCollapsedSelection(block.id, wordStart))
		.build();
}

/** Handles Ctrl+Delete: delete word forward. */
export function deleteWordForward(state: EditorState): Transaction | null {
	const sel = state.selection;

	if (isNodeSelection(sel)) {
		return deleteNodeSelection(state, sel);
	}
	if (isGapCursor(sel)) return null;

	if (!isCollapsed(sel)) {
		return deleteSelectionCommand(state);
	}

	const block = state.getBlock(sel.anchor.blockId);
	if (!block) return null;

	const blockLen = getBlockLength(block);
	if (sel.anchor.offset === blockLen) {
		return mergeBlockForward(state);
	}

	const wordEnd = findWordBoundaryForward(block, sel.anchor.offset);

	return state
		.transaction('input')
		.deleteTextAt(block.id, sel.anchor.offset, wordEnd)
		.setSelection(createCollapsedSelection(block.id, sel.anchor.offset))
		.build();
}

/** Handles Cmd+Backspace: delete to start of line/block. */
export function deleteSoftLineBackward(state: EditorState): Transaction | null {
	const sel = state.selection;

	if (isNodeSelection(sel)) {
		return deleteNodeSelection(state, sel);
	}
	if (isGapCursor(sel)) return null;

	if (!isCollapsed(sel)) {
		return deleteSelectionCommand(state);
	}

	const block = state.getBlock(sel.anchor.blockId);
	if (!block) return null;

	if (sel.anchor.offset === 0) {
		return mergeBlockBackward(state);
	}

	return state
		.transaction('input')
		.deleteTextAt(block.id, 0, sel.anchor.offset)
		.setSelection(createCollapsedSelection(block.id, 0))
		.build();
}

/** Handles Cmd+Delete: delete to end of line/block. */
export function deleteSoftLineForward(state: EditorState): Transaction | null {
	const sel = state.selection;

	if (isNodeSelection(sel)) {
		return deleteNodeSelection(state, sel);
	}
	if (isGapCursor(sel)) return null;

	if (!isCollapsed(sel)) {
		return deleteSelectionCommand(state);
	}

	const block = state.getBlock(sel.anchor.blockId);
	if (!block) return null;

	const blockLen = getBlockLength(block);
	if (sel.anchor.offset === blockLen) {
		return mergeBlockForward(state);
	}

	return state
		.transaction('input')
		.deleteTextAt(block.id, sel.anchor.offset, blockLen)
		.setSelection(createCollapsedSelection(block.id, sel.anchor.offset))
		.build();
}
