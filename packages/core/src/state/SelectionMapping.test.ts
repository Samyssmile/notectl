import { describe, expect, it } from 'vitest';
import {
	createCollapsedSelection,
	createGapCursor,
	createNodeSelection,
	createPosition,
	createSelection,
	isGapCursor,
	isNodeSelection,
	isTextSelection,
} from '../model/Selection.js';
import type { GapCursorSelection, NodeSelection, Selection } from '../model/Selection.js';
import { blockId } from '../model/TypeBrands.js';
import {
	type BlockRemovalMap,
	IDENTITY_MAP,
	Mapping,
	type MergeMap,
	type ShiftMap,
	type SplitMap,
} from './Mapping.js';
import { mapSelection, mapTextSelection } from './SelectionMapping.js';

const B1 = blockId('b1');
const B2 = blockId('b2');
const B3 = blockId('b3');

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
	return { type: 'blockRemoval', removedBlockIds: new Set(ids) };
}

describe('mapSelection', () => {
	it('returns the same instance when mapping is empty', () => {
		const sel = createCollapsedSelection(B1, 3);
		expect(mapSelection(sel, Mapping.empty)).toBe(sel);
	});

	it('passes through identity-only mappings', () => {
		const sel = createCollapsedSelection(B1, 3);
		const m = Mapping.from([IDENTITY_MAP, IDENTITY_MAP]);
		expect(mapSelection(sel, m)).toBe(sel);
	});

	// --- Text selections ---

	describe('text selection', () => {
		it('shifts collapsed cursor past an insertion before it', () => {
			const sel = createCollapsedSelection(B1, 5);
			const m = Mapping.from([shift(B1, 0, 0, 2)]);
			const result = mapSelection(sel, m) as Selection;
			expect(isTextSelection(result)).toBe(true);
			expect(result.anchor.offset).toBe(7);
			expect(result.head.offset).toBe(7);
		});

		it('leaves cursor untouched when insertion is after it', () => {
			const sel = createCollapsedSelection(B1, 5);
			const m = Mapping.from([shift(B1, 10, 10, 2)]);
			const result = mapSelection(sel, m) as Selection;
			expect(result.anchor.offset).toBe(5);
			expect(result.head.offset).toBe(5);
		});

		it('keeps a collapsed selection collapsed at an insertion boundary', () => {
			// Cursor at offset 5. Insert 'X' at 5. Cursor stays collapsed at 5
			// (sticky-left). Without the collapsed-aware logic, anchor would
			// stay at 5 and head would move to 6, tearing the cursor into a
			// 1-character range — which is what an inclusive-start /
			// exclusive-end *range* wants but not what a cursor wants.
			const sel = createCollapsedSelection(B1, 5);
			const m = Mapping.from([shift(B1, 5, 5, 1)]);
			const result = mapSelection(sel, m) as Selection;
			expect(result.anchor.offset).toBe(5);
			expect(result.head.offset).toBe(5);
		});

		it('non-collapsed selection: anchor sticky left, head sticky right', () => {
			const sel = createSelection(createPosition(B1, 5), createPosition(B1, 10));
			const m = Mapping.from([shift(B1, 5, 5, 2), shift(B1, 12, 12, 3)]);
			const result = mapSelection(sel, m) as Selection;
			// anchor=5 → stays at 5 (assoc=-1)
			expect(result.anchor.offset).toBe(5);
			// head=10 → 10+2=12 after first insert. Then 12 with assoc=+1, insert at 12 → 15.
			expect(result.head.offset).toBe(15);
		});

		it('moves anchor and head across a split', () => {
			const sel = createSelection(createPosition(B1, 3), createPosition(B1, 8));
			const m = Mapping.from([split(B1, 5, B2)]);
			const result = mapSelection(sel, m) as Selection;
			// anchor=3 assoc=-1 → stays at {B1,3}
			expect(result.anchor.blockId).toBe(B1);
			expect(result.anchor.offset).toBe(3);
			// head=8 assoc=+1 → {B2, 3}
			expect(result.head.blockId).toBe(B2);
			expect(result.head.offset).toBe(3);
		});

		it('clamps cursor that fell inside deleted content (assoc=-1)', () => {
			const sel = createCollapsedSelection(B1, 5);
			const m = Mapping.from([shift(B1, 3, 8, 0)]);
			const result = mapSelection(sel, m) as Selection;
			// anchor with assoc=-1 → clamp to from=3
			expect(result.anchor.offset).toBe(3);
			// head with assoc=+1 → clamp to from+newLen=3
			expect(result.head.offset).toBe(3);
		});
	});

	// --- mapTextSelection direct ---

	describe('mapTextSelection', () => {
		it('preserves reference equality when no change', () => {
			const sel = createSelection(createPosition(B1, 3), createPosition(B1, 5));
			const m = Mapping.from([shift(B2, 0, 0, 3)]);
			expect(mapTextSelection(sel, m)).toBe(sel);
		});

		it('produces new instance when endpoints shift', () => {
			const sel = createSelection(createPosition(B1, 3), createPosition(B1, 5));
			const m = Mapping.from([shift(B1, 0, 0, 1)]);
			const result = mapTextSelection(sel, m);
			expect(result).not.toBe(sel);
			expect(result.anchor.offset).toBe(4);
			expect(result.head.offset).toBe(6);
		});
	});

	// --- Node selection ---

	describe('NodeSelection', () => {
		it('survives identity mapping', () => {
			const sel = createNodeSelection(B1, [B1]);
			const m = Mapping.from([shift(B2, 0, 0, 3)]);
			const result = mapSelection(sel, m) as NodeSelection;
			expect(isNodeSelection(result)).toBe(true);
			expect(result.nodeId).toBe(B1);
		});

		it('returns null when targeted node is removed', () => {
			const sel = createNodeSelection(B1, [B1]);
			const m = Mapping.from([blockRemoval(B1)]);
			expect(mapSelection(sel, m)).toBeNull();
		});

		it('returns null when the block was merged into another', () => {
			const sel = createNodeSelection(B2, [B2]);
			const m = Mapping.from([merge(B1, B2, 5)]);
			expect(mapSelection(sel, m)).toBeNull();
		});

		it('preserves selection when other blocks are removed', () => {
			const sel = createNodeSelection(B1, [B1]);
			const m = Mapping.from([blockRemoval(B2, B3)]);
			const result = mapSelection(sel, m) as NodeSelection;
			expect(result.nodeId).toBe(B1);
		});
	});

	// --- Gap cursor ---

	describe('GapCursorSelection', () => {
		it('survives identity mapping', () => {
			const sel = createGapCursor(B1, 'before', [B1]);
			const m = Mapping.from([shift(B2, 0, 0, 3)]);
			const result = mapSelection(sel, m) as GapCursorSelection;
			expect(isGapCursor(result)).toBe(true);
			expect(result.blockId).toBe(B1);
		});

		it('returns null when the host block is removed', () => {
			const sel = createGapCursor(B1, 'after', [B1]);
			const m = Mapping.from([blockRemoval(B1)]);
			expect(mapSelection(sel, m)).toBeNull();
		});

		it('returns null when the host block is merged away', () => {
			const sel = createGapCursor(B2, 'before', [B2]);
			const m = Mapping.from([merge(B1, B2, 3)]);
			expect(mapSelection(sel, m)).toBeNull();
		});
	});
});
