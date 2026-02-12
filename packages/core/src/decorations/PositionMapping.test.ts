import { describe, expect, it } from 'vitest';
import { blockId } from '../model/TypeBrands.js';
import type { BlockId } from '../model/TypeBrands.js';
import type {
	DeleteTextStep,
	InsertTextStep,
	MergeBlocksStep,
	RemoveNodeStep,
	SplitBlockStep,
	Step,
} from '../state/Transaction.js';
import { inline, node, widget } from './Decoration.js';
import type { InlineDecoration, NodeDecoration, WidgetDecoration } from './Decoration.js';
import { mapDecorationThroughStep } from './PositionMapping.js';

const B1: BlockId = blockId('b1');
const B2: BlockId = blockId('b2');
const B3: BlockId = blockId('b3');

const DUMMY_TO_DOM = () => document.createElement('span');

// --- Helpers ---

function insertTextStep(bid: BlockId, offset: number, text: string): InsertTextStep {
	return { type: 'insertText', blockId: bid, offset, text, marks: [] };
}

function deleteTextStep(bid: BlockId, from: number, to: number): DeleteTextStep {
	return {
		type: 'deleteText',
		blockId: bid,
		from,
		to,
		deletedText: 'x'.repeat(to - from),
		deletedMarks: [],
		deletedSegments: [],
	};
}

function splitBlockStep(bid: BlockId, offset: number, newBid: BlockId): SplitBlockStep {
	return { type: 'splitBlock', blockId: bid, offset, newBlockId: newBid };
}

function mergeBlocksStep(target: BlockId, source: BlockId, targetLen: number): MergeBlocksStep {
	return {
		type: 'mergeBlocks',
		targetBlockId: target,
		sourceBlockId: source,
		targetLengthBefore: targetLen,
	};
}

function removeNodeStep(removedId: BlockId): RemoveNodeStep {
	return {
		type: 'removeNode',
		parentPath: [],
		index: 0,
		removedNode: {
			type: 'paragraph',
			id: removedId,
			children: [],
			attrs: {},
		} as never,
	};
}

// --- InsertText × Inline ---

