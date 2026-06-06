/**
 * Insert/update commands for formula nodes. These take already-built canonical
 * attributes (`mathml` + `latex` + `alt`); the authoring UI and input rules are
 * responsible for producing them via the LaTeX converter. Undo/redo come for
 * free from the transaction system.
 */

import { insertBlockObjectOnOwnLine } from '../../commands/BlockInsertion.js';
import { resolveInsertPoint } from '../../commands/CommandHelpers.js';
import { addDeleteSelectionSteps } from '../../commands/Commands.js';
import { createBlockNode, createInlineNode } from '../../model/Document.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	isCollapsed,
	isTextSelection,
} from '../../model/Selection.js';
import { type BlockId, inlineType, nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction, TransactionBuilder } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import { getSelectedBlockId } from '../shared/PluginHelpers.js';
import type { FormulaLocale } from './FormulaLocale.js';
import { DISPLAY_MATH_TYPE, type FormulaAttrs, INLINE_MATH_TYPE } from './FormulaTypes.js';
import type { MathFieldResult } from './math-field/index.js';

function toNodeAttrs(attrs: FormulaAttrs): Record<string, string> {
	return { mathml: attrs.mathml, latex: attrs.latex, alt: attrs.alt, fontSize: attrs.fontSize };
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

/**
 * Appends the steps that place a display-math block, followed by a trailing empty
 * paragraph, at top-level index `insertAt`, then selects the new block. Shared by
 * the insert command and the `$$…$$` input rule so a display equation always has
 * a paragraph after it and both entry points behave identically.
 */
export function appendDisplayMathSteps(
	builder: TransactionBuilder,
	insertAt: number,
	attrs: FormulaAttrs,
): void {
	const block = createBlockNode(nodeType(DISPLAY_MATH_TYPE), [], undefined, toNodeAttrs(attrs));
	const trailing = createBlockNode(nodeType('paragraph'));
	builder
		.insertNode([], insertAt, block)
		.insertNode([], insertAt + 1, trailing)
		.setSelection(createNodeSelection(block.id, []));
}

/** Builds a transaction placing a display math block on its own line at the cursor. */
export function buildInsertDisplayMathTr(
	state: EditorState,
	attrs: FormulaAttrs,
): Transaction | null {
	const anchorId: BlockId | undefined = getSelectedBlockId(state);
	if (!anchorId) return null;

	const block = createBlockNode(nodeType(DISPLAY_MATH_TYPE), [], undefined, toNodeAttrs(attrs));
	const builder: TransactionBuilder = state.transaction('command');
	const trailing = insertBlockObjectOnOwnLine(state, builder, anchorId, block);
	if (!trailing) return null;

	builder.setSelection(createNodeSelection(block.id, []));
	return builder.build();
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
	const tr = state
		.transaction('command')
		.setInlineNodeAttr(blockId, offset, toNodeAttrs(attrs))
		.build();
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
	const tr = state.transaction('command').setNodeAttr(path, toNodeAttrs(attrs)).build();
	context.dispatch(tr);
	return true;
}

/** Maps a committed math-field result onto formula node attributes. */
export function resultToFormulaAttrs(result: MathFieldResult): FormulaAttrs {
	return {
		mathml: result.mathml,
		latex: result.latex,
		alt: result.alt,
		fontSize: result.fontSize,
	};
}

/**
 * Inserts a freshly committed formula at the selection — a display block or an
 * inline node per the field's toggle — and announces it. Shared by the toolbar
 * popup and the floating overlay so the insert-commit path is defined once.
 */
export function commitInsertFormula(
	context: PluginContext,
	locale: FormulaLocale,
	result: MathFieldResult,
): void {
	const attrs: FormulaAttrs = resultToFormulaAttrs(result);
	if (result.display) insertDisplayMath(context, attrs);
	else insertInlineMath(context, attrs);
	context.announce(locale.inserted);
}
