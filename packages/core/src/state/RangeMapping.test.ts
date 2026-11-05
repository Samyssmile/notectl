import { describe, expect, it } from 'vitest';
import { createBlockNode } from '../model/Document.js';
import { type BlockId, blockId, nodeType } from '../model/TypeBrands.js';
import { Mapping, type StepMap, collectRemovedBlockIds } from './Mapping.js';
import { mapRangeContent } from './RangeMapping.js';

const B1: BlockId = blockId('b1');
const B2: BlockId = blockId('b2');
const B0: BlockId = blockId('b0');

function shift(from: number, to: number, newLen: number, id: BlockId = B1): StepMap {
	return { type: 'shift', blockId: id, from, to, newLen };
}

function split(offset: number): StepMap {
	return { type: 'split', blockId: B1, offset, newBlockId: B2 };
}

function pieces(from: number, to: number, ...maps: StepMap[]): unknown[] {
	return [...mapRangeContent(B1, from, to, Mapping.from(maps))];
}

describe('mapRangeContent', () => {
	it('returns the range itself through an empty mapping', () => {
		expect(pieces(2, 5)).toEqual([{ blockId: B1, from: 2, to: 5 }]);
	});

	it('returns nothing for an empty range', () => {
		expect(pieces(3, 3, shift(0, 0, 2))).toEqual([]);
	});

	it('shifts the range past an insertion in front of it', () => {
		expect(pieces(2, 5, shift(0, 0, 3))).toEqual([{ blockId: B1, from: 5, to: 8 }]);
	});

	it('ignores edits behind the range and in other blocks', () => {
		expect(pieces(2, 5, shift(7, 7, 3), shift(0, 0, 1, B2))).toEqual([
			{ blockId: B1, from: 2, to: 5 },
		]);
	});

	it('leaves insertions at either boundary outside the range', () => {
		expect(pieces(2, 5, shift(2, 2, 1))).toEqual([{ blockId: B1, from: 3, to: 6 }]);
		expect(pieces(2, 5, shift(5, 5, 1))).toEqual([{ blockId: B1, from: 2, to: 5 }]);
	});

	it('cuts an insertion inside the range out of it', () => {
		expect(pieces(0, 5, shift(2, 2, 1))).toEqual([
			{ blockId: B1, from: 0, to: 2 },
			{ blockId: B1, from: 3, to: 6 },
		]);
	});

	it('drops the content a deletion removed', () => {
		expect(pieces(2, 6, shift(4, 8, 0))).toEqual([{ blockId: B1, from: 2, to: 4 }]);
		expect(pieces(2, 6, shift(0, 3, 0))).toEqual([{ blockId: B1, from: 0, to: 3 }]);
	});

	it('returns nothing once all content was deleted', () => {
		expect(pieces(2, 5, shift(1, 6, 0))).toEqual([]);
	});

	it('keeps only the untouched parts around a replacement inside the range', () => {
		expect(pieces(0, 6, shift(2, 4, 3))).toEqual([
			{ blockId: B1, from: 0, to: 2 },
			{ blockId: B1, from: 5, to: 7 },
		]);
	});

	it('moves the part behind a split into the new block', () => {
		expect(pieces(3, 8, split(5))).toEqual([
			{ blockId: B1, from: 3, to: 5 },
			{ blockId: B2, from: 0, to: 3 },
		]);
	});

	it('moves a range behind a split into the new block whole', () => {
		expect(pieces(6, 8, split(5))).toEqual([{ blockId: B2, from: 1, to: 3 }]);
		expect(pieces(5, 8, split(5))).toEqual([{ blockId: B2, from: 0, to: 3 }]);
	});

	it('moves a merged block’s range behind the target block’s content', () => {
		const merge: StepMap = {
			type: 'merge',
			targetBlockId: B0,
			sourceBlockId: B1,
			targetLengthBefore: 4,
		};

		expect(pieces(1, 3, merge)).toEqual([{ blockId: B0, from: 5, to: 7 }]);
	});

	it('returns nothing once the block was removed', () => {
		const removal: StepMap = {
			type: 'blockRemoval',
			removedBlockIds: collectRemovedBlockIds(createBlockNode(nodeType('paragraph'), [], B1)),
			parentPath: [],
			index: 0,
		};

		expect(pieces(1, 3, removal)).toEqual([]);
	});

	it('follows each piece through later maps', () => {
		// Insertion inside, then a split behind the insertion.
		expect(pieces(0, 6, shift(2, 2, 1), split(4))).toEqual([
			{ blockId: B1, from: 0, to: 2 },
			{ blockId: B1, from: 3, to: 4 },
			{ blockId: B2, from: 0, to: 3 },
		]);
	});
});