describe('mapDecorationThroughStep', () => {
	describe('InsertText × InlineDecoration', () => {
		it('shifts range when insertion is before', () => {
			const deco: InlineDecoration = inline(B1, 5, 10, { class: 'hl' });
			const step: InsertTextStep = insertTextStep(B1, 2, 'abc');
			const result = mapDecorationThroughStep(deco, step) as InlineDecoration;
			expect(result.from).toBe(8);
			expect(result.to).toBe(13);
		});

		it('expands to when insertion is at from (assoc=-1: from stays)', () => {
			const deco: InlineDecoration = inline(B1, 5, 10, { class: 'hl' });
			const step: InsertTextStep = insertTextStep(B1, 5, 'ab');
			const result = mapDecorationThroughStep(deco, step) as InlineDecoration;
			expect(result.from).toBe(5);
			expect(result.to).toBe(12);
		});

		it('expands range when insertion is inside', () => {
			const deco: InlineDecoration = inline(B1, 5, 10, { class: 'hl' });
			const step: InsertTextStep = insertTextStep(B1, 7, 'xx');
			const result = mapDecorationThroughStep(deco, step) as InlineDecoration;
			expect(result.from).toBe(5);
			expect(result.to).toBe(12);
		});

		it('does not shift when insertion is at to (assoc=1: to shifts)', () => {
			const deco: InlineDecoration = inline(B1, 5, 10, { class: 'hl' });
			const step: InsertTextStep = insertTextStep(B1, 10, 'z');
			const result = mapDecorationThroughStep(deco, step) as InlineDecoration;
			expect(result.from).toBe(5);
			expect(result.to).toBe(11);
		});

		it('unchanged when insertion is after', () => {
			const deco: InlineDecoration = inline(B1, 5, 10, { class: 'hl' });
			const step: InsertTextStep = insertTextStep(B1, 15, 'z');
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBe(deco);
		});

		it('unchanged when different block', () => {
			const deco: InlineDecoration = inline(B1, 5, 10, { class: 'hl' });
			const step: InsertTextStep = insertTextStep(B2, 5, 'abc');
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBe(deco);
		});
	});

	// --- InsertText × Widget ---

	describe('InsertText × WidgetDecoration', () => {
		it('shifts when insertion is before offset', () => {
			const deco: WidgetDecoration = widget(B1, 5, DUMMY_TO_DOM);
			const step: InsertTextStep = insertTextStep(B1, 2, 'abc');
			const result = mapDecorationThroughStep(deco, step) as WidgetDecoration;
			expect(result.offset).toBe(8);
		});

		it('stays at boundary with side=-1 (default)', () => {
			const deco: WidgetDecoration = widget(B1, 5, DUMMY_TO_DOM);
			const step: InsertTextStep = insertTextStep(B1, 5, 'ab');
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBe(deco);
		});

		it('moves at boundary with side=1', () => {
			const deco: WidgetDecoration = widget(B1, 5, DUMMY_TO_DOM, { side: 1 });
			const step: InsertTextStep = insertTextStep(B1, 5, 'ab');
			const result = mapDecorationThroughStep(deco, step) as WidgetDecoration;
			expect(result.offset).toBe(7);
		});

		it('unchanged when different block', () => {
			const deco: WidgetDecoration = widget(B1, 5, DUMMY_TO_DOM);
			const step: InsertTextStep = insertTextStep(B2, 2, 'abc');
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBe(deco);
		});
	});

	// --- InsertText × Node ---

	describe('InsertText × NodeDecoration', () => {
		it('unchanged regardless of insertion', () => {
			const deco: NodeDecoration = node(B1, { class: 'sel' });
			const step: InsertTextStep = insertTextStep(B1, 5, 'abc');
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBe(deco);
		});
	});

	// --- DeleteText × Inline ---

	describe('DeleteText × InlineDecoration', () => {
		it('shifts range when deletion is before', () => {
			const deco: InlineDecoration = inline(B1, 5, 10, { class: 'hl' });
			const step: DeleteTextStep = deleteTextStep(B1, 0, 3);
			const result = mapDecorationThroughStep(deco, step) as InlineDecoration;
			expect(result.from).toBe(2);
			expect(result.to).toBe(7);
		});

		it('clamps from into deleted range', () => {
			const deco: InlineDecoration = inline(B1, 3, 10, { class: 'hl' });
			const step: DeleteTextStep = deleteTextStep(B1, 2, 5);
			const result = mapDecorationThroughStep(deco, step) as InlineDecoration;
			expect(result.from).toBe(2);
			expect(result.to).toBe(7);
		});

		it('clamps to into deleted range', () => {
			const deco: InlineDecoration = inline(B1, 0, 4, { class: 'hl' });
			const step: DeleteTextStep = deleteTextStep(B1, 2, 6);
			const result = mapDecorationThroughStep(deco, step) as InlineDecoration;
			expect(result.from).toBe(0);
			expect(result.to).toBe(2);
		});

		it('returns null when range fully consumed', () => {
			const deco: InlineDecoration = inline(B1, 3, 7, { class: 'hl' });
			const step: DeleteTextStep = deleteTextStep(B1, 2, 8);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBeNull();
		});

		it('returns null when from === to after clamping', () => {
			const deco: InlineDecoration = inline(B1, 3, 5, { class: 'hl' });
			const step: DeleteTextStep = deleteTextStep(B1, 3, 5);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBeNull();
		});

		it('unchanged when deletion is after', () => {
			const deco: InlineDecoration = inline(B1, 0, 3, { class: 'hl' });
			const step: DeleteTextStep = deleteTextStep(B1, 5, 8);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBe(deco);
		});

		it('unchanged when different block', () => {
			const deco: InlineDecoration = inline(B1, 5, 10, { class: 'hl' });
			const step: DeleteTextStep = deleteTextStep(B2, 5, 8);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBe(deco);
		});
	});

	// --- DeleteText × Widget ---

	describe('DeleteText × WidgetDecoration', () => {
		it('shifts when deletion is before offset', () => {
			const deco: WidgetDecoration = widget(B1, 8, DUMMY_TO_DOM);
			const step: DeleteTextStep = deleteTextStep(B1, 2, 5);
			const result = mapDecorationThroughStep(deco, step) as WidgetDecoration;
			expect(result.offset).toBe(5);
		});

		it('deletes when offset is strictly inside deleted range', () => {
			const deco: WidgetDecoration = widget(B1, 4, DUMMY_TO_DOM);
			const step: DeleteTextStep = deleteTextStep(B1, 2, 6);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBeNull();
		});

		it('survives at deletion boundary (from)', () => {
			const deco: WidgetDecoration = widget(B1, 2, DUMMY_TO_DOM);
			const step: DeleteTextStep = deleteTextStep(B1, 2, 6);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBe(deco);
		});

		it('shifts from deletion boundary (to)', () => {
			const deco: WidgetDecoration = widget(B1, 6, DUMMY_TO_DOM);
			const step: DeleteTextStep = deleteTextStep(B1, 2, 6);
			const result = mapDecorationThroughStep(deco, step) as WidgetDecoration;
			expect(result.offset).toBe(2);
		});

		it('unchanged when different block', () => {
			const deco: WidgetDecoration = widget(B1, 4, DUMMY_TO_DOM);
			const step: DeleteTextStep = deleteTextStep(B2, 2, 6);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBe(deco);
		});
	});

	// --- DeleteText × Node ---

	describe('DeleteText × NodeDecoration', () => {
		it('unchanged regardless of deletion', () => {
			const deco: NodeDecoration = node(B1, { class: 'sel' });
			const step: DeleteTextStep = deleteTextStep(B1, 2, 6);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBe(deco);
		});
	});

	// --- SplitBlock × Inline ---

	describe('SplitBlock × InlineDecoration', () => {
		it('unchanged when entirely before split', () => {
			const deco: InlineDecoration = inline(B1, 0, 3, { class: 'hl' });
			const step: SplitBlockStep = splitBlockStep(B1, 5, B2);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBe(deco);
		});

		it('moves to new block when entirely after split', () => {
			const deco: InlineDecoration = inline(B1, 6, 10, { class: 'hl' });
			const step: SplitBlockStep = splitBlockStep(B1, 5, B2);
			const result = mapDecorationThroughStep(deco, step) as InlineDecoration;
			expect(result.blockId).toBe(B2);
			expect(result.from).toBe(1);
			expect(result.to).toBe(5);
		});

		it('moves to new block when from equals split offset', () => {
			const deco: InlineDecoration = inline(B1, 5, 10, { class: 'hl' });
			const step: SplitBlockStep = splitBlockStep(B1, 5, B2);
			const result = mapDecorationThroughStep(deco, step) as InlineDecoration;
			expect(result.blockId).toBe(B2);
			expect(result.from).toBe(0);
			expect(result.to).toBe(5);
		});

		it('splits into two when spanning split point', () => {
			const deco: InlineDecoration = inline(B1, 3, 8, { class: 'hl' });
			const step: SplitBlockStep = splitBlockStep(B1, 5, B2);
			const result = mapDecorationThroughStep(deco, step) as readonly InlineDecoration[];
			expect(Array.isArray(result)).toBe(true);
			expect(result).toHaveLength(2);
			// Left part stays on original block
			expect(result[0]?.blockId).toBe(B1);
			expect(result[0]?.from).toBe(3);
			expect(result[0]?.to).toBe(5);
			// Right part on new block
			expect(result[1]?.blockId).toBe(B2);
			expect(result[1]?.from).toBe(0);
			expect(result[1]?.to).toBe(3);
		});

		it('unchanged when different block', () => {
			const deco: InlineDecoration = inline(B1, 3, 8, { class: 'hl' });
			const step: SplitBlockStep = splitBlockStep(B2, 5, B3);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBe(deco);
		});
	});

	// --- SplitBlock × Widget ---

	describe('SplitBlock × WidgetDecoration', () => {
		it('stays when before split', () => {
			const deco: WidgetDecoration = widget(B1, 3, DUMMY_TO_DOM);
			const step: SplitBlockStep = splitBlockStep(B1, 5, B2);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBe(deco);
		});

		it('moves to new block when after split', () => {
			const deco: WidgetDecoration = widget(B1, 7, DUMMY_TO_DOM);
			const step: SplitBlockStep = splitBlockStep(B1, 5, B2);
			const result = mapDecorationThroughStep(deco, step) as WidgetDecoration;
			expect(result.blockId).toBe(B2);
			expect(result.offset).toBe(2);
		});

		it('stays at boundary with side=-1', () => {
			const deco: WidgetDecoration = widget(B1, 5, DUMMY_TO_DOM);
			const step: SplitBlockStep = splitBlockStep(B1, 5, B2);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBe(deco);
		});

		it('moves at boundary with side=1', () => {
			const deco: WidgetDecoration = widget(B1, 5, DUMMY_TO_DOM, { side: 1 });
			const step: SplitBlockStep = splitBlockStep(B1, 5, B2);
			const result = mapDecorationThroughStep(deco, step) as WidgetDecoration;
			expect(result.blockId).toBe(B2);
			expect(result.offset).toBe(0);
		});

		it('unchanged when different block', () => {
			const deco: WidgetDecoration = widget(B1, 5, DUMMY_TO_DOM);
			const step: SplitBlockStep = splitBlockStep(B2, 5, B3);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBe(deco);
		});
	});

	// --- SplitBlock × Node ---

	describe('SplitBlock × NodeDecoration', () => {
		it('stays on original block', () => {
			const deco: NodeDecoration = node(B1, { class: 'sel' });
			const step: SplitBlockStep = splitBlockStep(B1, 5, B2);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBe(deco);
		});
	});

	// --- MergeBlocks × Inline ---

	describe('MergeBlocks × InlineDecoration', () => {
		it('shifts source decorations to target with offset', () => {
			const deco: InlineDecoration = inline(B2, 2, 7, { class: 'hl' });
			const step: MergeBlocksStep = mergeBlocksStep(B1, B2, 10);
			const result = mapDecorationThroughStep(deco, step) as InlineDecoration;
			expect(result.blockId).toBe(B1);
			expect(result.from).toBe(12);
			expect(result.to).toBe(17);
		});

		it('leaves target decorations unchanged', () => {
			const deco: InlineDecoration = inline(B1, 2, 7, { class: 'hl' });
			const step: MergeBlocksStep = mergeBlocksStep(B1, B2, 10);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBe(deco);
		});

		it('unchanged when different block', () => {
			const deco: InlineDecoration = inline(B3, 2, 7, { class: 'hl' });
			const step: MergeBlocksStep = mergeBlocksStep(B1, B2, 10);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBe(deco);
		});
	});

	// --- MergeBlocks × Widget ---

	describe('MergeBlocks × WidgetDecoration', () => {
		it('shifts source widget to target with offset', () => {
			const deco: WidgetDecoration = widget(B2, 3, DUMMY_TO_DOM);
			const step: MergeBlocksStep = mergeBlocksStep(B1, B2, 5);
			const result = mapDecorationThroughStep(deco, step) as WidgetDecoration;
			expect(result.blockId).toBe(B1);
			expect(result.offset).toBe(8);
		});

		it('leaves target widget unchanged', () => {
			const deco: WidgetDecoration = widget(B1, 3, DUMMY_TO_DOM);
			const step: MergeBlocksStep = mergeBlocksStep(B1, B2, 5);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBe(deco);
		});
	});

	// --- MergeBlocks × Node ---

	describe('MergeBlocks × NodeDecoration', () => {
		it('deletes source block node decoration', () => {
			const deco: NodeDecoration = node(B2, { class: 'sel' });
			const step: MergeBlocksStep = mergeBlocksStep(B1, B2, 10);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBeNull();
		});

		it('leaves target block node decoration unchanged', () => {
			const deco: NodeDecoration = node(B1, { class: 'sel' });
			const step: MergeBlocksStep = mergeBlocksStep(B1, B2, 10);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBe(deco);
		});
	});

	// --- RemoveNode ---

	describe('RemoveNode', () => {
		it('deletes inline decoration on removed block', () => {
			const deco: InlineDecoration = inline(B1, 0, 5, { class: 'hl' });
			const step: RemoveNodeStep = removeNodeStep(B1);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBeNull();
		});

		it('deletes widget decoration on removed block', () => {
			const deco: WidgetDecoration = widget(B1, 3, DUMMY_TO_DOM);
			const step: RemoveNodeStep = removeNodeStep(B1);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBeNull();
		});

		it('deletes node decoration on removed block', () => {
			const deco: NodeDecoration = node(B1, { class: 'sel' });
			const step: RemoveNodeStep = removeNodeStep(B1);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBeNull();
		});

		it('leaves decoration on other block unchanged', () => {
			const deco: InlineDecoration = inline(B2, 0, 5, { class: 'hl' });
			const step: RemoveNodeStep = removeNodeStep(B1);
			const result = mapDecorationThroughStep(deco, step);
			expect(result).toBe(deco);
		});
	});

	// --- Other step types pass through ---

	describe('pass-through steps', () => {
		const otherSteps: Step[] = [
			{ type: 'addMark', blockId: B1, from: 0, to: 5, mark: { type: 'bold' as never } },
			{ type: 'removeMark', blockId: B1, from: 0, to: 5, mark: { type: 'bold' as never } },
			{ type: 'setStoredMarks', marks: null, previousMarks: null },
			{
				type: 'setBlockType',
				blockId: B1,
				nodeType: 'heading' as never,
				previousNodeType: 'paragraph' as never,
			},
			{
				type: 'insertNode',
				parentPath: [],
				index: 0,
				node: { type: 'paragraph', id: B3, children: [], attrs: {} } as never,
			},
			{
				type: 'setNodeAttr',
				path: [B1],
				attrs: { level: 2 },
			},
		];

		for (const step of otherSteps) {
			it(`${step.type} leaves inline unchanged`, () => {
				const deco: InlineDecoration = inline(B1, 0, 5, { class: 'hl' });
				expect(mapDecorationThroughStep(deco, step)).toBe(deco);
			});

			it(`${step.type} leaves widget unchanged`, () => {
				const deco: WidgetDecoration = widget(B1, 3, DUMMY_TO_DOM);
				expect(mapDecorationThroughStep(deco, step)).toBe(deco);
			});

			it(`${step.type} leaves node unchanged`, () => {
				const deco: NodeDecoration = node(B1, { class: 'sel' });
				expect(mapDecorationThroughStep(deco, step)).toBe(deco);
			});
		}
	});

	// --- Multi-step mapping ---

	describe('multi-step composition', () => {
		it('insert then delete adjusts correctly', () => {
			// Start: inline B1 [5,10)
			// Step 1: insert 3 chars at offset 0 → [8,13)
			// Step 2: delete [2,5) (3 chars) → [5,10)
			const deco: InlineDecoration = inline(B1, 5, 10, { class: 'hl' });
			const step1: InsertTextStep = insertTextStep(B1, 0, 'abc');
			const step2: DeleteTextStep = deleteTextStep(B1, 2, 5);

			let result = mapDecorationThroughStep(deco, step1) as InlineDecoration;
			expect(result.from).toBe(8);
			expect(result.to).toBe(13);

			result = mapDecorationThroughStep(result, step2) as InlineDecoration;
			expect(result.from).toBe(5);
			expect(result.to).toBe(10);
		});

		it('split then merge round-trips a decoration', () => {
			const deco: InlineDecoration = inline(B1, 7, 10, { class: 'hl' });

			// Split at 5 → moves to B2 with offsets [2, 5)
			const split: SplitBlockStep = splitBlockStep(B1, 5, B2);
			const afterSplit = mapDecorationThroughStep(deco, split) as InlineDecoration;
			expect(afterSplit.blockId).toBe(B2);
			expect(afterSplit.from).toBe(2);
			expect(afterSplit.to).toBe(5);

			// Merge B2 back into B1 (target length = 5)
			const merge: MergeBlocksStep = mergeBlocksStep(B1, B2, 5);
			const afterMerge = mapDecorationThroughStep(afterSplit, merge) as InlineDecoration;
			expect(afterMerge.blockId).toBe(B1);
			expect(afterMerge.from).toBe(7);
			expect(afterMerge.to).toBe(10);
		});
	});
});
