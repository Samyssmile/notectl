/**
 * Insert/update commands for formula nodes. These take already-built canonical
 * attributes (`mathml` + `latex` + `alt`); the authoring UI and input rules are
 * responsible for producing them via the LaTeX converter. Undo/redo come for
 * free from the transaction system.
 */

import { insertBlockObjectsOnOwnLines } from '../../commands/BlockInsertion.js';
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

/**
 * Builds a transaction inserting one or more inline math nodes at the cursor,
 * replacing any range selection. The nodes are placed back to back in document
 * order, the cursor lands after the last one. Used both for a single inline
 * formula and for pasting a run of standalone inline formulas (#159).
 */
export function buildInsertInlineFormulasTr(
	state: EditorState,
	formulas: readonly FormulaAttrs[],
): Transaction | null {
	const sel = state.selection;
	if (formulas.length === 0 || !isTextSelection(sel)) return null;

	const builder = state.transaction('command');

	const landingId: BlockId | undefined = isCollapsed(sel)
		? undefined
		: addDeleteSelectionSteps(state, builder);

	let targetId: BlockId;
	let offset: number;
	if (landingId) {
		targetId = landingId;
		offset = 0;
	} else {
		const insertPoint = resolveInsertPoint(sel, state.getBlockOrder());
		targetId = insertPoint.blockId;
		offset = insertPoint.offset;
	}

	for (const attrs of formulas) {
		builder.insertInlineNode(
			targetId,
			offset,
			createInlineNode(inlineType(INLINE_MATH_TYPE), toNodeAttrs(attrs)),
		);
		offset += 1;
	}
	builder.setSelection(createCollapsedSelection(targetId, offset));

	return builder.build();
}

/** Builds a transaction inserting an inline math node at the cursor (replacing a range). */
export function buildInsertInlineMathTr(
	state: EditorState,
	attrs: FormulaAttrs,
): Transaction | null {
	return buildInsertInlineFormulasTr(state, [attrs]);
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

/**
 * Builds a transaction placing one or more display math blocks on their own
 * lines at the cursor, sharing a single trailing paragraph; the last block is
 * node-selected. Used both for a single display formula and for pasting a run of
 * standalone formulas where at least one is display (#159).
 */
export function buildInsertDisplayFormulasTr(
	state: EditorState,
	formulas: readonly FormulaAttrs[],
): Transaction | null {
	const anchorId: BlockId | undefined = getSelectedBlockId(state);
	if (formulas.length === 0 || !anchorId) return null;

	const blocks = formulas.map((attrs) =>
		createBlockNode(nodeType(DISPLAY_MATH_TYPE), [], undefined, toNodeAttrs(attrs)),
	);
	const builder: TransactionBuilder = state.transaction('command');
	const trailing = insertBlockObjectsOnOwnLines(state, builder, anchorId, blocks);
	if (!trailing) return null;

	const last = blocks[blocks.length - 1];
	if (!last) return null;
	builder.setSelection(createNodeSelection(last.id, []));
	return builder.build();
}

/** Builds a transaction placing a display math block on its own line at the cursor. */
export function buildInsertDisplayMathTr(
	state: EditorState,
	attrs: FormulaAttrs,
): Transaction | null {
	return buildInsertDisplayFormulasTr(state, [attrs]);
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
