import { describe, expect, it } from 'vitest';
import { createPosition } from '../model/Selection.js';
import type { Position } from '../model/Selection.js';
import { blockId } from '../model/TypeBrands.js';
import {
	type BlockRemovalMap,
	type ChildIndexShiftMap,
	IDENTITY_MAP,
	Mapping,
	type MergeMap,
	type ShiftMap,
	type SplitMap,
	type StepMap,
	collectRemovedBlockIds,
	mapChildIndex,
	mapInsertionIndex,
	mapPositionThroughStep,
} from './Mapping.js';

const B1 = blockId('b1');
const B2 = blockId('b2');
const B3 = blockId('b3');

function pos(bid: typeof B1, offset: number): Position {
	return createPosition(bid, offset);
}

function shift(bid: typeof B1, from: number, to: number, newLen: number): ShiftMap {
	return { type: 'shift', blockId: bid, from, to, newLen };
}

function split(bid: typeof B1, offset: number, newBid: typeof B1): SplitMap {
	return { type: 'split', blockId: bid, offset, newBlockId: newBid };
}

function merge(target: typeof B1, source: typeof B1, targetLen: number): MergeMap {
	return {
		type: 'merge',
		targetBlockId: target,
		sourceBlockId: source,
		targetLengthBefore: targetLen,
	};
}

function blockRemoval(...ids: (typeof B1)[]): BlockRemovalMap {
	return { type: 'blockRemoval', removedBlockIds: new Set(ids), parentPath: [], index: 0 };
}

function blockRemovalAt(
	parentPath: readonly (typeof B1)[],
	index: number,
	...ids: (typeof B1)[]
): BlockRemovalMap {
	return { type: 'blockRemoval', removedBlockIds: new Set(ids), parentPath, index };
}

function childIndexShift(
	parentPath: readonly (typeof B1)[],
	fromIndex: number,
	delta: number,
): ChildIndexShiftMap {
	return { type: 'childIndexShift', parentPath, fromIndex, delta };
}

// --- mapPositionThroughStep: identity ---

