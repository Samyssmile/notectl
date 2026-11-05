/**
 * Inserts the composed text of an IME composition whose rendered edit cannot
 * be adopted (#266): the document was replaced, or other edits touched the
 * text the browser replaced.
 *
 * The composed text replaces what is left of the selection the composition
 * replaced, found by mapping that selection's content through the edits
 * applied while composing. Text inserted inside the selection meanwhile is
 * kept, and a split moves the composition along with the content after it.
 */

import { type Mark, getBlockLength, isLeafBlock } from '../model/Document.js';
import {
	type Position,
	type Selection,
	createCollapsedSelection,
	createPosition,
	createSelection,
} from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import { type MappedInBlockRange, type Mapping, mapOffsetInBlock } from '../state/Mapping.js';
import { mapRangeContent } from '../state/RangeMapping.js';
import type { Transaction, TransactionBuilder } from '../state/Transaction.js';
import { insertTextCommand, resolveActiveMarks } from './Commands.js';
import type { CompositionRange } from './CompositionCommands.js';

/** Where composed text goes, and what is left of the selection it replaces. */
interface ComposedTextPlacement {
	readonly at: Position;
	/** The current ranges holding what is left of the replaced selection, in its order. */
	readonly replaced: readonly MappedInBlockRange[];
}

/**
 * Inserts `text`, the `compositionend` data, in place of what is left of the
 * selection the composition replaced. Without a mapping, or when the
 * composition's position was deleted, `text` replaces the current selection,
 * as it did before compositions were committed from the rendered text.
 *
 * @returns The transaction, or `null` when there is no text to insert.
 */
export function insertComposedText(
	state: EditorState,
	composition: CompositionRange,
	text: string,
): Transaction | null {
	if (!text) return null;
	const placement: ComposedTextPlacement | null = composition.mapping
		? placeComposedText(composition, composition.mapping)
		: null;
	if (!placement || !fitsDocument(state, placement)) {
		return insertTextCommand(state, text, 'input');
	}
	return replacePlacement(state, placement, text);
}

/**
 * Maps the composition's selection through `mapping`. A collapsed selection
 * places the text behind content inserted at the caret, as a commit from the
 * rendered text does.
 *
 * @returns The placement, or `null` when the composition's position was deleted.
 */
function placeComposedText(
	{ blockId, from, to }: CompositionRange,
	mapping: Mapping,
): ComposedTextPlacement | null {
	const replaced: readonly MappedInBlockRange[] = mapRangeContent(blockId, from, to, mapping);
	const first: MappedInBlockRange | undefined = replaced[0];
	if (first) return { at: createPosition(first.blockId, first.from), replaced };
	const caret: MappedInBlockRange | null = mapOffsetInBlock(blockId, from, mapping, 1);
	return caret ? { at: createPosition(caret.blockId, caret.from), replaced } : null;
}

/** Deletes every replaced range and inserts `text` at the placement. */
function replacePlacement(
	state: EditorState,
	placement: ComposedTextPlacement,
	text: string,
): Transaction {
	const { at, replaced } = placement;
	const first: MappedInBlockRange | undefined = replaced[0];
	const typedOver: Selection = first
		? createSelection(at, createPosition(first.blockId, first.to))
		: createCollapsedSelection(at.blockId, at.offset);
	const marks: readonly Mark[] = resolveActiveMarks(state.withSelection(typedOver));

	const builder: TransactionBuilder = state.transaction('input');
	// Descending, so deleting one range leaves the offsets of the others in place.
	for (const range of [...replaced].sort((a, b) => b.from - a.from)) {
		builder.deleteTextAt(range.blockId, range.from, range.to);
	}
	const offset: number = at.offset - removedBefore(replaced, at.blockId, at.offset);
	builder.insertText(at.blockId, offset, text, marks);
	builder.setSelection(createCollapsedSelection(at.blockId, offset + text.length));
	return builder.build();
}

/** Length of the ranges in block `blockId` that end at or before `offset`. */
function removedBefore(
	ranges: readonly MappedInBlockRange[],
	blockId: BlockId,
	offset: number,
): number {
	return ranges
		.filter((range) => range.blockId === blockId && range.to <= offset)
		.reduce((sum, range) => sum + range.to - range.from, 0);
}

/**
 * Whether every position of `placement` lies in a leaf block of `state`. A
 * document replaced without steps keeps the mapping when the composition block
 * kept its content, but may have dropped a block the mapping points into.
 */
function fitsDocument(state: EditorState, { at, replaced }: ComposedTextPlacement): boolean {
	const ranges: readonly MappedInBlockRange[] = [
		{ blockId: at.blockId, from: at.offset, to: at.offset },
		...replaced,
	];
	return ranges.every((range) => {
		const block = state.getBlock(range.blockId);
		return block !== undefined && isLeafBlock(block) && range.to <= getBlockLength(block);
	});
}
