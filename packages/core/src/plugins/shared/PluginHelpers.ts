/**
 * Shared helper utilities for plugins.
 * Common operations extracted to avoid code duplication across plugins.
 */

import type { BlockNode } from '../../model/Document.js';
import { isNodeSelection, isTextSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';

/** Capitalizes the first character of a string. */
export function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Returns the block under the cursor, handling both TextSelection and NodeSelection. */
export function getSelectedBlock(state: EditorState): BlockNode | undefined {
	const sel = state.selection;
	if (isNodeSelection(sel)) return state.getBlock(sel.nodeId);
	if (isTextSelection(sel)) return state.getBlock(sel.anchor.blockId);
	return undefined;
}

/** Returns the block ID under the cursor, handling both TextSelection and NodeSelection. */
export function getSelectedBlockId(state: EditorState): BlockId | undefined {
	const sel = state.selection;
	if (isNodeSelection(sel)) return sel.nodeId;
	if (isTextSelection(sel)) return sel.anchor.blockId;
	return undefined;
}
