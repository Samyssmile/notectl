/**
 * Shared color mark operations for color-based mark plugins.
 * All functions are parameterized by mark type name so they work
 * identically for TextColor, Highlight, or any future color mark.
 */

import { forEachBlockInRange } from '../../commands/Commands.js';
import { type MarkAttrRegistry, isMarkOfType } from '../../model/AttrRegistry.js';
import { getBlockMarksAtOffset, hasMark } from '../../model/Document.js';
import {
	isCollapsed,
	isGapCursor,
	isNodeSelection,
	selectionRange,
} from '../../model/Selection.js';
import { markType } from '../../model/TypeBrands.js';
import type { MarkTypeName } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { PluginContext } from '../Plugin.js';
import { isValidCSSColor } from './ColorValidation.js';

/** Color mark type names that have `{ color: string }` attrs. */
type ColorMarkType = {
	[K in keyof MarkAttrRegistry]: MarkAttrRegistry[K] extends { color: string } ? K : never;
}[keyof MarkAttrRegistry];

/**
 * Returns the active color value for the given mark type at the current
 * selection, or `null` if the mark is not present.
 */
export function getActiveColor(state: EditorState, markTypeName: ColorMarkType): string | null {
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return null;

	if (isCollapsed(sel)) {
		if (state.storedMarks) {
			const mark = state.storedMarks.find((m) => m.type === markTypeName);
			return mark && isMarkOfType(mark, markTypeName) ? (mark.attrs.color ?? null) : null;
		}
		const block = state.getBlock(sel.anchor.blockId);
		if (!block) return null;
		const marks = getBlockMarksAtOffset(block, sel.anchor.offset);
		const mark = marks.find((m) => m.type === markTypeName);
		return mark && isMarkOfType(mark, markTypeName) ? (mark.attrs.color ?? null) : null;
	}

	const block = state.getBlock(sel.anchor.blockId);
	if (!block) return null;
	const marks = getBlockMarksAtOffset(block, sel.anchor.offset);
	const mark = marks.find((m) => m.type === markTypeName);
	return mark && isMarkOfType(mark, markTypeName) ? (mark.attrs.color ?? null) : null;
}

/** Returns `true` when the given color mark is active at the current selection. */
export function isColorMarkActive(state: EditorState, markTypeName: ColorMarkType): boolean {
	return getActiveColor(state, markTypeName) !== null;
}

/**
 * Applies the given color to the selection. For collapsed selections,
 * sets stored marks. For range selections, removes then re-adds the mark.
 */
export function applyColorMark(
	context: PluginContext,
	state: EditorState,
	markTypeName: ColorMarkType,
	color: string,
): boolean {
	if (!isValidCSSColor(color)) return false;

	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return false;

	const typeName: MarkTypeName = markType(markTypeName);

	if (isCollapsed(sel)) {
		const anchorBlock = state.getBlock(sel.anchor.blockId);
		if (!anchorBlock) return false;
		const currentMarks = state.storedMarks ?? getBlockMarksAtOffset(anchorBlock, sel.anchor.offset);
		const withoutMark = currentMarks.filter((m) => m.type !== markTypeName);
		const newMarks = [...withoutMark, { type: typeName, attrs: { color } }];

		const tr = state
			.transaction('command')
			.setStoredMarks(newMarks, state.storedMarks)
			.setSelection(sel)
			.build();
		context.dispatch(tr);
		return true;
	}

	const range = selectionRange(sel, state.getBlockOrder());
	const builder = state.transaction('command');
	const mark = { type: typeName, attrs: { color } };

	forEachBlockInRange(state, range, (blockId, from, to) => {
		builder.removeMark(blockId, from, to, { type: typeName });
		builder.addMark(blockId, from, to, mark);
	});

	builder.setSelection(sel);
	context.dispatch(builder.build());
	return true;
}

/**
 * Removes the given color mark from the selection.
 * Returns `false` when the mark was not present.
 */
export function removeColorMark(
	context: PluginContext,
	state: EditorState,
	markTypeName: ColorMarkType,
): boolean {
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return false;

	const typeName: MarkTypeName = markType(markTypeName);

	if (isCollapsed(sel)) {
		const anchorBlock = state.getBlock(sel.anchor.blockId);
		if (!anchorBlock) return false;
		const currentMarks = state.storedMarks ?? getBlockMarksAtOffset(anchorBlock, sel.anchor.offset);
		if (!hasMark(currentMarks, typeName)) return false;

		const newMarks = currentMarks.filter((m) => m.type !== markTypeName);
		const tr = state
			.transaction('command')
			.setStoredMarks(newMarks, state.storedMarks)
			.setSelection(sel)
			.build();
		context.dispatch(tr);
		return true;
	}

	const range = selectionRange(sel, state.getBlockOrder());
	const builder = state.transaction('command');

	forEachBlockInRange(state, range, (blockId, from, to) => {
		builder.removeMark(blockId, from, to, { type: typeName });
	});

	builder.setSelection(sel);
	context.dispatch(builder.build());
	return true;
}
