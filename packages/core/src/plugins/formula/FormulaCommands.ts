/**
 * Insert/update commands for formula nodes. These take already-built canonical
 * attributes (`mathml` + `latex` + `alt`); the authoring UI and input rules are
 * responsible for producing them via the LaTeX converter. Undo/redo come for
 * free from the transaction system.
 */

import { resolveInsertPoint } from '../../commands/CommandHelpers.js';
import { addDeleteSelectionSteps } from '../../commands/Commands.js';
import {
	createBlockNode,
	createInlineNode,
	getInlineChildren,
	isInlineNode,
} from '../../model/Document.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	isCollapsed,
	isTextSelection,
} from '../../model/Selection.js';
import { type BlockId, inlineType, nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import { getSelectedBlockId } from '../shared/PluginHelpers.js';
import { DISPLAY_MATH_TYPE, type FormulaAttrs, INLINE_MATH_TYPE } from './FormulaTypes.js';

function toNodeAttrs(attrs: FormulaAttrs): Record<string, string> {
	return { mathml: attrs.mathml, latex: attrs.latex, alt: attrs.alt };
}

/** Builds a transaction inserting an inline math node at the cursor (replacing a range). */
export function buildInsertInlineMathTr(
	state: EditorState,
	attrs: FormulaAttrs,
): Transaction | null {
	const sel = state.selection;
	if (!isTextSelection(sel)) return null;

	const builder = state.transaction('command');
	const node = createInlineNode(inlineType(INLINE_MATH_TYPE), toNodeAttrs(attrs));

	let landingId: BlockId | undefined;
	if (!isCollapsed(sel)) {
		landingId = addDeleteSelectionSteps(state, builder);
	}

	if (landingId) {
		builder.insertInlineNode(landingId, 0, node);
		builder.setSelection(createCollapsedSelection(landingId, 1));
	} else {
		const { blockId, offset } = resolveInsertPoint(sel, state.getBlockOrder());
		builder.insertInlineNode(blockId, offset, node);
		builder.setSelection(createCollapsedSelection(blockId, offset + 1));
	}

	return builder.build();
}

/** Builds a transaction inserting a display math block after the current top-level block. */
export function buildInsertDisplayMathTr(
	state: EditorState,
	attrs: FormulaAttrs,
): Transaction | null {
	const anchorId: BlockId | undefined = getSelectedBlockId(state);
	if (!anchorId) return null;

	// Display equations live at the top level; anchor on the top-level ancestor.
	const path: readonly BlockId[] | undefined = state.getNodePath(anchorId);
	const topId: BlockId = path && path.length > 0 ? (path[0] as BlockId) : anchorId;
	const topIndex: number = state.doc.children.findIndex((b) => b.id === topId);
	const insertAt: number = topIndex === -1 ? state.doc.children.length : topIndex + 1;

	const block = createBlockNode(nodeType(DISPLAY_MATH_TYPE), [], undefined, toNodeAttrs(attrs));
	const trailing = createBlockNode(nodeType('paragraph'));

	return state
		.transaction('command')
		.insertNode([], insertAt, block)
		.insertNode([], insertAt + 1, trailing)
		.setSelection(createNodeSelection(block.id, []))
		.build();
}

/** Inserts an inline math node at the current cursor, replacing any range selection. */
export function insertInlineMath(context: PluginContext, attrs: FormulaAttrs): boolean {
	const tr = buildInsertInlineMathTr(context.getState(), attrs);
	if (!tr) return false;
	context.dispatch(tr);
	return true;
}

/** Inserts a display (block) math node on its own line after the current block. */
export function insertDisplayMath(context: PluginContext, attrs: FormulaAttrs): boolean {
	const tr = buildInsertDisplayMathTr(context.getState(), attrs);
	if (!tr) return false;
	context.dispatch(tr);
	return true;
}

/** Updates the attributes of the inline math node at the given position. */
export function updateInlineMath(
	context: PluginContext,
	blockId: BlockId,
	offset: number,
	attrs: FormulaAttrs,
): boolean {
	const state: EditorState = context.getState();
	// Merge over the current attrs so presentation attributes set elsewhere
	// (e.g. a fontSize applied via the toolbar) survive a content edit.
	const merged = { ...inlineNodeAttrsAt(state, blockId, offset), ...toNodeAttrs(attrs) };
	const tr = state.transaction('command').setInlineNodeAttr(blockId, offset, merged).build();
	context.dispatch(tr);
	return true;
}

/** Updates the attributes of the display math block at the given path. */
export function updateDisplayMath(
	context: PluginContext,
	path: readonly BlockId[],
	attrs: FormulaAttrs,
): boolean {
	const state: EditorState = context.getState();
	const targetId: BlockId | undefined = path[path.length - 1];
	const current = targetId ? (state.getBlock(targetId)?.attrs ?? {}) : {};
	const merged = { ...current, ...toNodeAttrs(attrs) };
	const tr = state.transaction('command').setNodeAttr(path, merged).build();
	context.dispatch(tr);
	return true;
}

/** Returns the attrs of the inline node at `offset` within a block, or an empty object. */
function inlineNodeAttrsAt(
	state: EditorState,
	blockId: BlockId,
	offset: number,
): Readonly<Record<string, string | number | boolean>> {
	const block = state.getBlock(blockId);
	if (!block) return {};
	let pos = 0;
	for (const child of getInlineChildren(block)) {
		if (isInlineNode(child)) {
			if (pos === offset) return child.attrs;
			pos += 1;
		} else {
			pos += child.text.length;
		}
	}
	return {};
}
