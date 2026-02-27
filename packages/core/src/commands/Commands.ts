/**
 * Core editor commands and barrel re-exports from submodules.
 *
 * This module contains text insertion, block splitting, block merging,
 * selection deletion, and select-all. Mark, delete, gap-cursor, node-selection,
 * and word-boundary commands are re-exported from their respective modules.
 */

import {
	type Mark,
	createInlineNode,
	generateBlockId,
	getBlockLength,
	getBlockMarksAtOffset,
} from '../model/Document.js';
import {
	isInsideIsolating,
	isIsolatingBlock,
	isVoidBlock,
	sharesParent,
} from '../model/NavigationUtils.js';
import { findNodePath } from '../model/NodeResolver.js';
import type { SelectionRange } from '../model/Selection.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	createSelection,
	isCollapsed,
	isGapCursor,
	isNodeSelection,
	selectionRange,
} from '../model/Selection.js';
import { type BlockId, inlineType } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import type { TransactionBuilder } from '../state/Transaction.js';
import { resolveInsertPoint } from './CommandHelpers.js';
import { insertParagraphAtGap, insertTextAtGap } from './GapCursorCommands.js';
import {
	deleteNodeSelection,
	insertParagraphAfterNodeSelection,
	insertTextAfterNodeSelection,
} from './NodeSelectionCommands.js';

// --- Re-exports from submodules ---

export {
	canCrossBlockBoundary,
	isInsideIsolating,
	isIsolatingBlock,
	isVoidBlock,
	sharesParent,
} from '../model/NavigationUtils.js';

export type { FeatureConfig } from './MarkCommands.js';
export {
	isMarkActive,
	toggleBold,
	toggleItalic,
	toggleMark,
	toggleUnderline,
} from './MarkCommands.js';

export {
	deleteBackward,
	deleteForward,
	deleteSoftLineBackward,
	deleteSoftLineForward,
	deleteWordBackward,
	deleteWordForward,
} from './DeleteCommands.js';

export {
	deleteNodeSelection,
	findFirstLeafBlockId,
	findLastLeafBlockId,
	insertParagraphAfterNodeSelection,
	insertTextAfterNodeSelection,
	navigateArrowIntoVoid,
} from './NodeSelectionCommands.js';

export {
	deleteBackwardAtGap,
	deleteForwardAtGap,
	insertParagraphAtGap,
	insertTextAtGap,
} from './GapCursorCommands.js';

export {
	findWordBoundaryBackward,
	findWordBoundaryForward,
} from './WordBoundary.js';

export {
	applyAttributedMark,
	getMarkAttrAtSelection,
	isAttributedMarkActive,
	removeAttributedMark,
} from './AttributedMarkCommands.js';

// --- Range Iteration ---

/**
 * Iterates over each block in the given selection range, invoking the callback
 * with the block ID, per-block start offset, and per-block end offset.
 * Blocks where `from === to` are skipped automatically.
 */
export function forEachBlockInRange(
	state: EditorState,
	range: SelectionRange,
	callback: (blockId: BlockId, from: number, to: number) => void,
): void {
	const blockOrder: readonly BlockId[] = state.getBlockOrder();
	const fromIdx: number = blockOrder.indexOf(range.from.blockId);
	const toIdx: number = blockOrder.indexOf(range.to.blockId);

	for (let i: number = fromIdx; i <= toIdx; i++) {
		const blockId: BlockId | undefined = blockOrder[i];
		if (!blockId) continue;
		const block = state.getBlock(blockId);
		if (!block) continue;

		const from: number = i === fromIdx ? range.from.offset : 0;
		const to: number = i === toIdx ? range.to.offset : getBlockLength(block);

		if (from === to) continue;
		callback(blockId, from, to);
	}
}

// --- Text Commands ---

