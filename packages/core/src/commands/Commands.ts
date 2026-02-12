/**
 * Editor commands for formatting, text manipulation, and history.
 */

import {
	type BlockNode,
	type Mark,
	type MarkType,
	generateBlockId,
	getBlockLength,
	getBlockMarksAtOffset,
	getContentAtOffset,
	getInlineChildren,
	hasMark,
	isTextNode,
} from '../model/Document.js';
import { isMarkAllowed } from '../model/Schema.js';
import {
	createCollapsedSelection,
	createSelection,
	isCollapsed,
	selectionRange,
} from '../model/Selection.js';
import { type BlockId, markType as mkType } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import type { TransactionBuilder } from '../state/Transaction.js';

// --- Feature Configuration ---

export interface FeatureConfig {
	readonly bold: boolean;
	readonly italic: boolean;
	readonly underline: boolean;
}

const defaultFeatures: FeatureConfig = { bold: true, italic: true, underline: true };

// --- Mark Commands ---

/**
 * Toggles a mark on the current selection.
 * If collapsed, toggles stored marks. If range, applies/removes from text.
 */
export function toggleMark(
	state: EditorState,
	markType: MarkType,
	features: FeatureConfig = defaultFeatures,
): Transaction | null {
	if (isFeatureGated(markType, features)) return null;
	if (!isMarkAllowed(state.schema, markType)) return null;

	const mark: Mark = { type: markType };
	const sel = state.selection;

	if (isCollapsed(sel)) {
		// Toggle stored marks
		const anchorBlock = state.getBlock(sel.anchor.blockId);
		if (!anchorBlock) return null;
		const currentMarks = state.storedMarks ?? getBlockMarksAtOffset(anchorBlock, sel.anchor.offset);
		const hasIt = hasMark(currentMarks, markType);
		const newMarks = hasIt
			? currentMarks.filter((m) => m.type !== markType)
			: [...currentMarks, mark];

		return state
			.transaction('command')
			.setStoredMarks(newMarks, state.storedMarks)
			.setSelection(sel)
			.build();
	}

	// Range selection — apply/remove mark to all blocks in range
	const blockOrder = state.getBlockOrder();
	const range = selectionRange(sel, blockOrder);
	const builder = state.transaction('command');

	const fromIdx = blockOrder.indexOf(range.from.blockId);
	const toIdx = blockOrder.indexOf(range.to.blockId);

	// Determine if we should add or remove
	const shouldRemove = isMarkActiveInRange(state, markType);

	for (let i = fromIdx; i <= toIdx; i++) {
		const blockId = blockOrder[i];
		if (!blockId) continue;
		const block = state.getBlock(blockId);
		if (!block) continue;
		const blockLen = getBlockLength(block);

		const from = i === fromIdx ? range.from.offset : 0;
		const to = i === toIdx ? range.to.offset : blockLen;

		if (from === to) continue;

		if (shouldRemove) {
			builder.removeMark(blockId, from, to, mark);
		} else {
			builder.addMark(blockId, from, to, mark);
		}
	}

	builder.setSelection(sel);
	return builder.build();
}

/** Checks if a mark is active across the entire selection range. */
function isMarkActiveInRange(state: EditorState, markType: MarkType): boolean {
	const sel = state.selection;
	const blockOrder = state.getBlockOrder();
	const range = selectionRange(sel, blockOrder);

	const fromIdx = blockOrder.indexOf(range.from.blockId);
	const toIdx = blockOrder.indexOf(range.to.blockId);

	for (let i = fromIdx; i <= toIdx; i++) {
		const blockId = blockOrder[i];
		if (!blockId) continue;
		const block = state.getBlock(blockId);
		if (!block) continue;
		const blockLen = getBlockLength(block);
		const from = i === fromIdx ? range.from.offset : 0;
		const to = i === toIdx ? range.to.offset : blockLen;

		if (!isMarkActiveInBlock(block, from, to, markType)) return false;
	}

	return true;
}

function isMarkActiveInBlock(
	block: BlockNode,
	from: number,
	to: number,
	markType: MarkType,
): boolean {
	if (from === to) return false;
	let pos = 0;
	for (const child of getInlineChildren(block)) {
		if (isTextNode(child)) {
			const childEnd = pos + child.text.length;
			if (childEnd > from && pos < to) {
				if (!hasMark(child.marks, markType)) return false;
			}
			pos = childEnd;
		} else {
			// InlineNode: skip (width 1, no marks)
			pos += 1;
		}
	}
	return true;
}

