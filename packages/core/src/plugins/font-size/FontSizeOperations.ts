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
import type { BlockNode, InlineNode, Mark } from '../../model/Document.js';
import {
	getBlockLength,
	getInlineChildren,
	isInlineNode,
	isTextNode,
	walkInlineContent,
} from '../../model/Document.js';
import {
	isCollapsed,
	isNodeSelection,
	isTextSelection,
	selectionRange,
} from '../../model/Selection.js';
import { type BlockId, type MarkTypeName, markType } from '../../model/TypeBrands.js';
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

/** Reads a fontSize attr value from raw attrs, or null when unset. */
function readFontSize(attrs: NodeAttrs | undefined): string | null {
	const fontSize = attrs?.fontSize;
	return typeof fontSize === 'string' && fontSize.length > 0 ? fontSize : null;
}

/** Merges a fontSize value ('' clears it) into existing attrs, preserving the rest. */
function mergeFontSize(
	attrs: NodeAttrs | undefined,
	size: string,
): Record<string, string | number | boolean> {
	return { ...(attrs ?? {}), fontSize: size };
}

/** The node's current fontSize value, or null when unset. */
function nodeFontSizeValue(target: NodeFontSizeTarget): string | null {
	return readFontSize(target.attrs);
}

/** Writes `size` (or '' to clear) onto a single target node's fontSize attr. */
function dispatchNodeFontSize(
	context: PluginContext,
	state: EditorState,
	target: NodeFontSizeTarget,
	size: string,
): boolean {
	const builder = state.transaction('command');
	if (target.kind === 'block') {
		builder.setNodeAttr(target.path, mergeFontSize(target.attrs, size));
	} else {
		builder.setInlineNodeAttr(target.blockId, target.offset, mergeFontSize(target.attrs, size));
	}
	context.dispatch(builder.build());
	return true;
}

// --- Range carriers (text marks + font-size-aware nodes) ---
//
// A font-size operation over a selection range touches every "carrier" it spans:
// text runs (which take the fontSize mark) and atomic font-size-aware nodes such
// as formulas (which take the fontSize attr). This is what lets a select-all that
// includes a formula resize the formula alongside the surrounding text.

const FONT_SIZE_TYPE: MarkTypeName = markType('fontSize');

type FontSizeCarrier =
	| {
			readonly kind: 'text';
			readonly blockId: BlockId;
			readonly from: number;
			readonly to: number;
			readonly mark: Mark | undefined;
	  }
	| { readonly kind: 'blockNode'; readonly path: readonly BlockId[]; readonly attrs: NodeAttrs }
	| {
			readonly kind: 'inlineNode';
			readonly blockId: BlockId;
			readonly offset: number;
			readonly attrs: NodeAttrs;
	  };

/** Enumerates the font-size carriers within the current (non-collapsed) text range. */
function rangeCarriers(state: EditorState): FontSizeCarrier[] {
	const sel = state.selection;
	if (!isTextSelection(sel)) return [];
	const blockOrder: readonly BlockId[] = state.getBlockOrder();
	const range = selectionRange(sel, blockOrder);
	const fromIdx: number = blockOrder.indexOf(range.from.blockId);
	const toIdx: number = blockOrder.indexOf(range.to.blockId);
	const carriers: FontSizeCarrier[] = [];

	for (let i = fromIdx; i <= toIdx; i++) {
		const blockId = blockOrder[i];
		if (!blockId) continue;
		const block = state.getBlock(blockId);
		if (!block) continue;
		const from: number = i === fromIdx ? range.from.offset : 0;
		const to: number = i === toIdx ? range.to.offset : getBlockLength(block);

		// Atomic, font-size-aware block (e.g. a display formula): size the whole node.
		if (specDeclaresFontSize(state.schema.getNodeSpec?.(block.type))) {
			carriers.push({
				kind: 'blockNode',
				path: state.getNodePath(blockId) ?? [blockId],
				attrs: block.attrs ?? {},
			});
			continue;
		}
		if (from === to) continue;
		collectInlineCarriers(state, block, blockId, from, to, carriers);
	}
	return carriers;
}

