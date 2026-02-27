/**
 * Utility for iterating over blocks within a selection range.
 *
 * Extracted from Commands.ts to break circular dependencies:
 * Commands.ts re-exports from MarkCommands.ts / AttributedMarkCommands.ts,
 * which in turn import forEachBlockInRange from Commands.ts.
 */

import { getBlockLength } from '../model/Document.js';
import type { SelectionRange } from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';

/**
 * Iterates over each block in the given selection range, invoking the callback
 * with the block ID, per-block start offset, and per-block end offset.
 * Blocks where `from === to` are skipped automatically.
 */
export function forEachBlockInRange(
	state: EditorState,
	range: SelectionRange,
	callback: (blockId: BlockId, from: number, to: number) => void,
): void {
	const blockOrder: readonly BlockId[] = state.getBlockOrder();
	const fromIdx: number = blockOrder.indexOf(range.from.blockId);
	const toIdx: number = blockOrder.indexOf(range.to.blockId);

	for (let i: number = fromIdx; i <= toIdx; i++) {
		const blockId: BlockId | undefined = blockOrder[i];
		if (!blockId) continue;
		const block = state.getBlock(blockId);
		if (!block) continue;

		const from: number = i === fromIdx ? range.from.offset : 0;
		const to: number = i === toIdx ? range.to.offset : getBlockLength(block);

		if (from === to) continue;
		callback(blockId, from, to);
	}
}