/** Inserts text at the current selection, replacing any selected range. */
export function insertTextCommand(
	state: EditorState,
	text: string,
	origin: 'input' | 'paste' = 'input',
): Transaction {
	const sel = state.selection;

	// NodeSelection: insert paragraph after void block with the text
	if (isNodeSelection(sel)) {
		return insertTextAfterNodeSelection(state, sel, text, origin);
	}

	// GapCursor: insert paragraph at the gap position with the text
	if (isGapCursor(sel)) {
		return insertTextAtGap(state, sel, text, origin);
	}

	const builder = state.transaction(origin);
	const marks = resolveActiveMarks(state);

	if (!isCollapsed(sel)) {
		addDeleteSelectionSteps(state, builder);
	}

	const { blockId: insertBlockId, offset: insertOffset } = resolveInsertPoint(
		sel,
		state.getBlockOrder(),
	);

	builder.insertText(insertBlockId, insertOffset, text, marks);
	builder.setSelection(createCollapsedSelection(insertBlockId, insertOffset + text.length));

	return builder.build();
}

/** Deletes the current selection. */
export function deleteSelectionCommand(state: EditorState): Transaction | null {
	if (isNodeSelection(state.selection)) {
		return deleteNodeSelection(state, state.selection);
	}
	if (isGapCursor(state.selection)) return null;
	if (isCollapsed(state.selection)) return null;

	const builder = state.transaction('input');
	addDeleteSelectionSteps(state, builder);

	const range = selectionRange(state.selection, state.getBlockOrder());
	builder.setSelection(createCollapsedSelection(range.from.blockId, range.from.offset));

	return builder.build();
}

/** Splits the current block at the cursor position (Enter key). */
export function splitBlockCommand(state: EditorState): Transaction | null {
	const sel = state.selection;

	// NodeSelection: insert empty paragraph after the void block
	if (isNodeSelection(sel)) {
		return insertParagraphAfterNodeSelection(state, sel);
	}

	// GapCursor: insert empty paragraph at the gap position
	if (isGapCursor(sel)) {
		return insertParagraphAtGap(state, sel);
	}

	const builder = state.transaction('input');

	if (!isCollapsed(sel)) {
		addDeleteSelectionSteps(state, builder);
	}

	const { blockId, offset } = resolveInsertPoint(sel, state.getBlockOrder());
	const newBlockId = generateBlockId();

	// splitBlock operates at the same level in the tree — the StepApplication
	// handles this correctly because it looks up the block by ID recursively.
	builder.splitBlock(blockId, offset, newBlockId);
	builder.setSelection(createCollapsedSelection(newBlockId, 0));

	return builder.build();
}

/** Inserts a hard line break (InlineNode) at the current cursor position. */
export function insertHardBreakCommand(state: EditorState): Transaction | null {
	const sel = state.selection;

	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

	const builder = state.transaction('input');

	if (!isCollapsed(sel)) {
		addDeleteSelectionSteps(state, builder);
	}

	const { blockId: insertBlockId, offset: insertOffset } = resolveInsertPoint(
		sel,
		state.getBlockOrder(),
	);

	const hardBreak = createInlineNode(inlineType('hard_break'));
	builder.insertInlineNode(insertBlockId, insertOffset, hardBreak);
	builder.setSelection(createCollapsedSelection(insertBlockId, insertOffset + 1));

	return builder.build();
}

/**
 * Merges the current block with the previous block, respecting
 * isolating boundaries and void blocks.
 */
export function mergeBlockBackward(state: EditorState): Transaction | null {
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;
	const blockOrder = state.getBlockOrder();
	const blockIdx = blockOrder.indexOf(sel.anchor.blockId);

	if (blockIdx <= 0) return null;

	const prevBlockId = blockOrder[blockIdx - 1];
	if (!prevBlockId) return null;

	// Never merge isolating blocks directly (e.g. table cells).
	if (isIsolatingBlock(state, sel.anchor.blockId) || isIsolatingBlock(state, prevBlockId)) {
		return null;
	}

	// Prevent merge across isolating boundaries
	if (!sharesParent(state, sel.anchor.blockId, prevBlockId)) {
		if (isInsideIsolating(state, sel.anchor.blockId)) return null;
	}

	// If previous block is void, select it instead of merging
	if (isVoidBlock(state, prevBlockId)) {
		const path = findNodePath(state.doc, prevBlockId) ?? [];
		return state
			.transaction('input')
			.setSelection(createNodeSelection(prevBlockId, path as BlockId[]))
			.build();
	}

	const prevBlock = state.getBlock(prevBlockId);
	if (!prevBlock) return null;
	const prevLen = getBlockLength(prevBlock);

	return state
		.transaction('input')
		.mergeBlocksAt(prevBlockId, sel.anchor.blockId)
		.setSelection(createCollapsedSelection(prevBlockId, prevLen))
		.build();
}

