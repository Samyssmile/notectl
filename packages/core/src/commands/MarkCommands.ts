/**
 * Mark-related commands: toggling bold/italic/underline and checking
 * whether a mark is active.
 */

import {
	type BlockNode,
	type Mark,
	type MarkType,
	getBlockLength,
	getBlockMarksAtOffset,
	getInlineChildren,
	hasMark,
	isTextNode,
} from '../model/Document.js';
import { isMarkAllowed } from '../model/Schema.js';
import { isCollapsed, isGapCursor, isNodeSelection, selectionRange } from '../model/Selection.js';
import { markType as mkType } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { forEachBlockInRange } from './Commands.js';

// --- Feature Configuration ---

export interface FeatureConfig {
	readonly bold: boolean;
	readonly italic: boolean;
	readonly underline: boolean;
}

const defaultFeatures: FeatureConfig = { bold: true, italic: true, underline: true };

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
	if (isNodeSelection(state.selection) || isGapCursor(state.selection)) return null;

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
	const range = selectionRange(sel, state.getBlockOrder());
	const builder = state.transaction('command');

	// Determine if we should add or remove
	const shouldRemove = isMarkActiveInRange(state, markType);

	forEachBlockInRange(state, range, (blockId, from, to) => {
		if (shouldRemove) {
			builder.removeMark(blockId, from, to, mark);
		} else {
			builder.addMark(blockId, from, to, mark);
		}
	});

	builder.setSelection(sel);
	return builder.build();
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

/** Checks if a mark is active at the current selection. */
export function isMarkActive(state: EditorState, markType: MarkType): boolean {
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return false;

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

/** Checks if a mark is active across the entire selection range. */
function isMarkActiveInRange(state: EditorState, markType: MarkType): boolean {
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return false;
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

function isFeatureGated(type: MarkType, features: FeatureConfig): boolean {
	const key = type as string;
	if (key === 'bold') return !features.bold;
	if (key === 'italic') return !features.italic;
	if (key === 'underline') return !features.underline;
	return false;
}
