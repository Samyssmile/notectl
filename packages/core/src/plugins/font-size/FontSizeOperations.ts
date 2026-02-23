/**
 * Pure business logic for font-size state queries and transaction builders.
 * All functions are DOM-free and operate on EditorState / PluginContext.
 */

import { forEachBlockInRange } from '../../commands/Commands.js';
import { isMarkOfType } from '../../model/AttrRegistry.js';
import type { Mark } from '../../model/Document.js';
import { getBlockMarksAtOffset, hasMark } from '../../model/Document.js';
import { isCollapsed, isNodeSelection, selectionRange } from '../../model/Selection.js';
import { markType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { PluginContext } from '../Plugin.js';

// --- State Queries ---

/** Returns the raw fontSize CSS value at the current selection, or null. */
export function getActiveSize(state: EditorState): string | null {
	const sel = state.selection;
	if (isNodeSelection(sel)) return null;

	if (isCollapsed(sel) && state.storedMarks) {
		return extractFontSize(state.storedMarks);
	}

	const block = state.getBlock(sel.anchor.blockId);
	if (!block) return null;
	return extractFontSize(getBlockMarksAtOffset(block, sel.anchor.offset));
}

/** Returns the active font size as a number, falling back to defaultSize. */
export function getActiveSizeNumeric(state: EditorState, defaultSize: number): number {
	const raw: string | null = getActiveSize(state);
	if (!raw) return defaultSize;
	const parsed: number = Number.parseInt(raw, 10);
	return Number.isNaN(parsed) ? defaultSize : parsed;
}

/** Returns true when the selection carries a fontSize mark. */
export function isFontSizeActive(state: EditorState): boolean {
	return getActiveSize(state) !== null;
}

// --- Commands ---

/** Applies a fontSize mark with the given CSS size string to the selection. */
export function applyFontSize(context: PluginContext, state: EditorState, size: string): boolean {
	const sel = state.selection;
	if (isNodeSelection(sel)) return false;

	if (isCollapsed(sel)) {
		const anchorBlock = state.getBlock(sel.anchor.blockId);
		if (!anchorBlock) return false;
		const currentMarks = state.storedMarks ?? getBlockMarksAtOffset(anchorBlock, sel.anchor.offset);
		const withoutSize = currentMarks.filter((m) => m.type !== 'fontSize');
		const newMarks = [...withoutSize, { type: markType('fontSize'), attrs: { size } }];

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
	const mark = { type: markType('fontSize'), attrs: { size } };

	forEachBlockInRange(state, range, (blockId, from, to) => {
		builder.removeMark(blockId, from, to, { type: markType('fontSize') });
		builder.addMark(blockId, from, to, mark);
	});

	builder.setSelection(sel);
	context.dispatch(builder.build());
	return true;
}

/** Removes the fontSize mark from the current selection. */
export function removeFontSize(context: PluginContext, state: EditorState): boolean {
	const sel = state.selection;
	if (isNodeSelection(sel)) return false;

	if (isCollapsed(sel)) {
		const anchorBlock = state.getBlock(sel.anchor.blockId);
		if (!anchorBlock) return false;
		const currentMarks = state.storedMarks ?? getBlockMarksAtOffset(anchorBlock, sel.anchor.offset);
		if (!hasMark(currentMarks, markType('fontSize'))) return false;

		const newMarks = currentMarks.filter((m) => m.type !== 'fontSize');
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
		builder.removeMark(blockId, from, to, { type: markType('fontSize') });
	});

	builder.setSelection(sel);
	context.dispatch(builder.build());
	return true;
}

/** Steps the font size up or down through the preset list. */
export function stepFontSize(
	context: PluginContext,
	state: EditorState,
	direction: 'up' | 'down',
	sizes: readonly number[],
	defaultSize: number,
): boolean {
	const current: number = getActiveSizeNumeric(state, defaultSize);
	const next: number | null = getNextPresetSize(current, direction, sizes);
	if (next === null) return false;

	if (next === defaultSize) {
		return removeFontSize(context, state);
	}
	return applyFontSize(context, state, `${next}px`);
}

/**
 * Selects a specific font size: removes the mark when size equals the
 * default, otherwise applies the new size.
 */
export function selectSize(context: PluginContext, size: number, defaultSize: number): void {
	if (size === defaultSize) {
		context.executeCommand('removeFontSize');
	} else {
		applyFontSize(context, context.getState(), `${size}px`);
	}
}

// --- Helpers ---

/** Finds the next preset size in the given direction, or null at boundaries. */
export function getNextPresetSize(
	current: number,
	direction: 'up' | 'down',
	sizes: readonly number[],
): number | null {
	if (direction === 'up') {
		for (const size of sizes) {
			if (size > current) return size;
		}
		return null;
	}
	for (let i: number = sizes.length - 1; i >= 0; i--) {
		const size: number | undefined = sizes[i];
		if (size !== undefined && size < current) return size;
	}
	return null;
}

function extractFontSize(marks: readonly Mark[]): string | null {
	const mark = marks.find((m) => m.type === 'fontSize');
	return mark && isMarkOfType(mark, 'fontSize') ? (mark.attrs.size ?? null) : null;
}