/**
 * Merges the next block into the current block, respecting
 * isolating boundaries and void blocks.
 */
export function mergeBlockForward(state: EditorState): Transaction | null {
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;
	const blockOrder = state.getBlockOrder();
	const blockIdx = blockOrder.indexOf(sel.anchor.blockId);

	if (blockIdx >= blockOrder.length - 1) return null;

	const nextBlockId = blockOrder[blockIdx + 1];
	if (!nextBlockId) return null;

	// Never merge isolating blocks directly (e.g. table cells).
	if (isIsolatingBlock(state, sel.anchor.blockId) || isIsolatingBlock(state, nextBlockId)) {
		return null;
	}

	// Prevent merge across isolating boundaries
	if (!sharesParent(state, sel.anchor.blockId, nextBlockId)) {
		if (isInsideIsolating(state, sel.anchor.blockId)) return null;
	}

	// If next block is void, select it instead of merging
	if (isVoidBlock(state, nextBlockId)) {
		const path = findNodePath(state.doc, nextBlockId) ?? [];
		return state
			.transaction('input')
			.setSelection(createNodeSelection(nextBlockId, path as BlockId[]))
			.build();
	}

	return state
		.transaction('input')
		.mergeBlocksAt(sel.anchor.blockId, nextBlockId)
		.setSelection(createCollapsedSelection(sel.anchor.blockId, sel.anchor.offset))
		.build();
}

/** Selects all content in the editor. */
export function selectAll(state: EditorState): Transaction {
	const blocks = state.doc.children;
	const firstBlock = blocks[0];
	const lastBlock = blocks[blocks.length - 1];
	if (!firstBlock || !lastBlock)
		return state.transaction('command').setSelection(state.selection).build();
	const lastBlockLen = getBlockLength(lastBlock);

	return state
		.transaction('command')
		.setSelection(
			createSelection(
				{ blockId: firstBlock.id, offset: 0 },
				{ blockId: lastBlock.id, offset: lastBlockLen },
			),
		)
		.build();
}

// --- Internal Helpers ---

function resolveActiveMarks(state: EditorState): readonly Mark[] {
	if (state.storedMarks) return state.storedMarks;
	if (isNodeSelection(state.selection) || isGapCursor(state.selection)) return [];

	const block = state.getBlock(state.selection.anchor.blockId);
	if (!block) return [];

	return getBlockMarksAtOffset(block, state.selection.anchor.offset);
}

export function addDeleteSelectionSteps(state: EditorState, builder: TransactionBuilder): void {
	if (isNodeSelection(state.selection) || isGapCursor(state.selection)) return;
	const blockOrder = state.getBlockOrder();
	const range = selectionRange(state.selection, blockOrder);
	const fromIdx = blockOrder.indexOf(range.from.blockId);
	const toIdx = blockOrder.indexOf(range.to.blockId);

	if (fromIdx === toIdx) {
		builder.deleteTextAt(range.from.blockId, range.from.offset, range.to.offset);
	} else {
		const firstBlock = state.getBlock(range.from.blockId);
		if (!firstBlock) return;
		const firstLen = getBlockLength(firstBlock);

		// Delete from the end of first block
		if (range.from.offset < firstLen) {
			builder.deleteTextAt(range.from.blockId, range.from.offset, firstLen);
		}

		// Delete from start of last block
		if (range.to.offset > 0) {
			builder.deleteTextAt(range.to.blockId, 0, range.to.offset);
		}

		// Delete middle blocks entirely and merge last into first
		for (let i = fromIdx + 1; i < toIdx; i++) {
			const midBlockId = blockOrder[i];
			if (!midBlockId) continue;
			const midBlock = state.getBlock(midBlockId);
			if (!midBlock) continue;
			const midLen = getBlockLength(midBlock);
			if (midLen > 0) {
				builder.deleteTextAt(midBlockId, 0, midLen);
			}
			builder.mergeBlocksAt(range.from.blockId, midBlockId);
		}

		// Merge last block into first
		builder.mergeBlocksAt(range.from.blockId, range.to.blockId);
	}
}