describe('mapPositionThroughStep', () => {
	describe('identity', () => {
		it('passes positions through unchanged', () => {
			const p: Position = pos(B1, 5);
			const result = mapPositionThroughStep(p, IDENTITY_MAP);
			expect(result.pos).toBe(p);
			expect(result.deleted).toBe(false);
		});
	});

	// --- shift: pure insertion ---

	describe('shift (pure insertion: from === to)', () => {
		// insertText('hello' at offset 3, len 2) → shift(B1, 3, 3, 2)
		const map: ShiftMap = shift(B1, 3, 3, 2);

		it('leaves positions in a different block untouched', () => {
			const p: Position = pos(B2, 5);
			const result = mapPositionThroughStep(p, map);
			expect(result.pos).toBe(p);
		});

		it('leaves positions strictly before the insertion untouched', () => {
			const result = mapPositionThroughStep(pos(B1, 2), map);
			expect(result.pos.offset).toBe(2);
			expect(result.deleted).toBe(false);
		});

		it('at the boundary with assoc=-1 stays', () => {
			const result = mapPositionThroughStep(pos(B1, 3), map, -1);
			expect(result.pos.offset).toBe(3);
			expect(result.deleted).toBe(false);
		});

		it('at the boundary with assoc=+1 moves past the insertion', () => {
			const result = mapPositionThroughStep(pos(B1, 3), map, 1);
			expect(result.pos.offset).toBe(5);
			expect(result.deleted).toBe(false);
		});

		it('shifts positions past the insertion by newLen', () => {
			const result = mapPositionThroughStep(pos(B1, 7), map);
			expect(result.pos.offset).toBe(9);
		});
	});

	// --- shift: pure deletion ---

	describe('shift (pure deletion: newLen === 0)', () => {
		// deleteText(from=2, to=5) → shift(B1, 2, 5, 0)
		const map: ShiftMap = shift(B1, 2, 5, 0);

		it('leaves positions before the deletion untouched', () => {
			const result = mapPositionThroughStep(pos(B1, 1), map);
			expect(result.pos.offset).toBe(1);
			expect(result.deleted).toBe(false);
		});

		it('at the from boundary stays', () => {
			const result = mapPositionThroughStep(pos(B1, 2), map);
			expect(result.pos.offset).toBe(2);
			expect(result.deleted).toBe(false);
		});

		it('strictly inside the deletion clamps to from and is marked deleted', () => {
			const result = mapPositionThroughStep(pos(B1, 4), map);
			expect(result.pos.offset).toBe(2);
			expect(result.deleted).toBe(true);
		});

		it('strictly inside with assoc=+1 still clamps to from (newLen=0)', () => {
			const result = mapPositionThroughStep(pos(B1, 4), map, 1);
			expect(result.pos.offset).toBe(2);
			expect(result.deleted).toBe(true);
		});

		it('at the to boundary shifts to from', () => {
			const result = mapPositionThroughStep(pos(B1, 5), map);
			expect(result.pos.offset).toBe(2);
			expect(result.deleted).toBe(false);
		});

		it('past the deletion shifts by delta', () => {
			const result = mapPositionThroughStep(pos(B1, 8), map);
			expect(result.pos.offset).toBe(5);
		});
	});

	// --- shift: replacement (delete then insert) ---

	describe('shift (replacement: from < to and newLen > 0)', () => {
		// Replace [2,5) with 4 chars → shift(B1, 2, 5, 4)
		const map: ShiftMap = shift(B1, 2, 5, 4);

		it('at the from boundary stays at from', () => {
			const result = mapPositionThroughStep(pos(B1, 2), map);
			expect(result.pos.offset).toBe(2);
		});

		it('strictly inside with assoc=-1 clamps to from, deleted=true', () => {
			const result = mapPositionThroughStep(pos(B1, 3), map, -1);
			expect(result.pos.offset).toBe(2);
			expect(result.deleted).toBe(true);
		});

		it('strictly inside with assoc=+1 clamps to from + newLen, deleted=true', () => {
			const result = mapPositionThroughStep(pos(B1, 3), map, 1);
			expect(result.pos.offset).toBe(6);
			expect(result.deleted).toBe(true);
		});

		it('at to shifts by delta', () => {
			const result = mapPositionThroughStep(pos(B1, 5), map);
			// delta = newLen - (to - from) = 4 - 3 = +1 → offset 6
			expect(result.pos.offset).toBe(6);
			expect(result.deleted).toBe(false);
		});
	});

	// --- split ---

	describe('split', () => {
		const map: SplitMap = split(B1, 5, B2);

		it('leaves positions in a different block untouched', () => {
			const p: Position = pos(B3, 7);
			const result = mapPositionThroughStep(p, map);
			expect(result.pos).toBe(p);
		});

		it('leaves positions before the split untouched', () => {
			const result = mapPositionThroughStep(pos(B1, 3), map);
			expect(result.pos.blockId).toBe(B1);
			expect(result.pos.offset).toBe(3);
		});

		it('moves positions past the split to newBlockId with rebased offset', () => {
			const result = mapPositionThroughStep(pos(B1, 8), map);
			expect(result.pos.blockId).toBe(B2);
			expect(result.pos.offset).toBe(3);
		});

		it('at the split boundary with assoc=-1 stays in original block', () => {
			const result = mapPositionThroughStep(pos(B1, 5), map, -1);
			expect(result.pos.blockId).toBe(B1);
			expect(result.pos.offset).toBe(5);
		});

		it('at the split boundary with assoc=+1 moves to new block at 0', () => {
			const result = mapPositionThroughStep(pos(B1, 5), map, 1);
			expect(result.pos.blockId).toBe(B2);
			expect(result.pos.offset).toBe(0);
		});
	});

	// --- merge ---

	describe('merge', () => {
		const map: MergeMap = merge(B1, B2, 4);

		it('leaves target-block positions untouched', () => {
			const result = mapPositionThroughStep(pos(B1, 2), map);
			expect(result.pos.blockId).toBe(B1);
			expect(result.pos.offset).toBe(2);
		});

		it('moves source-block positions to target with offset shift', () => {
			const result = mapPositionThroughStep(pos(B2, 3), map);
			expect(result.pos.blockId).toBe(B1);
			expect(result.pos.offset).toBe(7);
		});

		it('leaves unrelated block positions untouched', () => {
			const p: Position = pos(B3, 5);
			const result = mapPositionThroughStep(p, map);
			expect(result.pos).toBe(p);
		});
	});

	// --- blockRemoval ---

	describe('blockRemoval', () => {
		const map: BlockRemovalMap = blockRemoval(B1, B2);

		it('marks positions in removed blocks as deleted', () => {
			const result = mapPositionThroughStep(pos(B1, 3), map);
			expect(result.deleted).toBe(true);
		});

		it('does not touch positions in non-removed blocks', () => {
			const p: Position = pos(B3, 5);
			const result = mapPositionThroughStep(p, map);
			expect(result.pos).toBe(p);
			expect(result.deleted).toBe(false);
		});
	});

	// --- childIndexShift: positions pass through unchanged ---

	describe('childIndexShift', () => {
		it('does not move positions in any block', () => {
			const map: ChildIndexShiftMap = childIndexShift([], 0, 1);
			const p: Position = pos(B1, 7);
			const result = mapPositionThroughStep(p, map);
			expect(result.pos).toBe(p);
			expect(result.deleted).toBe(false);
		});
	});
});

