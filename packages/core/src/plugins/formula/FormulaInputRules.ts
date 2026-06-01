/**
 * InputRules that turn `$...$` into inline math and `$$...$$` into display math
 * as the user types the closing delimiter, converting the LaTeX via the
 * zero-dependency converter. Display is registered first so `$$...$$` is never
 * mis-claimed by the inline rule (the inline pattern also rejects `$$` via a
 * lookbehind).
 */

import { createBlockNode, createInlineNode } from '../../model/Document.js';
import type { InputRule } from '../../model/InputRule.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	isCollapsed,
	isTextSelection,
} from '../../model/Selection.js';
import { inlineType, nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { DISPLAY_MATH_TYPE, INLINE_MATH_TYPE } from './FormulaTypes.js';
import { latexToMathML } from './latex/index.js';
import { buildMathML } from './mathml/index.js';

const INLINE_PATTERN = /(?<!\$)\$([^$\n]+)\$$/;
const DISPLAY_PATTERN = /\$\$([^$\n]+)\$\$$/;

/** Returns true when the block under the cursor accepts inline-flow transforms. */
function isTransformable(state: EditorState, blockId: string): boolean {
	const block = state.getBlock(blockId as never);
	return block !== undefined && block.type !== 'code_block';
}

/**
 * Maps a matched delimiter run to a model text range. The match is pure text
 * (delimiters + LaTeX) ending at the caret, so anchoring to the caret's model
 * offset stays correct even when inline atoms precede it in the same block
 * (`getBlockText` skips atoms, so the engine's text offsets can drift).
 */
function modelRange(cursor: number, matchLength: number): { from: number; to: number } | null {
	const from: number = cursor - matchLength;
	if (from < 0) return null;
	return { from, to: cursor };
}

function inlineRule(): InputRule {
	return {
		pattern: INLINE_PATTERN,
		handler(state: EditorState, match: RegExpMatchArray): Transaction | null {
			const sel = state.selection;
			if (!isTextSelection(sel) || !isCollapsed(sel)) return null;
			const latex: string = (match[1] ?? '').trim();
			if (!latex) return null;
			const blockId = sel.anchor.blockId;
			if (!isTransformable(state, blockId)) return null;
			const range = modelRange(sel.anchor.offset, match[0].length);
			if (!range) return null;

			const { presentation } = latexToMathML(latex, { display: false });
			const mathml: string = buildMathML({ presentation, latex, display: false });
			const node = createInlineNode(inlineType(INLINE_MATH_TYPE), { mathml, latex, alt: '' });

			return state
				.transaction('input')
				.deleteTextAt(blockId, range.from, range.to)
				.insertInlineNode(blockId, range.from, node)
				.setSelection(createCollapsedSelection(blockId, range.from + 1))
				.build();
		},
	};
}

function displayRule(): InputRule {
	return {
		pattern: DISPLAY_PATTERN,
		handler(state: EditorState, match: RegExpMatchArray): Transaction | null {
			const sel = state.selection;
			if (!isTextSelection(sel) || !isCollapsed(sel)) return null;
			const latex: string = (match[1] ?? '').trim();
			if (!latex) return null;
			const blockId = sel.anchor.blockId;
			if (!isTransformable(state, blockId)) return null;
			const range = modelRange(sel.anchor.offset, match[0].length);
			if (!range) return null;

			// Display equations are inserted at the top level after the current block.
			const blockIndex: number = state.doc.children.findIndex((b) => b.id === blockId);
			if (blockIndex === -1) return null;

			const { presentation } = latexToMathML(latex, { display: true });
			const mathml: string = buildMathML({ presentation, latex, display: true });
			const block = createBlockNode(nodeType(DISPLAY_MATH_TYPE), [], undefined, {
				mathml,
				latex,
				alt: '',
			});

			return state
				.transaction('input')
				.deleteTextAt(blockId, range.from, range.to)
				.insertNode([], blockIndex + 1, block)
				.setSelection(createNodeSelection(block.id, []))
				.build();
		},
	};
}

/** Builds the `$...$` (inline) and `$$...$$` (display) input rules, display first. */
export function createFormulaInputRules(): InputRule[] {
	return [displayRule(), inlineRule()];
}
