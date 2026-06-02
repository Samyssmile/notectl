/**
 * Helpers that map a clicked/selected/adjacent formula in the DOM or model back
 * to a {@link FormulaEditTarget} the overlay can edit. Inline DOM→offset mapping
 * reuses the editor's own `domPositionToState` resolver rather than re-deriving it.
 */

import { getInlineChildren, isInlineNode, walkInlineContent } from '../../model/Document.js';
import { isCollapsed, isNodeSelection, isTextSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import { domPositionToState } from '../../view/SelectionSync.js';
import type { FormulaEditTarget } from './FormulaOverlay.js';
import { readFormulaAttrs } from './FormulaRendering.js';
import { DISPLAY_MATH_TYPE, type FormulaAttrs, INLINE_MATH_TYPE } from './FormulaTypes.js';

/** Returns the inline math node's attributes at `offset` within a block, if any. */
function inlineMathAt(state: EditorState, blockId: BlockId, offset: number): FormulaAttrs | null {
	const block = state.getBlock(blockId);
	if (!block) return null;
	for (const { child, from } of walkInlineContent(getInlineChildren(block))) {
		if (from === offset && isInlineNode(child) && child.inlineType === INLINE_MATH_TYPE) {
			return readFormulaAttrs(child.attrs);
		}
	}
	return null;
}

/** Builds an edit target from a clicked inline math element. */
export function inlineEditTargetFromElement(
	container: HTMLElement,
	element: HTMLElement,
	state: EditorState,
): FormulaEditTarget | null {
	const pos = domPositionToState(container, element, 0);
	if (!pos) return null;
	const attrs = inlineMathAt(state, pos.blockId, pos.offset);
	if (!attrs) return null;
	return {
		kind: 'inline',
		blockId: pos.blockId,
		offset: pos.offset,
		latex: attrs.latex,
		alt: attrs.alt,
		fontSize: attrs.fontSize,
		rect: element.getBoundingClientRect(),
	};
}

/** Builds an edit target for a display math block. */
export function displayEditTarget(
	state: EditorState,
	blockId: BlockId,
	rect: DOMRect | null,
): FormulaEditTarget | null {
	const block = state.getBlock(blockId);
	if (!block || block.type !== DISPLAY_MATH_TYPE) return null;
	const attrs = readFormulaAttrs(block.attrs);
	const path = state.getNodePath(blockId) ?? [blockId];
	return {
		kind: 'display',
		path,
		latex: attrs.latex,
		alt: attrs.alt,
		fontSize: attrs.fontSize,
		rect,
	};
}

/** When the collapsed caret sits next to an inline formula, returns its edit target. */
export function adjacentInlineEditTarget(state: EditorState): FormulaEditTarget | null {
	const sel = state.selection;
	if (!isTextSelection(sel) || !isCollapsed(sel)) return null;
	const blockId = sel.anchor.blockId;
	const block = state.getBlock(blockId);
	if (!block) return null;
	const cursor = sel.anchor.offset;
	for (const { child, from, to } of walkInlineContent(getInlineChildren(block))) {
		if (!isInlineNode(child) || child.inlineType !== INLINE_MATH_TYPE) continue;
		if (to === cursor || from === cursor) {
			const attrs = readFormulaAttrs(child.attrs);
			return {
				kind: 'inline',
				blockId,
				offset: from,
				latex: attrs.latex,
				alt: attrs.alt,
				fontSize: attrs.fontSize,
				rect: null,
			};
		}
	}
	return null;
}

/** Returns the selected display-math block id when a NodeSelection targets one. */
export function selectedDisplayBlockId(state: EditorState): BlockId | null {
	const sel = state.selection;
	if (!isNodeSelection(sel)) return null;
	const block = state.getBlock(sel.nodeId);
	if (!block || block.type !== DISPLAY_MATH_TYPE) return null;
	return sel.nodeId;
}