// --- collectRemovedBlockIds ---

describe('collectRemovedBlockIds', () => {
	it('collects a leaf block id', () => {
		const node = { type: 'paragraph', id: B1, children: [], attrs: {} } as never;
		const ids = collectRemovedBlockIds(node);
		expect(ids.has(B1)).toBe(true);
		expect(ids.size).toBe(1);
	});

	it('walks nested block children', () => {
		const inner = { type: 'paragraph', id: B2, children: [], attrs: {} };
		const outer = { type: 'list', id: B1, children: [inner], attrs: {} } as never;
		const ids = collectRemovedBlockIds(outer);
		expect(ids.has(B1)).toBe(true);
		expect(ids.has(B2)).toBe(true);
		expect(ids.size).toBe(2);
	});

	it('skips non-block children', () => {
		const text = { type: 'text', text: 'x', marks: [] };
		const node = { type: 'paragraph', id: B1, children: [text], attrs: {} } as never;
		const ids = collectRemovedBlockIds(node);
		expect(ids.size).toBe(1);
	});
});

// --- Mapping ---

describe('Mapping', () => {
	it('Mapping.empty returns the same instance', () => {
		expect(Mapping.from([])).toBe(Mapping.empty);
		expect(Mapping.from([IDENTITY_MAP, IDENTITY_MAP])).toBe(Mapping.empty);
	});

	it('Mapping.from drops identity maps', () => {
		const m: Mapping = Mapping.from([IDENTITY_MAP, shift(B1, 0, 0, 1), IDENTITY_MAP]);
		expect(m.maps).toHaveLength(1);
		expect(m.maps[0]?.type).toBe('shift');
	});

	it('appendMap drops identity', () => {
		const m = Mapping.from([shift(B1, 0, 0, 1)]);
		expect(m.appendMap(IDENTITY_MAP)).toBe(m);
	});

	it('isEmpty is true for the empty mapping', () => {
		expect(Mapping.empty.isEmpty).toBe(true);
		expect(Mapping.from([]).isEmpty).toBe(true);
	});

	it('map folds positions through composed steps', () => {
		// Insert 3 chars at offset 2, then delete [1, 4)
		const maps: StepMap[] = [shift(B1, 2, 2, 3), shift(B1, 1, 4, 0)];
		const mapping: Mapping = Mapping.from(maps);

		// Position 5: after insertion → 8, after delete [1,4) → 8 - 3 = 5
		expect(mapping.map(pos(B1, 5)).offset).toBe(5);
	});

	it('mapResult preserves deleted flag across steps', () => {
		// Delete [2, 5), then insert 1 char at offset 0
		const maps: StepMap[] = [shift(B1, 2, 5, 0), shift(B1, 0, 0, 1)];
		const mapping: Mapping = Mapping.from(maps);

		// Position 3 was inside the first deletion, so deleted flag must stick
		const result = mapping.mapResult(pos(B1, 3));
		expect(result.deleted).toBe(true);
	});

	it('mapRange returns endpoints after composition', () => {
		// Insert 'XY' at offset 2 in B1
		const mapping: Mapping = Mapping.from([shift(B1, 2, 2, 2)]);
		const range = { from: pos(B1, 0), to: pos(B1, 5) };
		const mapped = mapping.mapRange(range);
		expect(mapped).not.toBeNull();
		expect(mapped?.from.offset).toBe(0);
		expect(mapped?.to.offset).toBe(7);
	});

	it('mapRange uses assocFrom=-1 and assocTo=+1 by default', () => {
		// Insert 'X' at offset 2 of B1. With defaults, [2,2) range expands to [2,3).
		const mapping: Mapping = Mapping.from([shift(B1, 2, 2, 1)]);
		const range = { from: pos(B1, 2), to: pos(B1, 2) };
		const mapped = mapping.mapRange(range);
		expect(mapped?.from.offset).toBe(2);
		expect(mapped?.to.offset).toBe(3);
	});

	it('mapRange returns null when both endpoints land in deleted content with collapsed mapped range', () => {
		// Delete [2, 8), then map a range [3, 5)
		const mapping: Mapping = Mapping.from([shift(B1, 2, 8, 0)]);
		const range = { from: pos(B1, 3), to: pos(B1, 5) };
		const mapped = mapping.mapRange(range);
		expect(mapped).toBeNull();
	});

	it('mapRange may return endpoints in different blocks after a split', () => {
		const mapping: Mapping = Mapping.from([split(B1, 5, B2)]);
		const range = { from: pos(B1, 3), to: pos(B1, 8) };
		const mapped = mapping.mapRange(range);
		// from with assoc=-1 stays in B1, to with assoc=+1 moves to B2
		expect(mapped?.from.blockId).toBe(B1);
		expect(mapped?.from.offset).toBe(3);
		expect(mapped?.to.blockId).toBe(B2);
		expect(mapped?.to.offset).toBe(3);
	});

	it('appendMapping concatenates two mappings', () => {
		const a = Mapping.from([shift(B1, 0, 0, 1)]);
		const b = Mapping.from([shift(B1, 0, 0, 1)]);
		const combined = a.appendMapping(b);
		expect(combined.maps).toHaveLength(2);
	});

	it('appendMapping returns this if the other is empty', () => {
		const a = Mapping.from([shift(B1, 0, 0, 1)]);
		expect(a.appendMapping(Mapping.empty)).toBe(a);
	});

	// --- Multi-step round-trip parity with the decoration-side mapping ---

	it('split + merge round-trips a position to its original', () => {
		const splitMap: SplitMap = split(B1, 5, B2);
		const mergeMap: MergeMap = merge(B1, B2, 5);
		const mapping: Mapping = Mapping.from([splitMap, mergeMap]);
		const result = mapping.map(pos(B1, 7));
		expect(result.blockId).toBe(B1);
		expect(result.offset).toBe(7);
	});
});

