/**
 * Maps the *content* of an in-block range through a {@link Mapping}.
 *
 * {@link mapInBlockRange} moves a range's two endpoints, so whatever a later
 * edit inserted between them becomes part of the range, and a split between
 * them makes the range unrepresentable. Here the range stands for the content
 * it held: the result lists where that content still lives, piece by piece.
 * Content inserted inside the range stays outside every piece, content deleted
 * from it is gone, and a split or merge moves the affected piece with its
 * block. Deleting the pieces therefore removes the original content and keeps
 * every edit made since.
 */

import type { BlockId } from '../model/TypeBrands.js';
import type {
	MappedInBlockRange,
	Mapping,
	MergeMap,
	ShiftMap,
	SplitMap,
	StepMap,
} from './Mapping.js';

/**
 * Returns where the content of `(blockId, [from, to))` lives after `mapping`.
 *
 * @returns Non-empty in-block ranges in the order of the original content;
 *   empty when the range was empty or all its content was deleted.
 */
export function mapRangeContent(
	blockId: BlockId,
	from: number,
	to: number,
	mapping: Mapping,
): readonly MappedInBlockRange[] {
	let pieces: readonly MappedInBlockRange[] = from < to ? [{ blockId, from, to }] : [];
	for (const map of mapping.maps) {
		pieces = pieces.flatMap((piece) => mapPieceThroughStep(piece, map));
	}
	return pieces;
}

function mapPieceThroughStep(piece: MappedInBlockRange, map: StepMap): MappedInBlockRange[] {
	switch (map.type) {
		case 'shift':
			return mapPieceThroughShift(piece, map);
		case 'split':
			return mapPieceThroughSplit(piece, map);
		case 'merge':
			return [mapPieceThroughMerge(piece, map)];
		case 'blockRemoval':
			return map.removedBlockIds.has(piece.blockId) ? [] : [piece];
		case 'identity':
		case 'childIndexShift':
		case 'moveNode':
			// None of these moves content within or between blocks.
			return [piece];
	}
}

/**
 * Keeps the parts in front of and behind the replaced span. The content that
 * replaced the span is not part of the piece.
 */
function mapPieceThroughShift(piece: MappedInBlockRange, map: ShiftMap): MappedInBlockRange[] {
	if (piece.blockId !== map.blockId) return [piece];
	const delta: number = map.newLen - (map.to - map.from);
	const parts: MappedInBlockRange[] = [];
	if (piece.from < map.from) {
		parts.push({ blockId: piece.blockId, from: piece.from, to: Math.min(piece.to, map.from) });
	}
	if (piece.to > map.to) {
		const from: number = Math.max(piece.from, map.to) + delta;
		parts.push({ blockId: piece.blockId, from, to: piece.to + delta });
	}
	return parts;
}

/** Keeps the part in front of the split and moves the part behind it to the new block. */
function mapPieceThroughSplit(piece: MappedInBlockRange, map: SplitMap): MappedInBlockRange[] {
	if (piece.blockId !== map.blockId) return [piece];
	const parts: MappedInBlockRange[] = [];
	if (piece.from < map.offset) {
		parts.push({ blockId: piece.blockId, from: piece.from, to: Math.min(piece.to, map.offset) });
	}
	if (piece.to > map.offset) {
		parts.push({
			blockId: map.newBlockId,
			from: Math.max(piece.from, map.offset) - map.offset,
			to: piece.to - map.offset,
		});
	}
	return parts;
}

function mapPieceThroughMerge(piece: MappedInBlockRange, map: MergeMap): MappedInBlockRange {
	if (piece.blockId !== map.sourceBlockId) return piece;
	return {
		blockId: map.targetBlockId,
		from: piece.from + map.targetLengthBefore,
		to: piece.to + map.targetLengthBefore,
	};
}