export function toggleBold(state: EditorState, features?: FeatureConfig): Transaction | null {
	return toggleMark(state, mkType('bold'), features);
}

export function toggleItalic(state: EditorState, features?: FeatureConfig): Transaction | null {
	return toggleMark(state, mkType('italic'), features);
}

export function toggleUnderline(state: EditorState, features?: FeatureConfig): Transaction | null {
	return toggleMark(state, mkType('underline'), features);
}

// --- Text Commands ---

/** Inserts text at the current selection, replacing any selected range. */
export function insertTextCommand(
	state: EditorState,
	text: string,
	origin: 'input' | 'paste' = 'input',
): Transaction {
	const sel = state.selection;
	const builder = state.transaction(origin);
	const marks = resolveActiveMarks(state);

	if (!isCollapsed(sel)) {
		addDeleteSelectionSteps(state, builder);
	}

	const range = isCollapsed(sel) ? null : selectionRange(sel, state.getBlockOrder());
	const insertBlockId = range ? range.from.blockId : sel.anchor.blockId;
	const insertOffset = range ? range.from.offset : sel.anchor.offset;

	builder.insertText(insertBlockId, insertOffset, text, marks);
	builder.setSelection(createCollapsedSelection(insertBlockId, insertOffset + text.length));

	return builder.build();
}

/** Deletes the current selection. */
export function deleteSelectionCommand(state: EditorState): Transaction | null {
	if (isCollapsed(state.selection)) return null;

	const builder = state.transaction('input');
	addDeleteSelectionSteps(state, builder);

	const range = selectionRange(state.selection, state.getBlockOrder());
	builder.setSelection(createCollapsedSelection(range.from.blockId, range.from.offset));

	return builder.build();
}

