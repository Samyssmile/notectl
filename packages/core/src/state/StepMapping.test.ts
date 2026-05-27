import { describe, expect, it } from 'vitest';
import type { BlockNode, Document, InlineNode, Mark, TextNode } from '../model/Document.js';
import {
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
} from '../model/Document.js';
import { type BlockId, blockId, inlineType, markType, nodeType } from '../model/TypeBrands.js';
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
	InsertInlineNodeStep,
	InsertNodeStep,
	InsertTextStep,
	MergeBlocksStep,
	RemoveInlineNodeStep,
	RemoveNodeStep,
	SetBlockTypeStep,
	SetInlineNodeAttrStep,
	SetNodeAttrStep,
	SetStoredMarksStep,
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

	// --- insertInlineNode ---

	describe('insertInlineNode', () => {
		const mention: InlineNode = createInlineNode(inlineType('mention'), { user: 'alice' });
		const baseStep: InsertInlineNodeStep = {
			type: 'insertInlineNode',
			blockId: B1,
			offset: 5,
			node: mention,
		};
		const doc = docWith(paragraphBlock('hello world'));

		it('passes through unchanged on empty mapping', () => {
			expect(mapStep(baseStep, Mapping.empty, doc)).toBe(baseStep);
		});

		it('shifts offset right when intervening insertion precedes it', () => {
			const m = Mapping.from([shift(B1, 0, 0, 2)]);
			const result = mapStep(baseStep, m, doc) as InsertInlineNodeStep;
			expect(result.type).toBe('insertInlineNode');
			expect(result.offset).toBe(7);
			expect(result.node).toBe(mention);
		});

		it('returns null when the host block was removed', () => {
			const m = Mapping.from([blockRemoval(B1)]);
			expect(mapStep(baseStep, m, doc)).toBeNull();
		});

		it('migrates to the new block on intervening split', () => {
			const m = Mapping.from([split(B1, 3, B2)]);
			const splitDoc = docWith(paragraphBlock('hel', B1), paragraphBlock('lo world', B2));
			const result = mapStep(baseStep, m, splitDoc) as InsertInlineNodeStep;
			expect(result.blockId).toBe(B2);
			expect(result.offset).toBe(2);
			expect(result.node).toBe(mention);
		});
	});

	// --- removeInlineNode ---

	describe('removeInlineNode', () => {
		const mention: InlineNode = createInlineNode(inlineType('mention'), { user: 'alice' });
		const otherMention: InlineNode = createInlineNode(inlineType('mention'), { user: 'bob' });

		function blockWithInline(
			inline: InlineNode,
			leading: string,
			trailing: string,
			bid: BlockId = B1,
		): BlockNode {
			return createBlockNode(
				'paragraph',
				[createTextNode(leading), inline, createTextNode(trailing)],
				bid,
			);
		}

		const baseStep: RemoveInlineNodeStep = {
			type: 'removeInlineNode',
			blockId: B1,
			offset: 5,
			removedNode: mention,
		};

		it('passes through unchanged on empty mapping', () => {
			const doc = docWith(blockWithInline(mention, 'hello', ' world'));
			expect(mapStep(baseStep, Mapping.empty, doc)).toBe(baseStep);
		});

		it('shifts offset right and re-snapshots removedNode through preceding insertion', () => {
			const m = Mapping.from([shift(B1, 0, 0, 2)]);
			const doc = docWith(blockWithInline(mention, 'xxhello', ' world'));
			const result = mapStep(baseStep, m, doc) as RemoveInlineNodeStep;
			expect(result.type).toBe('removeInlineNode');
			expect(result.offset).toBe(7);
			expect(result.removedNode.inlineType).toBe('mention');
			expect(result.removedNode.attrs.user).toBe('alice');
		});

		it('returns null when the host block was removed', () => {
			const m = Mapping.from([blockRemoval(B1)]);
			const doc = docWith(paragraphBlock('other', B2));
			expect(mapStep(baseStep, m, doc)).toBeNull();
		});

		it('returns null when the inline at the rebased offset has been replaced', () => {
			// Intervening removed `mention(alice)` at offset 5 and inserted
			// `mention(bob)` at the same offset — position-mapping shows zero
			// net shift but the inline at offset 5 is no longer the user's.
			const m = Mapping.from([shift(B1, 5, 6, 1)]);
			const doc = docWith(blockWithInline(otherMention, 'hello', ' world'));
			expect(mapStep(baseStep, m, doc)).toBeNull();
		});

		it('returns null when the rebased range is no longer width-1', () => {
			const m = Mapping.from([shift(B1, 6, 6, 3)]);
			const doc = docWith(blockWithInline(mention, 'hello', 'XXX world'));
			expect(mapStep(baseStep, m, doc)).toBeNull();
		});

		it('returns null when content at the rebased offset is text instead of inline', () => {
			const m = Mapping.from([shift(B1, 0, 6, 5)]);
			const doc = docWith(paragraphBlock('AAAAA world'));
			expect(mapStep(baseStep, m, doc)).toBeNull();
		});
	});

	// --- setInlineNodeAttr ---

	describe('setInlineNodeAttr', () => {
		const mention: InlineNode = createInlineNode(inlineType('mention'), { user: 'alice' });

		function blockWithInline(inline: InlineNode, leading: string, bid: BlockId = B1): BlockNode {
			return createBlockNode('paragraph', [createTextNode(leading), inline], bid);
		}

		const baseStep: SetInlineNodeAttrStep = {
			type: 'setInlineNodeAttr',
			blockId: B1,
			offset: 5,
			attrs: { user: 'carol' },
			previousAttrs: { user: 'alice' },
		};

		it('passes through unchanged on empty mapping', () => {
			const doc = docWith(blockWithInline(mention, 'hello'));
			expect(mapStep(baseStep, Mapping.empty, doc)).toBe(baseStep);
		});

		it('shifts offset right and re-snapshots previousAttrs through preceding insertion', () => {
			const m = Mapping.from([shift(B1, 0, 0, 2)]);
			const doc = docWith(blockWithInline(mention, 'xxhello'));
			const result = mapStep(baseStep, m, doc) as SetInlineNodeAttrStep;
			expect(result.type).toBe('setInlineNodeAttr');
			expect(result.offset).toBe(7);
			expect(result.attrs.user).toBe('carol');
			expect(result.previousAttrs.user).toBe('alice');
		});

		it('returns null when the host block was removed', () => {
			const m = Mapping.from([blockRemoval(B1)]);
			const doc = docWith(paragraphBlock('other', B2));
			expect(mapStep(baseStep, m, doc)).toBeNull();
		});

		it('returns null when the rebased range is no longer width-1', () => {
			const m = Mapping.from([shift(B1, 6, 6, 3)]);
			const doc = docWith(blockWithInline(mention, 'hello'));
			expect(mapStep(baseStep, m, doc)).toBeNull();
		});

		it('returns null when content at the rebased offset is not an inline node', () => {
			const m = Mapping.from([shift(B1, 0, 6, 5)]);
			const doc = docWith(paragraphBlock('AAAAA world'));
			expect(mapStep(baseStep, m, doc)).toBeNull();
		});
	});

	// --- setNodeAttr ---

	describe('setNodeAttr', () => {
		const baseStep: SetNodeAttrStep = {
			type: 'setNodeAttr',
			path: [B1],
			attrs: { level: 2 },
			previousAttrs: { level: 1 },
		};

		it('passes through unchanged on empty mapping', () => {
			const doc = docWith(createBlockNode('heading', [createTextNode('h')], B1, { level: 1 }));
			expect(mapStep(baseStep, Mapping.empty, doc)).toBe(baseStep);
		});

		it('returns null when an ancestor in path was removed', () => {
			const m = Mapping.from([blockRemoval(B1)]);
			const doc = docWith(paragraphBlock('other', B2));
			expect(mapStep(baseStep, m, doc)).toBeNull();
		});

		it('returns null when the node at path is no longer resolvable', () => {
			// Path is structurally valid (parentPath check passes) but the node
			// itself has been removed by something the position mapping does
			// not encode (e.g. a structural removal under the same parent).
			const m = Mapping.from([shift(B2, 0, 0, 1)]);
			const doc = docWith(paragraphBlock('xother', B2));
			expect(mapStep(baseStep, m, doc)).toBeNull();
		});

		it('re-snapshots previousAttrs from the current doc', () => {
			const doc = docWith(createBlockNode('heading', [createTextNode('h')], B1, { level: 4 }));
			const m = Mapping.from([shift(B1, 0, 0, 1)]);
			const result = mapStep(baseStep, m, doc) as SetNodeAttrStep;
			expect(result.path).toEqual([B1]);
			expect(result.attrs).toEqual({ level: 2 });
			expect(result.previousAttrs).toEqual({ level: 4 });
		});
	});

	// --- setStoredMarks ---

	describe('setStoredMarks', () => {
		const boldMark: Mark = { type: markType('bold') };
		const baseStep: SetStoredMarksStep = {
			type: 'setStoredMarks',
			marks: [boldMark],
			previousMarks: null,
		};

		it('passes through unchanged on empty mapping', () => {
			const doc = docWith(paragraphBlock('hello'));
			expect(mapStep(baseStep, Mapping.empty, doc)).toBe(baseStep);
		});

		it('passes through unchanged through arbitrary intervening edits', () => {
			// setStoredMarks is state-level only; no document coordinates to rebase.
			const m = Mapping.from([shift(B1, 0, 0, 5), blockRemoval(B1)]);
			const doc = docWith(paragraphBlock('other', B2));
			expect(mapStep(baseStep, m, doc)).toBe(baseStep);
		});
	});

	// --- insertNode ---

	describe('insertNode', () => {
		const insertedNode: BlockNode = createBlockNode(
			'paragraph',
			[createTextNode('new')],
			blockId('bx'),
		);
		const baseStep: InsertNodeStep = {
			type: 'insertNode',
			parentPath: [],
			index: 1,
			node: insertedNode,
		};

		it('passes through unchanged on empty mapping', () => {
			const doc = docWith(paragraphBlock('first'));
			expect(mapStep(baseStep, Mapping.empty, doc)).toBe(baseStep);
		});

		it('returns null when an ancestor in parentPath was removed', () => {
			const nestedStep: InsertNodeStep = {
				...baseStep,
				parentPath: [B1],
			};
			const m = Mapping.from([blockRemoval(B1)]);
			const doc = docWith(paragraphBlock('other', B2));
			expect(mapStep(nestedStep, m, doc)).toBeNull();
		});

		it('passes through unchanged when parent path survives an unrelated shift', () => {
			const nestedStep: InsertNodeStep = {
				...baseStep,
				parentPath: [B1],
			};
			const m = Mapping.from([shift(B1, 0, 0, 3)]);
			const doc = docWith(paragraphBlock('xxxhello', B1));
			const result = mapStep(nestedStep, m, doc);
			expect(result).toBe(nestedStep);
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
