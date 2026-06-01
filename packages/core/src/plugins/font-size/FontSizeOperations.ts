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
import type { InlineNode } from '../../model/Document.js';
import { getInlineChildren, isInlineNode, walkInlineContent } from '../../model/Document.js';
import { isCollapsed, isNodeSelection, isTextSelection } from '../../model/Selection.js';
import { type BlockId, markType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { PluginContext } from '../Plugin.js';
import { dispatchIfPresent } from '../shared/PluginHelpers.js';

// --- Node-level font sizing ---
//
// Marks only apply to text, so they cannot size atomic nodes such as a formula
// (an inline node carries no marks; a display formula is a void block). Instead,
// a node opts into font sizing by declaring a `fontSize` attribute in its schema
// spec; the font-size controls then read/write that attribute. This stays generic
// (no formula-specific coupling) — any node or inline node can opt in the same way.

type NodeAttrs = Readonly<Record<string, string | number | boolean>>;

type NodeFontSizeTarget =
	| { readonly kind: 'block'; readonly path: readonly BlockId[]; readonly attrs: NodeAttrs }
	| {
			readonly kind: 'inline';
			readonly blockId: BlockId;
			readonly offset: number;
			readonly attrs: NodeAttrs;
	  };

function specDeclaresFontSize(
	spec: { readonly attrs?: Readonly<Record<string, unknown>> } | undefined,
): boolean {
	return spec?.attrs?.fontSize !== undefined;
}

/**
 * Resolves the node the current selection targets for font sizing, when that
 * node's schema spec declares a `fontSize` attribute: a void/selectable block
 * under a NodeSelection, or a single atomic inline node under a width-1 text
 * selection. Returns null for ordinary text (which uses the fontSize mark).
 */
function nodeFontSizeTarget(state: EditorState): NodeFontSizeTarget | null {
	const sel = state.selection;
	if (isNodeSelection(sel)) {
		const block = state.getBlock(sel.nodeId);
		if (!block || !specDeclaresFontSize(state.schema.getNodeSpec?.(block.type))) return null;
		const path: readonly BlockId[] = state.getNodePath(sel.nodeId) ?? [sel.nodeId];
		return { kind: 'block', path, attrs: block.attrs ?? {} };
	}
	const inline = singleSelectedInlineNode(state);
	if (inline && specDeclaresFontSize(state.schema.getInlineNodeSpec?.(inline.node.inlineType))) {
		return {
			kind: 'inline',
			blockId: inline.blockId,
			offset: inline.offset,
			attrs: inline.node.attrs,
		};
	}
	return null;
}

/** Returns the single inline node a width-1 text selection covers, if any. */
function singleSelectedInlineNode(
	state: EditorState,
): { readonly node: InlineNode; readonly blockId: BlockId; readonly offset: number } | null {
	const sel = state.selection;
	if (!isTextSelection(sel) || isCollapsed(sel)) return null;
	if (sel.anchor.blockId !== sel.head.blockId) return null;
	const from: number = Math.min(sel.anchor.offset, sel.head.offset);
	const to: number = Math.max(sel.anchor.offset, sel.head.offset);
	if (to - from !== 1) return null;

	const block = state.getBlock(sel.anchor.blockId);
	if (!block) return null;
	for (const { child, from: childFrom } of walkInlineContent(getInlineChildren(block))) {
		if (childFrom === from && isInlineNode(child)) {
			return { node: child, blockId: sel.anchor.blockId, offset: from };
		}
	}
	return null;
}

/** The node's current fontSize value, or null when unset. */
function nodeFontSizeValue(target: NodeFontSizeTarget): string | null {
	const fontSize = target.attrs.fontSize;
	return typeof fontSize === 'string' && fontSize.length > 0 ? fontSize : null;
}

/** Writes `size` (or '' to clear) onto the target node's fontSize attr, preserving the rest. */
function dispatchNodeFontSize(
	context: PluginContext,
	state: EditorState,
	target: NodeFontSizeTarget,
	size: string,
): boolean {
	const nextAttrs: Record<string, string | number | boolean> = { ...target.attrs, fontSize: size };
	const builder = state.transaction('command');
	if (target.kind === 'block') {
		builder.setNodeAttr(target.path, nextAttrs);
	} else {
		builder.setInlineNodeAttr(target.blockId, target.offset, nextAttrs);
	}
	context.dispatch(builder.build());
	return true;
}

// --- State Queries ---

/** Returns the raw fontSize CSS value at the current selection, or null. */
export function getActiveSize(state: EditorState): string | null {
	const target = nodeFontSizeTarget(state);
	if (target) return nodeFontSizeValue(target);
	return getMarkAttrAtSelection(state, 'fontSize', (m) => m.attrs.size ?? null);
}

/** Returns the active font size as a number, falling back to defaultSize. */
export function getActiveSizeNumeric(state: EditorState, defaultSize: number): number {
	const raw: string | null = getActiveSize(state);
	if (!raw) return defaultSize;
	const parsed: number = Number.parseInt(raw, 10);
	return Number.isNaN(parsed) ? defaultSize : parsed;
}

/** Returns true when the selection carries a fontSize (mark or node attribute). */
export function isFontSizeActive(state: EditorState): boolean {
	const target = nodeFontSizeTarget(state);
	if (target) return nodeFontSizeValue(target) !== null;
	return isAttributedMarkActive(state, 'fontSize');
}

// --- Commands ---

/**
 * Applies the given CSS size to the selection: as a node `fontSize` attribute
 * when a font-size-aware node is selected (e.g. a formula), otherwise as a
 * fontSize mark on the selected text.
 */
export function applyFontSize(context: PluginContext, state: EditorState, size: string): boolean {
	const target = nodeFontSizeTarget(state);
	if (target) return dispatchNodeFontSize(context, state, target, size);
	const mark = { type: markType('fontSize'), attrs: { size } };
	return dispatchIfPresent(context, applyAttributedMark(state, mark));
}

/** Removes the fontSize (node attribute or mark) from the current selection. */
export function removeFontSize(context: PluginContext, state: EditorState): boolean {
	const target = nodeFontSizeTarget(state);
	if (target) {
		if (nodeFontSizeValue(target) === null) return false;
		return dispatchNodeFontSize(context, state, target, '');
	}
	return dispatchIfPresent(context, removeAttributedMark(state, markType('fontSize')));
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
