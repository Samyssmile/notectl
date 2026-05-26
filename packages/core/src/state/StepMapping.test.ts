import { describe, expect, it } from 'vitest';
import type { BlockNode, Document, Mark, TextNode } from '../model/Document.js';
import { createBlockNode, createDocument, createTextNode } from '../model/Document.js';
import { type BlockId, blockId, markType, nodeType } from '../model/TypeBrands.js';
import {
	type BlockRemovalMap,
	Mapping,
	type MergeMap,
	type ShiftMap,
	type SplitMap,
} from './Mapping.js';
import { mapStep } from './StepHandlers.js';
import type {
	AddMarkStep,
	DeleteTextStep,
	InsertTextStep,
	MergeBlocksStep,
	RemoveNodeStep,
	SetBlockTypeStep,
	SplitBlockStep,
} from './Steps.js';

const B1 = blockId('b1');
const B2 = blockId('b2');
const B3 = blockId('b3');

const shift = (bid: BlockId, from: number, to: number, newLen: number): ShiftMap => ({
	type: 'shift',
	blockId: bid,
	from,
	to,
	newLen,
});

const split = (bid: BlockId, offset: number, newBid: BlockId): SplitMap => ({
	type: 'split',
	blockId: bid,
	offset,
	newBlockId: newBid,
});

const merge = (target: BlockId, source: BlockId, targetLen: number): MergeMap => ({
	type: 'merge',
	targetBlockId: target,
	sourceBlockId: source,
	targetLengthBefore: targetLen,
});

const blockRemoval = (...ids: BlockId[]): BlockRemovalMap => ({
	type: 'blockRemoval',
	removedBlockIds: new Set(ids),
});

function docWith(...blocks: BlockNode[]): Document {
	return createDocument(blocks);
}

function paragraphBlock(text: string, bid: BlockId = B1, marks: readonly Mark[] = []): BlockNode {
	return createBlockNode('paragraph', [createTextNode(text, marks)], bid);
}