/** Handles backspace key. */
export function deleteBackward(state: EditorState): Transaction | null {
	const sel = state.selection;

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

/** Splits the current block at the cursor position (Enter key). */
export function splitBlockCommand(state: EditorState): Transaction | null {
	const sel = state.selection;
	const builder = state.transaction('input');

	if (!isCollapsed(sel)) {
		addDeleteSelectionSteps(state, builder);
	}

	const blockId = isCollapsed(sel)
		? sel.anchor.blockId
		: selectionRange(sel, state.getBlockOrder()).from.blockId;
	const offset = isCollapsed(sel)
		? sel.anchor.offset
		: selectionRange(sel, state.getBlockOrder()).from.offset;

	const newBlockId = generateBlockId();

	// splitBlock operates at the same level in the tree — the StepApplication
	// handles this correctly because it looks up the block by ID recursively.
	builder.splitBlock(blockId, offset, newBlockId);
	builder.setSelection(createCollapsedSelection(newBlockId, 0));

	return builder.build();
}

/** Checks whether two blocks share the same parent in the document tree. */
export function sharesParent(state: EditorState, blockIdA: BlockId, blockIdB: BlockId): boolean {
	const pathA = state.getNodePath(blockIdA);
	const pathB = state.getNodePath(blockIdB);
	if (!pathA || !pathB) return false;
	if (pathA.length !== pathB.length) return false;
	// Compare parent paths (all but last element)
	for (let i = 0; i < pathA.length - 1; i++) {
		if (pathA[i] !== pathB[i]) return false;
	}
	return true;
}

/** Checks whether a block is inside an isolating node (e.g. table_cell). */
export function isInsideIsolating(state: EditorState, blockId: BlockId): boolean {
	const getNodeSpec = state.schema.getNodeSpec;
	if (!getNodeSpec) return false;
	const path = state.getNodePath(blockId);
	if (!path || path.length <= 1) return false;

	// Check ancestors (not the block itself)
	for (let i = 0; i < path.length - 1; i++) {
		const ancestorId = path[i];
		if (!ancestorId) continue;
		const ancestor = state.getBlock(ancestorId);
		if (!ancestor) continue;
		const spec = getNodeSpec(ancestor.type);
		if (spec?.isolating) return true;
	}
	return false;
}

/** Merges the current block with the previous block, respecting isolating boundaries. */
export function mergeBlockBackward(state: EditorState): Transaction | null {
	const sel = state.selection;
	const blockOrder = state.getBlockOrder();
	const blockIdx = blockOrder.indexOf(sel.anchor.blockId);

	if (blockIdx <= 0) return null;

	const prevBlockId = blockOrder[blockIdx - 1];
	if (!prevBlockId) return null;

	// Prevent merge across isolating boundaries
	if (!sharesParent(state, sel.anchor.blockId, prevBlockId)) {
		if (isInsideIsolating(state, sel.anchor.blockId)) return null;
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

/** Merges the next block into the current block, respecting isolating boundaries. */
function mergeBlockForward(state: EditorState): Transaction | null {
	const sel = state.selection;
	const blockOrder = state.getBlockOrder();
	const blockIdx = blockOrder.indexOf(sel.anchor.blockId);

	if (blockIdx >= blockOrder.length - 1) return null;

	const nextBlockId = blockOrder[blockIdx + 1];
	if (!nextBlockId) return null;

	// Prevent merge across isolating boundaries
	if (!sharesParent(state, sel.anchor.blockId, nextBlockId)) {
		if (isInsideIsolating(state, sel.anchor.blockId)) return null;
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

// --- Check Commands ---

/** Checks if a mark is active at the current selection. */
export function isMarkActive(state: EditorState, markType: MarkType): boolean {
	const sel = state.selection;

	if (isCollapsed(sel)) {
		if (state.storedMarks) {
			return hasMark(state.storedMarks, markType);
		}
		const block = state.getBlock(sel.anchor.blockId);
		if (!block) return false;
		const marks = getBlockMarksAtOffset(block, sel.anchor.offset);
		return hasMark(marks, markType);
	}

	return isMarkActiveInRange(state, markType);
}

// --- Internal Helpers ---

function resolveActiveMarks(state: EditorState): readonly Mark[] {
	if (state.storedMarks) return state.storedMarks;

	const block = state.getBlock(state.selection.anchor.blockId);
	if (!block) return [];

	return getBlockMarksAtOffset(block, state.selection.anchor.offset);
}

export function addDeleteSelectionSteps(state: EditorState, builder: TransactionBuilder): void {
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

/**
 * Finds the word boundary backward from the given offset.
 * InlineNodes act as word boundaries.
 */
function findWordBoundaryBackward(block: BlockNode, offset: number): number {
	let pos = offset - 1;
	// Skip trailing whitespace
	while (pos >= 0) {
		const content = getContentAtOffset(block, pos);
		if (!content || content.kind === 'inline') break;
		if (!/\s/.test(content.char)) break;
		pos--;
	}
	// If at InlineNode, delete just it (treat as word boundary)
	if (pos >= 0) {
		const content = getContentAtOffset(block, pos);
		if (content?.kind === 'inline') return pos;
	}
	// Skip word characters until whitespace or InlineNode
	while (pos >= 0) {
		const content = getContentAtOffset(block, pos);
		if (!content || content.kind === 'inline') break;
		if (/\s/.test(content.char)) break;
		pos--;
	}
	return pos + 1;
}

/**
 * Finds the word boundary forward from the given offset.
 * InlineNodes act as word boundaries.
 */
function findWordBoundaryForward(block: BlockNode, offset: number): number {
	const len = getBlockLength(block);
	let pos = offset;
	// Skip word characters first
	while (pos < len) {
		const content = getContentAtOffset(block, pos);
		if (!content || content.kind === 'inline') break;
		if (/\s/.test(content.char)) break;
		pos++;
	}
	// If at InlineNode and haven't moved, delete just the InlineNode
	if (pos === offset && pos < len) {
		const content = getContentAtOffset(block, pos);
		if (content?.kind === 'inline') return pos + 1;
	}
	// Skip trailing whitespace
	while (pos < len) {
		const content = getContentAtOffset(block, pos);
		if (!content || content.kind === 'inline') break;
		if (!/\s/.test(content.char)) break;
		pos++;
	}
	return pos;
}

function isFeatureGated(type: MarkType, features: FeatureConfig): boolean {
	const key = type as string;
	if (key === 'bold') return !features.bold;
	if (key === 'italic') return !features.italic;
	if (key === 'underline') return !features.underline;
	return false;
}
