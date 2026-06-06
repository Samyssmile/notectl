/**
 * Resolves the marks active at a collapsed cursor for insertion and toolbar
 * state. Centralizes the `storedMarks ?? derived-marks` lookup that several
 * command modules previously duplicated, and makes that derivation honor
 * mark inclusivity (see {@link MarkSpec.inclusive}) so non-inclusive marks
 * such as links do not bleed onto text typed at their right boundary.
 */

import type { Mark } from '../model/Document.js';
import { getCursorMarks } from '../model/Document.js';
import type { Schema } from '../model/Schema.js';
import { isCollapsed, isTextSelection } from '../model/Selection.js';
import type { MarkTypeName } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';

/** A mark extends onto adjacent typing unless its spec opts out via `inclusive: false`. */
export function isMarkInclusive(schema: Schema, type: MarkTypeName): boolean {
	return schema.getMarkSpec?.(type)?.inclusive !== false;
}

/**
 * Returns the marks a collapsed cursor carries: stored marks when present,
 * otherwise the inclusivity-aware marks derived from the surrounding content.
 * Returns an empty set for non-text or non-collapsed selections.
 */
export function resolveCursorMarks(state: EditorState): readonly Mark[] {
	if (state.storedMarks) return state.storedMarks;

	const sel = state.selection;
	if (!isTextSelection(sel) || !isCollapsed(sel)) return [];

	const block = state.getBlock(sel.anchor.blockId);
	if (!block) return [];

	return getCursorMarks(block, sel.anchor.offset, (type) => isMarkInclusive(state.schema, type));
}
