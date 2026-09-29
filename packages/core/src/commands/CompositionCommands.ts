/**
 * Commits an IME composition from the text the browser rendered for the
 * composition block.
 *
 * During a composition the browser owns the composition block's DOM and the
 * reconciler leaves it alone, so the DOM shows the block as it was at
 * `compositionstart` plus the browser's edits. Besides inserting the composed
 * text, the browser may delete committed text in front of the composition
 * start (#257) or recompose an existing word. Diffing the rendered text
 * against the block at `compositionstart` isolates exactly those edits.
 * Placing the result through the transactions applied while composing keeps
 * every other change made meanwhile, such as a host `dispatch`, a paste or a
 * `setJSON` (#260).
 */

import { getBlockOffsetText } from '../model/BlockOffsetText.js';
import type { CompositionSnapshot } from '../model/CompositionState.js';
import { isLeafBlock } from '../model/Document.js';
import { INLINE_NODE_PLACEHOLDER } from '../model/InputRule.js';
import {
	type Selection,
	createCollapsedSelection,
	createPosition,
	createSelection,
	selectionsEqual,
} from '../model/Selection.js';
import { type TextChange, findTextChange } from '../model/TextChange.js';
import type { BlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import {
	type Assoc,
	type MappedInBlockRange,
	Mapping,
	type ShiftMap,
	mapInBlockRange,
	mapOffsetInBlock,
	mapPositionThroughStep,
} from '../state/Mapping.js';
import type { Transaction } from '../state/Transaction.js';
import { insertTextCommand } from './Commands.js';

const NBSP = ' ';

/** The composition block as the browser started editing it, and what the document went through since. */
export interface CompositionBase {
	readonly blockId: BlockId;
	/** Offset in `text` where the composition started; places ambiguous edits. */
	readonly from: number;
	/** The block's inline content in model-offset space at `compositionstart`. */
	readonly text: string;
	/**
	 * Every transaction applied since `compositionstart`, or `null` once
	 * positions in the block can no longer be followed.
	 */
	readonly mapping: Mapping | null;
}

/**
 * Captures leaf block `blockId` of `state` as the base of a composition that
 * starts at offset `from`, or returns `null` when `state` holds no such leaf.
 */
export function createCompositionBase(
	state: EditorState,
	blockId: BlockId,
	from: number,
): CompositionBase | null {
	const block = state.getBlock(blockId);
	if (!block || !isLeafBlock(block)) return null;
	return { blockId, from, text: getBlockOffsetText(block), mapping: Mapping.empty };
}

/**
 * Follows a transaction applied while composing. A replaced document
 * (`replaceState`, e.g. `setJSON`) has no steps to map through; it keeps
 * positions valid only when it left the composition block's content as is.
 */
export function mapCompositionBase(
	base: CompositionBase,
	oldState: EditorState,
	newState: EditorState,
	tr: Transaction,
): CompositionBase {
	if (!base.mapping) return base;
	if (tr.steps.length > 0 || oldState.doc === newState.doc) {
		return { ...base, mapping: base.mapping.appendMapping(tr.mapping) };
	}
	return blockContentEqual(oldState, newState, base.blockId) ? base : { ...base, mapping: null };
}

/**
 * Builds the transaction that commits a composition to `state`.
 *
 * The browser's edit is the difference between `base.text` and
 * `rendered.text`. It is applied where the transactions since
 * `compositionstart` moved it, and the caret follows the rendered caret. The
 * view renders some spaces as NBSPs, so a space and an NBSP compare as equal
 * and composed NBSPs are stored as spaces.
 *
 * When the edit cannot be placed, because the rendered text is unreadable,
 * the document was replaced, the edited text changed meanwhile, or the edit
 * spans an inline node, the composed text is inserted at the selection
 * instead. An inline node placeholder never becomes text.
 *
 * @param composedText - The `compositionend` data, used only as that fallback.
 * @returns The commit transaction, or `null` when there is nothing to commit.
 */
export function commitComposition(
	state: EditorState,
	composedText: string,
	base: CompositionBase | null,
	rendered: CompositionSnapshot | null,
): Transaction | null {
	if (!base || !rendered) return insertComposedText(state, composedText);
	const change: TextChange | null = findTextChange(
		base.text,
		rendered.text,
		base.from,
		isSameRenderedChar,
	);
	if (!change) return moveCaret(state, base, rendered.caretOffset);
	const { mapping } = base;
	const target: MappedInBlockRange | null = mapping
		? placeChange(state, mapping, base, change)
		: null;
	if (!mapping || !target) return insertComposedText(state, composedText);

	const tr: Transaction = replaceRange(state, target, change.text.replaceAll(NBSP, ' '));
	const caret: Selection | null =
		rendered.caretOffset === null
			? null
			: caretAfterChange(mapping, base, change, target, rendered.caretOffset);
	return caret ? { ...tr, selectionAfter: caret } : tr;
}

/** Assumes the composition only inserted its text at the selection. */
function insertComposedText(state: EditorState, composedText: string): Transaction | null {
	return composedText ? insertTextCommand(state, composedText, 'input') : null;
}

/** A composition without a text edit can still leave the caret elsewhere. */
function moveCaret(
	state: EditorState,
	base: CompositionBase,
	caretOffset: number | null,
): Transaction | null {
	if (caretOffset === null || !base.mapping) return null;
	const mapped = base.mapping.mapResult(createPosition(base.blockId, caretOffset));
	if (mapped.deleted) return null;
	const selection: Selection = createCollapsedSelection(mapped.pos.blockId, mapped.pos.offset);
	if (selectionsEqual(state.selection, selection)) return null;
	return state.transaction('input').setSelection(selection).build();
}

/**
 * Where `change` applies in `state`, or `null` when it cannot be placed: the
 * text the browser replaced must still be there, unchanged. Text inserted
 * meanwhile at the edges of the change stays outside of it.
 */
function placeChange(
	state: EditorState,
	mapping: Mapping,
	base: CompositionBase,
	change: TextChange,
): MappedInBlockRange | null {
	if (change.text.includes(INLINE_NODE_PLACEHOLDER)) return null;
	const target: MappedInBlockRange | null =
		change.from === change.to
			? mapOffsetInBlock(base.blockId, change.from, mapping)
			: mapInBlockRange(base.blockId, change.from, change.to, mapping);
	if (!target) return null;
	const block = state.getBlock(target.blockId);
	if (!block || !isLeafBlock(block)) return null;
	const replaced: string = getBlockOffsetText(block).slice(target.from, target.to);
	return replaced === base.text.slice(change.from, change.to) ? target : null;
}

function replaceRange(state: EditorState, target: MappedInBlockRange, text: string): Transaction {
	const { blockId, from, to } = target;
	if (text.length > 0) {
		const selection: Selection = createSelection(
			{ blockId, offset: from },
			{ blockId, offset: to },
		);
		return insertTextCommand(state.withSelection(selection), text, 'input');
	}
	return state
		.transaction('input')
		.deleteTextAt(blockId, from, to)
		.setSelection(createCollapsedSelection(blockId, from))
		.build();
}

/**
 * Maps the rendered caret into the committed document. A caret inside the
 * composed text keeps its place in it; any other caret is a base position
 * that follows the transactions since `compositionstart` and the change.
 */
function caretAfterChange(
	mapping: Mapping,
	base: CompositionBase,
	change: TextChange,
	target: MappedInBlockRange,
	caretOffset: number,
): Selection | null {
	const composedEnd: number = change.from + change.text.length;
	if (caretOffset >= change.from && caretOffset <= composedEnd) {
		return createCollapsedSelection(target.blockId, target.from + caretOffset - change.from);
	}
	const afterChange: boolean = caretOffset > composedEnd;
	const baseOffset: number = afterChange ? caretOffset - composedEnd + change.to : caretOffset;
	const mapped = mapping.mapResult(createPosition(base.blockId, baseOffset));
	if (mapped.deleted) return null;
	const applied: ShiftMap = {
		type: 'shift',
		blockId: target.blockId,
		from: target.from,
		to: target.to,
		newLen: change.text.length,
	};
	const assoc: Assoc = afterChange ? 1 : -1;
	const { pos } = mapPositionThroughStep(mapped.pos, applied, assoc);
	return createCollapsedSelection(pos.blockId, pos.offset);
}

function blockContentEqual(a: EditorState, b: EditorState, blockId: BlockId): boolean {
	const before = a.getBlock(blockId);
	const after = b.getBlock(blockId);
	if (!before || !after || !isLeafBlock(before) || !isLeafBlock(after)) return false;
	return getBlockOffsetText(before) === getBlockOffsetText(after);
}

/** Character equality in which a space matches the NBSP the view may render for it. */
function isSameRenderedChar(modelChar: string, renderedChar: string): boolean {
	if (modelChar === renderedChar) return true;
	return modelChar === ' ' && renderedChar === NBSP;
}
