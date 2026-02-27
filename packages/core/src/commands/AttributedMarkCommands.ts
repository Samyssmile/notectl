/**
 * Generic helpers for attributed marks (marks with key/value attrs).
 *
 * Unlike boolean marks (`bold`, `italic`) that toggle on/off, attributed
 * marks (`font`, `fontSize`, `textColor`, `highlight`) carry data and use
 * **replace** semantics: applying a new value removes the old one first.
 *
 * These helpers extract the duplicated collapsed-vs-range branching that
 * was previously copy-pasted across ColorMarkOperations, FontSizeOperations,
 * and FontPlugin.
 */

import { isMarkOfType } from '../model/AttrRegistry.js';
import type { MarkAttrRegistry } from '../model/AttrRegistry.js';
import type { Mark } from '../model/Document.js';
import { getBlockMarksAtOffset, hasMark } from '../model/Document.js';
import { isCollapsed, isGapCursor, isNodeSelection, selectionRange } from '../model/Selection.js';
import { markType } from '../model/TypeBrands.js';
import type { MarkTypeName } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { forEachBlockInRange } from './Commands.js';

/**
 * Applies an attributed mark to the current selection.
 *
 * - **Collapsed cursor**: replaces stored marks (filters out old mark of the
 *   same type, appends the new one).
 * - **Range selection**: removes then re-adds the mark in every block span.
 *
 * Returns the built `Transaction`, or `null` when the selection is
 * unsupported (node-selection / gap-cursor) or the anchor block is missing.
 */
export function applyAttributedMark(state: EditorState, mark: Mark): Transaction | null {
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

	const typeName: MarkTypeName = markType(mark.type as string);

	if (isCollapsed(sel)) {
		const anchorBlock = state.getBlock(sel.anchor.blockId);
		if (!anchorBlock) return null;
		const currentMarks: readonly Mark[] =
			state.storedMarks ?? getBlockMarksAtOffset(anchorBlock, sel.anchor.offset);
		const withoutMark: readonly Mark[] = currentMarks.filter((m) => m.type !== typeName);
		const newMarks: readonly Mark[] = [...withoutMark, mark];

		return state
			.transaction('command')
			.setStoredMarks(newMarks, state.storedMarks)
			.setSelection(sel)
			.build();
	}

	const range = selectionRange(sel, state.getBlockOrder());
	const builder = state.transaction('command');

	forEachBlockInRange(state, range, (blockId, from, to) => {
		builder.removeMark(blockId, from, to, { type: typeName });
		builder.addMark(blockId, from, to, mark);
	});

	builder.setSelection(sel);
	return builder.build();
}

/**
 * Removes an attributed mark from the current selection.
 *
 * - **Collapsed cursor**: filters the mark out of stored marks.
 *   Returns `null` when the mark was not present.
 * - **Range selection**: removes the mark across all block spans.
 *
 * Returns the built `Transaction`, or `null` when the selection is
 * unsupported or the mark is absent at a collapsed cursor.
 */
export function removeAttributedMark(
	state: EditorState,
	markTypeName: MarkTypeName,
): Transaction | null {
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

	if (isCollapsed(sel)) {
		const anchorBlock = state.getBlock(sel.anchor.blockId);
		if (!anchorBlock) return null;
		const currentMarks: readonly Mark[] =
			state.storedMarks ?? getBlockMarksAtOffset(anchorBlock, sel.anchor.offset);
		if (!hasMark(currentMarks, markTypeName)) return null;

		const newMarks: readonly Mark[] = currentMarks.filter((m) => m.type !== markTypeName);
		return state
			.transaction('command')
			.setStoredMarks(newMarks, state.storedMarks)
			.setSelection(sel)
			.build();
	}

	const range = selectionRange(sel, state.getBlockOrder());
	const builder = state.transaction('command');

	forEachBlockInRange(state, range, (blockId, from, to) => {
		builder.removeMark(blockId, from, to, { type: markTypeName });
	});

	builder.setSelection(sel);
	return builder.build();
}

/**
 * Extracts a typed attribute value from the mark at the current selection.
 *
 * Looks at stored marks (collapsed w/ stored), block marks at cursor offset
 * (collapsed w/o stored), or anchor-block marks (range).
 *
 * @param extractFn — Narrows the found mark and returns the desired value,
 *   or `null` when the mark's attrs don't match expectations.
 */
export function getMarkAttrAtSelection<K extends keyof MarkAttrRegistry, V>(
	state: EditorState,
	markTypeName: K,
	extractFn: (mark: Mark & { readonly type: K; readonly attrs: MarkAttrRegistry[K] }) => V | null,
): V | null {
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

	if (isCollapsed(sel) && state.storedMarks) {
		const found = state.storedMarks.find((m) => (m.type as string) === markTypeName);
		return found && isMarkOfType(found, markTypeName) ? extractFn(found) : null;
	}

	const block = state.getBlock(sel.anchor.blockId);
	if (!block) return null;
	const marks: readonly Mark[] = getBlockMarksAtOffset(block, sel.anchor.offset);
	const found = marks.find((m) => (m.type as string) === markTypeName);
	return found && isMarkOfType(found, markTypeName) ? extractFn(found) : null;
}

/**
 * Returns `true` when the given attributed mark type is present at the
 * current selection (collapsed or range).
 */
export function isAttributedMarkActive<K extends keyof MarkAttrRegistry>(
	state: EditorState,
	markTypeName: K,
): boolean {
	return getMarkAttrAtSelection(state, markTypeName, () => true as const) !== null;
}
