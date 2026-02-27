/**
 * Pure business logic for font-size state queries and transaction builders.
 * All functions are DOM-free and operate on EditorState / PluginContext.
 *
 * Delegates to the generic AttributedMarkCommands helpers for the
 * collapsed-vs-range branching logic.
 */

import {
	applyAttributedMark,
	getMarkAttrAtSelection,
	isAttributedMarkActive,
	removeAttributedMark,
} from '../../commands/AttributedMarkCommands.js';
import { markType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { PluginContext } from '../Plugin.js';

// --- State Queries ---

/** Returns the raw fontSize CSS value at the current selection, or null. */
export function getActiveSize(state: EditorState): string | null {
	return getMarkAttrAtSelection(state, 'fontSize', (m) => m.attrs.size ?? null);
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
	return isAttributedMarkActive(state, 'fontSize');
}

// --- Commands ---

/** Applies a fontSize mark with the given CSS size string to the selection. */
export function applyFontSize(context: PluginContext, state: EditorState, size: string): boolean {
	const mark = { type: markType('fontSize'), attrs: { size } };
	const tr = applyAttributedMark(state, mark);
	if (!tr) return false;

	context.dispatch(tr);
	return true;
}

/** Removes the fontSize mark from the current selection. */
export function removeFontSize(context: PluginContext, state: EditorState): boolean {
	const tr = removeAttributedMark(state, markType('fontSize'));
	if (!tr) return false;

	context.dispatch(tr);
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