describe('mapStep', () => {
	// --- insertText ---

	describe('insertText', () => {
		const baseStep: InsertTextStep = {
			type: 'insertText',
			blockId: B1,
			offset: 5,
			text: 'X',
			marks: [],
		};
		const doc = docWith(paragraphBlock('hello world'));

		it('passes through unchanged on empty mapping', () => {
			const result = mapStep(baseStep, Mapping.empty, doc);
			expect(result).toBe(baseStep);
		});

		it('shifts offset right when intervening insertion precedes it', () => {
			const m = Mapping.from([shift(B1, 0, 0, 3)]);
			const result = mapStep(baseStep, m, doc) as InsertTextStep;
			expect(result.type).toBe('insertText');
			expect(result.offset).toBe(8);
			expect(result.text).toBe('X');
		});

		it('preserves offset when intervening edit is past the insertion point', () => {
			const m = Mapping.from([shift(B1, 10, 10, 2)]);
			const result = mapStep(baseStep, m, doc) as InsertTextStep;
			expect(result.offset).toBe(5);
		});

		it('migrates to the new block when split moves the offset', () => {
			const m = Mapping.from([split(B1, 3, B2)]);
			const result = mapStep(baseStep, m, doc) as InsertTextStep;
			expect(result.blockId).toBe(B2);
			expect(result.offset).toBe(2);
		});

		it('returns null when the host block was removed', () => {
			const m = Mapping.from([blockRemoval(B1)]);
			const result = mapStep(baseStep, m, doc);
			expect(result).toBeNull();
		});

		it('shifts through merge when the block was merged into another', () => {
			const m = Mapping.from([merge(B2, B1, 4)]);
			const result = mapStep(baseStep, m, doc) as InsertTextStep;
			expect(result.blockId).toBe(B2);
			expect(result.offset).toBe(5 + 4);
		});
	});

	// --- deleteText ---

	describe('deleteText', () => {
		const baseStep: DeleteTextStep = {
			type: 'deleteText',
			blockId: B1,
			from: 5,
			to: 8,
			deletedText: ' wo',
			deletedMarks: [],
			deletedSegments: [{ text: ' wo', marks: [] }],
		};

		it('passes through unchanged on empty mapping', () => {
			const doc = docWith(paragraphBlock('hello world'));
			expect(mapStep(baseStep, Mapping.empty, doc)).toBe(baseStep);
		});

		it('shifts both endpoints through a preceding insertion', () => {
			const m = Mapping.from([shift(B1, 0, 0, 2)]);
			const doc = docWith(paragraphBlock('xxhello world'));
			const result = mapStep(baseStep, m, doc) as DeleteTextStep;
			expect(result.type).toBe('deleteText');
			expect(result.from).toBe(7);
			expect(result.to).toBe(10);
			expect(result.deletedText).toBe(' wo');
		});

		it('returns null when the entire range was deleted by intervening', () => {
			const m = Mapping.from([shift(B1, 4, 9, 0)]);
			const doc = docWith(paragraphBlock('hellld'));
			const result = mapStep(baseStep, m, doc);
			expect(result).toBeNull();
		});

		it('re-snapshots deletedText / marks from the current doc when offsets move', () => {
			const m = Mapping.from([shift(B1, 0, 0, 4)]);
			const doc = docWith(paragraphBlock('AAAAhello world'));
			const result = mapStep(baseStep, m, doc) as DeleteTextStep;
			expect(result.from).toBe(9);
			expect(result.to).toBe(12);
			expect(result.deletedText).toBe(' wo');
		});

		it('returns null when the host block was removed', () => {
			const m = Mapping.from([blockRemoval(B1)]);
			const doc = docWith(paragraphBlock('other', B2));
			expect(mapStep(baseStep, m, doc)).toBeNull();
		});

		it('returns null when split fragments the range across two blocks', () => {
			const m = Mapping.from([split(B1, 6, B2)]);
			const doc = docWith(paragraphBlock('hello ', B1), paragraphBlock('world', B2));
			const result = mapStep(baseStep, m, doc);
			expect(result).toBeNull();
		});
	});

	// --- addMark / removeMark ---

	describe('addMark / removeMark', () => {
		const boldMark: Mark = { type: markType('bold') };
		const addStep: AddMarkStep = {
			type: 'addMark',
			blockId: B1,
			from: 3,
			to: 8,
			mark: boldMark,
		};

		it('shifts mark range through preceding insertion', () => {
			const m = Mapping.from([shift(B1, 0, 0, 2)]);
			const doc = docWith(paragraphBlock('xxhello world'));
			const result = mapStep(addStep, m, doc) as AddMarkStep;
			expect(result.type).toBe('addMark');
			expect(result.from).toBe(5);
			expect(result.to).toBe(10);
			expect(result.mark).toBe(boldMark);
		});

		it('returns null when the range is fully eaten', () => {
			const m = Mapping.from([shift(B1, 0, 11, 0)]);
			const doc = docWith(paragraphBlock(''));
			expect(mapStep(addStep, m, doc)).toBeNull();
		});

		it('returns null when the host block was removed', () => {
			const m = Mapping.from([blockRemoval(B1)]);
			const doc = docWith(paragraphBlock('other', B2));
			expect(mapStep(addStep, m, doc)).toBeNull();
		});
	});

	// --- splitBlock / mergeBlocks ---

	describe('splitBlock', () => {
		const baseStep: SplitBlockStep = {
			type: 'splitBlock',
			blockId: B1,
			offset: 5,
			newBlockId: B3,
		};

		it('shifts offset through preceding insertion', () => {
			const m = Mapping.from([shift(B1, 0, 0, 2)]);
			const doc = docWith(paragraphBlock('xxhello world'));
			const result = mapStep(baseStep, m, doc) as SplitBlockStep;
			expect(result.offset).toBe(7);
			expect(result.newBlockId).toBe(B3);
		});

		it('returns null when the host block was removed', () => {
			const m = Mapping.from([blockRemoval(B1)]);
			const doc = docWith(paragraphBlock('other', B2));
			expect(mapStep(baseStep, m, doc)).toBeNull();
		});

		it('migrates to the new block on intervening split', () => {
			const m = Mapping.from([split(B1, 3, B2)]);
			const doc = docWith(paragraphBlock('hel', B1), paragraphBlock('lo world', B2));
			const result = mapStep(baseStep, m, doc) as SplitBlockStep;
			expect(result.blockId).toBe(B2);
			expect(result.offset).toBe(2);
		});
	});

	describe('mergeBlocks', () => {
		const baseStep: MergeBlocksStep = {
			type: 'mergeBlocks',
			targetBlockId: B1,
			sourceBlockId: B2,
			targetLengthBefore: 5,
		};

		it('passes through unchanged on empty mapping', () => {
			const doc = docWith(paragraphBlock('hello', B1), paragraphBlock('world', B2));
			expect(mapStep(baseStep, Mapping.empty, doc)).toBe(baseStep);
		});

		it('re-snapshots targetLengthBefore from the current doc', () => {
			const m = Mapping.from([shift(B1, 0, 0, 3)]);
			const doc = docWith(paragraphBlock('xxxhello', B1), paragraphBlock('world', B2));
			const result = mapStep(baseStep, m, doc) as MergeBlocksStep;
			expect(result.targetLengthBefore).toBe(8);
		});

		it('returns null when the target block was removed', () => {
			const m = Mapping.from([blockRemoval(B1)]);
			const doc = docWith(paragraphBlock('world', B2));
			expect(mapStep(baseStep, m, doc)).toBeNull();
		});

		it('returns null when the source block was removed', () => {
			const m = Mapping.from([blockRemoval(B2)]);
			const doc = docWith(paragraphBlock('hello', B1));
			expect(mapStep(baseStep, m, doc)).toBeNull();
		});

		it('returns null when target and source got merged into the same block', () => {
			const m = Mapping.from([merge(B1, B2, 5)]);
			const doc = docWith(paragraphBlock('helloworld', B1));
			expect(mapStep(baseStep, m, doc)).toBeNull();
		});
	});

	// --- setBlockType ---

	describe('setBlockType', () => {
		const baseStep: SetBlockTypeStep = {
			type: 'setBlockType',
			blockId: B1,
			nodeType: nodeType('heading'),
			previousNodeType: nodeType('paragraph'),
		};

		it('returns null when the block was removed', () => {
			const m = Mapping.from([blockRemoval(B1)]);
			const doc = docWith(paragraphBlock('other', B2));
			expect(mapStep(baseStep, m, doc)).toBeNull();
		});

		it('re-snapshots previousNodeType from the current doc', () => {
			const doc = docWith(createBlockNode('code_block', [createTextNode('code')], B1));
			const m = Mapping.from([shift(B1, 0, 0, 0)]); // non-identity but doesn't move block
			// Use a real intervening shift that doesn't change block id but forces re-snapshot.
			const result = mapStep(baseStep, m, doc) as SetBlockTypeStep;
			expect(result.previousNodeType).toBe('code_block');
		});
	});

	// --- removeNode ---

	describe('removeNode', () => {
		const removedNode: BlockNode = createBlockNode(
			'paragraph',
			[createTextNode('removed') as TextNode],
			B2,
		);
		const baseStep: RemoveNodeStep = {
			type: 'removeNode',
			parentPath: [],
			index: 1,
			removedNode,
		};

		it('returns null when the to-be-removed block has already been removed', () => {
			const m = Mapping.from([blockRemoval(B2)]);
			const doc = docWith(paragraphBlock('first', B1));
			expect(mapStep(baseStep, m, doc)).toBeNull();
		});

		it('returns null when an ancestor in parentPath was removed', () => {
			const nestedStep: RemoveNodeStep = {
				...baseStep,
				parentPath: [B1],
			};
			const m = Mapping.from([blockRemoval(B1)]);
			const doc = docWith(paragraphBlock('something', B3));
			expect(mapStep(nestedStep, m, doc)).toBeNull();
		});

		it('passes through unchanged when the target block survives', () => {
			const doc = docWith(paragraphBlock('first', B1), removedNode);
			const m = Mapping.from([shift(B1, 0, 0, 1)]);
			const result = mapStep(baseStep, m, doc);
			expect(result).toBe(baseStep);
		});
	});

	// --- chained mappings ---

	describe('composed mappings', () => {
		it('composes shift + shift correctly for a deleteText range', () => {
			const step: DeleteTextStep = {
				type: 'deleteText',
				blockId: B1,
				from: 5,
				to: 8,
				deletedText: 'wor',
				deletedMarks: [],
				deletedSegments: [{ text: 'wor', marks: [] }],
			};
			const m = Mapping.from([shift(B1, 0, 0, 2), shift(B1, 10, 10, 3)]);
			const doc = docWith(paragraphBlock('xxhelloXXX world'));
			const result = mapStep(step, m, doc) as DeleteTextStep;
			expect(result.from).toBe(7);
			expect(result.to).toBe(10);
		});

		it('returns null when chained mappings remove the host block', () => {
			const step: InsertTextStep = {
				type: 'insertText',
				blockId: B1,
				offset: 0,
				text: 'X',
				marks: [],
			};
			const m = Mapping.from([shift(B1, 0, 0, 5), blockRemoval(B1)]);
			const doc = docWith(paragraphBlock('other', B2));
			expect(mapStep(step, m, doc)).toBeNull();
		});
	});
});
