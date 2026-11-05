/**
 * Carries the edit a browser made during an IME composition over the edits
 * other code applied to the document meanwhile (#260, #266).
 *
 * The browser edits the composition block as it was when the composition
 * started, while transactions can keep changing the model: a collaboration
 * binding, a host `dispatch`, a paste. The browser's change is found against
 * that baseline and moved through the mapping of those transactions. A split
 * can move it into another block.
 */

import { type Position, createPosition } from '../model/Selection.js';
import type { TextChange } from '../model/TextChange.js';
import type { BlockId } from '../model/TypeBrands.js';
import {
	type Assoc,
	type MappedInBlockRange,
	type Mapping,
	mapInBlockRange,
	mapOffsetInBlock,
} from '../state/Mapping.js';

/** A {@link TextChange} located in the current document, possibly in another block. */
export interface RebasedTextChange extends TextChange {
	readonly blockId: BlockId;
}

/**
 * Locates `change`, found against `baselineText`, in the current document.
 * The change may land in another block when a split moved its range there.
 *
 * @param textOf - Current text of a leaf block, or `null` for any other block.
 * @returns The change in current coordinates, or `null` when it cannot be
 *   carried over safely: its range was deleted or split apart, or other edits
 *   touched the text the browser replaced.
 */
export function rebaseComposedChange(
	change: TextChange,
	blockId: BlockId,
	baselineText: string,
	mapping: Mapping,
	textOf: (blockId: BlockId) => string | null,
): RebasedTextChange | null {
	const range: MappedInBlockRange | null =
		change.from === change.to
			? mapOffsetInBlock(blockId, change.from, mapping, 1)
			: mapInBlockRange(blockId, change.from, change.to, mapping);
	if (!range) return null;
	const currentText: string | null = textOf(range.blockId);
	const replaced: string = baselineText.slice(change.from, change.to);
	if (currentText?.slice(range.from, range.to) !== replaced) return null;
	return { blockId: range.blockId, from: range.from, to: range.to, text: change.text };
}

/**
 * Maps a caret offset in the rendered text to the committed document.
 *
 * @param caret - Offset in the rendered text.
 * @param applied - The browser's change against the baseline and where it was
 *   applied in the current document, or `null` when the text was unchanged.
 * @returns The caret after the commit, or `null` when it cannot be mapped.
 */
export function rebaseComposedCaret(
	caret: number,
	blockId: BlockId,
	mapping: Mapping,
	applied: { readonly change: TextChange; readonly target: RebasedTextChange } | null,
): Position | null {
	if (!applied) return mapPoint(blockId, caret, mapping, -1);
	const { change, target } = applied;
	const insertedEnd: number = change.from + change.text.length;
	if (caret >= change.from && caret <= insertedEnd) {
		return createPosition(target.blockId, target.from + (caret - change.from));
	}
	if (caret < change.from) return mapPoint(blockId, caret, mapping, -1);
	const baselineOffset: number = caret - change.text.length + (change.to - change.from);
	const mapped: Position | null = mapPoint(blockId, baselineOffset, mapping, 1);
	// Only a caret behind the change in the same block moves with its length.
	if (!mapped || mapped.blockId !== target.blockId) return mapped;
	return createPosition(
		mapped.blockId,
		mapped.offset + change.text.length - (target.to - target.from),
	);
}

function mapPoint(
	blockId: BlockId,
	offset: number,
	mapping: Mapping,
	assoc: Assoc,
): Position | null {
	const mapped: MappedInBlockRange | null = mapOffsetInBlock(blockId, offset, mapping, assoc);
	return mapped ? createPosition(mapped.blockId, mapped.from) : null;
}