/** Adds a text carrier (when the slice holds text) plus any font-size-aware inline nodes. */
function collectInlineCarriers(
	state: EditorState,
	block: BlockNode,
	blockId: BlockId,
	from: number,
	to: number,
	carriers: FontSizeCarrier[],
): void {
	let pos = 0;
	let hasText = false;
	let textMark: Mark | undefined;
	for (const child of getInlineChildren(block)) {
		if (isTextNode(child)) {
			const end: number = pos + child.text.length;
			if (child.text.length > 0 && end > from && pos < to) {
				hasText = true;
				if (!textMark) textMark = child.marks.find((m) => m.type === FONT_SIZE_TYPE);
			}
			pos = end;
		} else {
			if (
				pos >= from &&
				pos < to &&
				specDeclaresFontSize(state.schema.getInlineNodeSpec?.(child.inlineType))
			) {
				carriers.push({ kind: 'inlineNode', blockId, offset: pos, attrs: child.attrs });
			}
			pos += 1;
		}
	}
	if (hasText) carriers.push({ kind: 'text', blockId, from, to, mark: textMark });
}

/** Sizes every carrier in the range ('' clears). Returns false when nothing changed. */
function dispatchRangeFontSize(context: PluginContext, state: EditorState, size: string): boolean {
	const carriers: FontSizeCarrier[] = rangeCarriers(state);
	if (carriers.length === 0) return false;
	const builder = state.transaction('command');
	let changed = false;

	for (const carrier of carriers) {
		if (carrier.kind === 'text') {
			if (size === '') {
				if (carrier.mark) {
					builder.removeMark(carrier.blockId, carrier.from, carrier.to, carrier.mark);
					changed = true;
				}
			} else {
				if (carrier.mark)
					builder.removeMark(carrier.blockId, carrier.from, carrier.to, carrier.mark);
				builder.addMark(carrier.blockId, carrier.from, carrier.to, {
					type: FONT_SIZE_TYPE,
					attrs: { size },
				});
				changed = true;
			}
			continue;
		}
		const current: string | null = readFontSize(carrier.attrs);
		if (size === current || (size === '' && current === null)) continue;
		if (carrier.kind === 'blockNode') {
			builder.setNodeAttr(carrier.path, mergeFontSize(carrier.attrs, size));
		} else {
			builder.setInlineNodeAttr(
				carrier.blockId,
				carrier.offset,
				mergeFontSize(carrier.attrs, size),
			);
		}
		changed = true;
	}

	if (!changed) return false;
	builder.setSelection(state.selection);
	context.dispatch(builder.build());
	return true;
}

/** The set of fontSize values carried by font-size-aware nodes in the range, or null when none. */
function rangeNodeSizes(state: EditorState): Set<string> | null {
	const nodeAttrs: NodeAttrs[] = rangeCarriers(state)
		.filter((carrier) => carrier.kind !== 'text')
		.map((carrier) => carrier.attrs);
	if (nodeAttrs.length === 0) return null;
	return new Set(nodeAttrs.map((attrs) => readFontSize(attrs) ?? ''));
}

// --- State Queries ---

/** Returns the raw fontSize CSS value at the current selection, or null. */
export function getActiveSize(state: EditorState): string | null {
	const target = nodeFontSizeTarget(state);
	if (target) return nodeFontSizeValue(target);
	// Additive: when a range spans font-size-aware nodes (e.g. a formula) that all
	// share one explicit size, report it; otherwise read the text mark as before.
	const sizes = rangeNodeSizes(state);
	if (sizes && sizes.size === 1) {
		const [only] = sizes;
		if (only) return only;
	}
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
	const sizes = rangeNodeSizes(state);
	if (sizes && [...sizes].some((size) => size.length > 0)) return true;
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
	const sel = state.selection;
	if (!isTextSelection(sel)) return false;
	if (isCollapsed(sel)) {
		const mark = { type: markType('fontSize'), attrs: { size } };
		return dispatchIfPresent(context, applyAttributedMark(state, mark));
	}
	return dispatchRangeFontSize(context, state, size);
}

/** Removes the fontSize (node attribute or mark) from the current selection. */
export function removeFontSize(context: PluginContext, state: EditorState): boolean {
	const target = nodeFontSizeTarget(state);
	if (target) {
		if (nodeFontSizeValue(target) === null) return false;
		return dispatchNodeFontSize(context, state, target, '');
	}
	const sel = state.selection;
	if (!isTextSelection(sel)) return false;
	if (isCollapsed(sel)) {
		return dispatchIfPresent(context, removeAttributedMark(state, markType('fontSize')));
	}
	return dispatchRangeFontSize(context, state, '');
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
