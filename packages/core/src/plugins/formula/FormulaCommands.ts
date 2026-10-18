/**
 * Insert/update commands for formula nodes. These take already-built canonical
 * attributes (`mathml` + `latex` + `alt`); the authoring UI and input rules are
 * responsible for producing them via the LaTeX converter. Undo/redo come for
 * free from the transaction system.
 */

import { insertBlockObjectsOnOwnLines } from '../../commands/BlockInsertion.js';
import {
	type ReplacementTarget,
	resolveReplacementTarget,
} from '../../commands/SelectionReplacement.js';
import { createBlockNode, createInlineNode } from '../../model/Document.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	isGapCursor,
	isTextSelection,
} from '../../model/Selection.js';
import { type BlockId, inlineType, nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction, TransactionBuilder } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
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
	if (formulas.length === 0 || !isTextSelection(state.selection)) return null;

	const builder: TransactionBuilder = state.transaction('command');
	const target: ReplacementTarget = resolveReplacementTarget(state, builder);

	let offset: number = target.offset;
	for (const attrs of formulas) {
		builder.insertInlineNode(
			target.blockId,
			offset,
			createInlineNode(inlineType(INLINE_MATH_TYPE), toNodeAttrs(attrs)),
		);
		offset += 1;
	}
	builder.setSelection(createCollapsedSelection(target.blockId, offset));

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
 * node-selected. A range selection is replaced, as by the inline variant: it is
 * deleted and the blocks follow the block that receives the range start. Used
 * both for a single display formula and for pasting a run of standalone
 * formulas where at least one is display (#159). Returns null at a gap cursor.
 */
export function buildInsertDisplayFormulasTr(
	state: EditorState,
	formulas: readonly FormulaAttrs[],
): Transaction | null {
	if (formulas.length === 0 || isGapCursor(state.selection)) return null;

	const blocks = formulas.map((attrs) =>
		createBlockNode(nodeType(DISPLAY_MATH_TYPE), [], undefined, toNodeAttrs(attrs)),
	);
	const builder: TransactionBuilder = state.transaction('command');
	const target: ReplacementTarget = resolveReplacementTarget(state, builder);
	const trailing = insertBlockObjectsOnOwnLines(target.state, builder, target.blockId, blocks);
	if (!trailing) return null;

	const last = blocks[blocks.length - 1];
	if (!last) return null;
	builder.setSelection(createNodeSelection(last.id, []));
	return builder.build();
}

/** Builds a transaction placing a display math block on its own line, replacing a range. */
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

/** Inserts a display (block) math node on its own line after the current block or range. */
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
