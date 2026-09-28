/**
 * Carries the edit a browser made during an IME composition over the edits
 * other code applied to the same block meanwhile (#260).
 *
 * The browser edits the composition block as it was when the composition
 * started, while transactions can keep changing the model: a collaboration
 * binding, a host `dispatch`, a paste. The browser's change is found against
 * that baseline and moved through the mapping of those transactions.
 */

import type { TextChange } from '../model/TextChange.js';
import type { BlockId } from '../model/TypeBrands.js';
import { type Assoc, type Mapping, mapInBlockRange, mapOffsetInBlock } from '../state/Mapping.js';

/**
 * Locates `change`, found against `baselineText`, in the block's current text.
 *
 * @returns The change in current offsets, or `null` when it cannot be carried
 *   over safely: its range was deleted or split away, or other edits touched
 *   the text the browser replaced.
 */
export function rebaseComposedChange(
	change: TextChange,
	blockId: BlockId,
	baselineText: string,
	currentText: string,
	mapping: Mapping,
): TextChange | null {
	const range =
		change.from === change.to
			? mapOffsetInBlock(blockId, change.from, mapping, 1)
			: mapInBlockRange(blockId, change.from, change.to, mapping);
	if (!range || range.blockId !== blockId) return null;
	const replaced: string = baselineText.slice(change.from, change.to);
	if (currentText.slice(range.from, range.to) !== replaced) return null;
	return { from: range.from, to: range.to, text: change.text };
}

/**
 * Maps a caret offset in the rendered text to the committed block.
 *
 * @param caret - Offset in the rendered text.
 * @param applied - The browser's change against the baseline and where it was
 *   applied in the current block, or `null` when the text was unchanged.
 * @returns The caret offset after the commit, or `null` when it cannot be mapped.
 */
export function rebaseComposedCaret(
	caret: number,
	blockId: BlockId,
	mapping: Mapping,
	applied: { readonly change: TextChange; readonly target: TextChange } | null,
): number | null {
	if (!applied) return mapPoint(blockId, caret, mapping, -1);
	const { change, target } = applied;
	const insertedEnd: number = change.from + change.text.length;
	if (caret >= change.from && caret <= insertedEnd) return target.from + (caret - change.from);
	if (caret < change.from) return mapPoint(blockId, caret, mapping, -1);
	const baselineOffset: number = caret - change.text.length + (change.to - change.from);
	const mapped: number | null = mapPoint(blockId, baselineOffset, mapping, 1);
	return mapped === null ? null : mapped + change.text.length - (target.to - target.from);
}

function mapPoint(blockId: BlockId, offset: number, mapping: Mapping, assoc: Assoc): number | null {
	const mapped = mapOffsetInBlock(blockId, offset, mapping, assoc);
	return mapped && mapped.blockId === blockId ? mapped.from : null;
}