// --- mapChildIndex ---

describe('mapChildIndex', () => {
	it('returns the input index on empty mapping', () => {
		expect(mapChildIndex([], 3, Mapping.empty)).toBe(3);
	});

	it('passes through non-structural maps unchanged', () => {
		const m = Mapping.from([shift(B1, 0, 0, 2), split(B1, 3, B2), merge(B1, B2, 4)]);
		expect(mapChildIndex([], 3, m)).toBe(3);
	});

	describe('childIndexShift (insertNode-style)', () => {
		it('shifts indices ≥ fromIndex up by delta', () => {
			const m = Mapping.from([childIndexShift([], 2, 1)]);
			expect(mapChildIndex([], 2, m)).toBe(3);
			expect(mapChildIndex([], 5, m)).toBe(6);
		});

		it('leaves indices < fromIndex unchanged', () => {
			const m = Mapping.from([childIndexShift([], 2, 1)]);
			expect(mapChildIndex([], 0, m)).toBe(0);
			expect(mapChildIndex([], 1, m)).toBe(1);
		});

		it('ignores shifts in a different parent', () => {
			const m = Mapping.from([childIndexShift([B1], 0, 1)]);
			expect(mapChildIndex([], 5, m)).toBe(5);
			expect(mapChildIndex([B2], 5, m)).toBe(5);
		});
	});

	describe('blockRemoval (removeNode-style)', () => {
		it('returns null for the exact removed slot', () => {
			const m = Mapping.from([blockRemovalAt([], 2, B1)]);
			expect(mapChildIndex([], 2, m)).toBeNull();
		});

		it('shifts indices > removed.index down by 1', () => {
			const m = Mapping.from([blockRemovalAt([], 2, B1)]);
			expect(mapChildIndex([], 3, m)).toBe(2);
			expect(mapChildIndex([], 5, m)).toBe(4);
		});

		it('leaves indices < removed.index unchanged', () => {
			const m = Mapping.from([blockRemovalAt([], 2, B1)]);
			expect(mapChildIndex([], 0, m)).toBe(0);
			expect(mapChildIndex([], 1, m)).toBe(1);
		});

		it('ignores removals in a different parent', () => {
			const m = Mapping.from([blockRemovalAt([B2], 0, B1)]);
			expect(mapChildIndex([], 5, m)).toBe(5);
		});
	});

	describe('composed structural maps', () => {
		it('applies childIndexShift then blockRemoval in order', () => {
			// Agent inserts at index 2 (shifts our index 3 → 4), then removes index 1
			// (which doesn't shift our index because 4 > 1 → 4 - 1 = 3).
			const m = Mapping.from([childIndexShift([], 2, 1), blockRemovalAt([], 1, B1)]);
			expect(mapChildIndex([], 3, m)).toBe(3);
		});

		it('propagates null through subsequent maps', () => {
			const m = Mapping.from([blockRemovalAt([], 2, B1), childIndexShift([], 0, 1)]);
			expect(mapChildIndex([], 2, m)).toBeNull();
		});
	});
});

