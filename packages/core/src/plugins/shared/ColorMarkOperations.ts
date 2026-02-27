/**
 * Shared color mark operations for color-based mark plugins.
 * All functions are parameterized by mark type name so they work
 * identically for TextColor, Highlight, or any future color mark.
 *
 * Delegates to the generic AttributedMarkCommands helpers for the
 * collapsed-vs-range branching logic.
 */

import {
	applyAttributedMark,
	getMarkAttrAtSelection,
	removeAttributedMark,
} from '../../commands/AttributedMarkCommands.js';
import type { MarkAttrRegistry } from '../../model/AttrRegistry.js';
import { markType } from '../../model/TypeBrands.js';
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
	return getMarkAttrAtSelection(state, markTypeName, (m) => m.attrs.color ?? null);
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

	const mark = { type: markType(markTypeName), attrs: { color } };
	const tr = applyAttributedMark(state, mark);
	if (!tr) return false;

	context.dispatch(tr);
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
	const tr = removeAttributedMark(state, markType(markTypeName));
	if (!tr) return false;

	context.dispatch(tr);
	return true;
}
