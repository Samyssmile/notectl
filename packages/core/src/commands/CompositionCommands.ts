/**
 * Commits an IME composition from the text the browser rendered for the
 * composition block.
 *
 * During a composition the browser owns the composition block's DOM and the
 * model is not updated. Besides inserting the composed text, the browser may
 * delete committed text in front of the composition start (#257) or recompose
 * an existing word. Reading the rendered text back and applying the difference
 * captures every such edit, where inserting the composed string at the model
 * caret would lose or duplicate text.
 *
 * The rendered DOM shows the block as it was when the composition started,
 * plus the browser's edits. The difference is therefore taken against that
 * baseline and carried over edits applied to the model meanwhile (#260).
 * Inline nodes are told apart by where they rendered when the composition
 * started, so a deletion next to identical inline nodes removes the right one
 * (#261).
 */

import { getBlockOffsetText, getInlineNodeOffsets } from '../model/BlockOffsetText.js';
import type { CompositionSnapshot } from '../model/CompositionState.js';
import { type BlockNode, isLeafBlock } from '../model/Document.js';
import { INLINE_NODE_PLACEHOLDER } from '../model/InputRule.js';
import { createCollapsedSelection, createSelection, selectionsEqual } from '../model/Selection.js';
import { type PositionEquality, type TextChange, findTextChange } from '../model/TextChange.js';
import type { BlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { Mapping } from '../state/Mapping.js';
import type { Transaction } from '../state/Transaction.js';
import { insertTextCommand } from './Commands.js';
import { rebaseComposedCaret, rebaseComposedChange } from './CompositionRebase.js';

const NBSP = '\u00a0';

/** A finished composition, described against the block it started in. */
export interface CompositionCommit {
	readonly blockId: BlockId;
	/** The composition block when the composition started. */
	readonly baseline: BlockNode;
	/** Start and end of the selection the composition replaced, in baseline offsets. */
	readonly from: number;
	readonly to: number;
	/** What the view rendered for the block when the composition ended. */
	readonly rendered: CompositionSnapshot;
	/**
	 * Mapping of the transactions applied while composing, or `null` when the
	 * document was replaced and positions cannot be mapped.
	 */
	readonly mapping: Mapping | null;
}

/**
 * `commit` carries the transaction that adopts the composition, or `null` when
 * nothing changed. `conflict` means the browser's edit cannot be adopted
 * without overwriting other edits or inventing inline nodes.
 */
export type CompositionCommitResult =
	| { readonly kind: 'commit'; readonly tr: Transaction | null }
	| { readonly kind: 'conflict' };

const CONFLICT: CompositionCommitResult = { kind: 'conflict' };

/**
 * Builds the transaction that adopts a composition into `state`.
 *
 * The view renders some spaces as non-breaking spaces to keep them visible,
 * so a space and an NBSP compare as equal. Unchanged text always comes from
 * the model, which keeps NBSPs stored in the document; the changed text maps
 * NBSP back to a space.
 *
 * @param state - The current state, including edits made while composing.
 * @param commit - The composition, relative to its baseline block.
 * @returns The commit transaction, or a conflict the caller must resolve.
 */
export function commitComposedText(
	state: EditorState,
	commit: CompositionCommit,
): CompositionCommitResult {
	const current: BlockNode | undefined = state.getBlock(commit.blockId);
	if (!current || !isLeafBlock(current) || commit.mapping === null) return CONFLICT;

	const baselineText: string = getBlockOffsetText(commit.baseline);
	const change: TextChange | null = findTextChange(baselineText, commit.rendered.text, {
		preferredFrom: commit.from,
		preferredDeletionEnd: commit.from === commit.to ? commit.from : undefined,
		equals: renderedEquality(baselineText, getInlineNodeOffsets(commit.baseline), commit.rendered),
	});
	// The browser cannot create inline nodes; an inline node inside the change
	// means the rendered text no longer lines up with the model.
	if (change && insertsInlineNode(change, commit.rendered)) return CONFLICT;

	const target: TextChange | null = change
		? rebaseComposedChange(
				change,
				commit.blockId,
				baselineText,
				getBlockOffsetText(current),
				commit.mapping,
			)
		: null;
	if (change && !target) return CONFLICT;

	const tr: Transaction | null = target ? applyChange(state, commit.blockId, target) : null;
	const caret: number | null =
		commit.rendered.caretOffset === null
			? null
			: rebaseComposedCaret(
					commit.rendered.caretOffset,
					commit.blockId,
					commit.mapping,
					change && target ? { change, target } : null,
				);
	return { kind: 'commit', tr: withCaret(state, tr, commit.blockId, caret) };
}

/** Replaces `change.from..change.to` of block `blockId` with `change.text`. */
function applyChange(state: EditorState, blockId: BlockId, change: TextChange): Transaction {
	const text: string = change.text.replaceAll(NBSP, ' ');
	if (text.length > 0) {
		const target: EditorState = state.withSelection(
			createSelection({ blockId, offset: change.from }, { blockId, offset: change.to }),
		);
		return insertTextCommand(target, text, 'input');
	}
	return state
		.transaction('input')
		.deleteTextAt(blockId, change.from, change.to)
		.setSelection(createCollapsedSelection(blockId, change.from))
		.build();
}

/**
 * Places the caret where the IME left it. A minimal text diff can stop before
 * an unchanged suffix of the composed word, so its insertion endpoint is not
 * necessarily the final caret.
 */
function withCaret(
	state: EditorState,
	tr: Transaction | null,
	blockId: BlockId,
	caret: number | null,
): Transaction | null {
	if (caret === null) return tr;
	const selection = createCollapsedSelection(blockId, caret);
	if (tr) return { ...tr, selectionAfter: selection };
	if (selectionsEqual(state.selection, selection)) return null;
	return state.transaction('input').setSelection(selection).build();
}

/**
 * Equality between a baseline position and a rendered position: an inline node
 * matches only the element that rendered it when the composition started, and
 * a space matches the NBSP the view may render for it. A placeholder character
 * typed as text is plain text on both sides.
 */
function renderedEquality(
	baselineText: string,
	inlineNodeOffsets: ReadonlySet<number>,
	rendered: CompositionSnapshot,
): PositionEquality {
	const origins: ReadonlyMap<number, number | null> | undefined = rendered.inlineNodeOrigins;
	return (baselineIndex: number, renderedIndex: number): boolean => {
		if (origins) {
			if (inlineNodeOffsets.has(baselineIndex)) return origins.get(renderedIndex) === baselineIndex;
			if (origins.has(renderedIndex)) return false;
		}
		const modelChar: string = baselineText.charAt(baselineIndex);
		const renderedChar: string = rendered.text.charAt(renderedIndex);
		if (modelChar === renderedChar) return true;
		return modelChar === ' ' && renderedChar === NBSP;
	};
}

/** Whether the rendered text `change` would insert holds an inline node element. */
function insertsInlineNode(change: TextChange, rendered: CompositionSnapshot): boolean {
	const origins: ReadonlyMap<number, number | null> | undefined = rendered.inlineNodeOrigins;
	if (!origins) return change.text.includes(INLINE_NODE_PLACEHOLDER);
	for (let index = change.from; index < change.from + change.text.length; index++) {
		if (origins.has(index)) return true;
	}
	return false;
}