// --- mapInsertionIndex ---

describe('mapInsertionIndex', () => {
	it('returns the input index on empty mapping', () => {
		expect(mapInsertionIndex([], 3, Mapping.empty)).toBe(3);
	});

	it('matches mapChildIndex behaviour for non-removal maps', () => {
		const m = Mapping.from([childIndexShift([], 2, 1)]);
		expect(mapInsertionIndex([], 2, m)).toBe(3);
		expect(mapInsertionIndex([], 5, m)).toBe(6);
		expect(mapInsertionIndex([], 1, m)).toBe(1);
	});

	describe('insertion-slot vs existing-child semantics under blockRemoval', () => {
		it('keeps the slot when intervening removed exactly the block at that index', () => {
			// Doc had block at index 2; agent removed it. An insertion-slot at
			// index 2 still names a valid slot in the post-removal frame (now
			// pointing at the gap where the block was). Existing-child semantics
			// would return null here.
			const m = Mapping.from([blockRemovalAt([], 2, B1)]);
			expect(mapInsertionIndex([], 2, m)).toBe(2);
			expect(mapChildIndex([], 2, m)).toBeNull();
		});

		it('still shifts indices strictly past the removed slot down by 1', () => {
			const m = Mapping.from([blockRemovalAt([], 2, B1)]);
			expect(mapInsertionIndex([], 3, m)).toBe(2);
			expect(mapInsertionIndex([], 5, m)).toBe(4);
		});

		it('still leaves indices strictly before the removed slot untouched', () => {
			const m = Mapping.from([blockRemovalAt([], 2, B1)]);
			expect(mapInsertionIndex([], 0, m)).toBe(0);
			expect(mapInsertionIndex([], 1, m)).toBe(1);
		});

		it('ignores removals in a different parent', () => {
			const m = Mapping.from([blockRemovalAt([B2], 0, B1)]);
			expect(mapInsertionIndex([], 5, m)).toBe(5);
		});
	});
});
