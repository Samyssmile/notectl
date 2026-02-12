/**
 * Pure functions for mapping decorations through transaction steps.
 * Handles position adjustments when the document changes — insertions,
 * deletions, splits, merges, and structural node removal.
 */

import type {
	DeleteTextStep,
	InsertTextStep,
	MergeBlocksStep,
	RemoveNodeStep,
	SplitBlockStep,
	Step,
} from '../state/Transaction.js';
import type {
	Decoration,
	InlineDecoration,
	NodeDecoration,
	WidgetDecoration,
} from './Decoration.js';

/**
 * Maps a single decoration through a step.
 * Returns the mapped decoration, an array (when a split produces two),
 * or null if the decoration was deleted by the step.
 */
export function mapDecorationThroughStep(
	deco: Decoration,
	step: Step,
): Decoration | readonly Decoration[] | null {
	switch (deco.type) {
		case 'inline':
			return mapInline(deco, step);
		case 'widget':
			return mapWidget(deco, step);
		case 'node':
			return mapNode(deco, step);
	}
}

function mapInline(
	deco: InlineDecoration,
	step: Step,
): InlineDecoration | readonly InlineDecoration[] | null {
	switch (step.type) {
		case 'insertText':
			return mapInlineInsert(deco, step);
		case 'deleteText':
			return mapInlineDelete(deco, step);
		case 'splitBlock':
			return mapInlineSplit(deco, step);
		case 'mergeBlocks':
			return mapInlineMerge(deco, step);
		case 'removeNode':
			return removeIfBlockDeleted(deco, step);
		default:
			return deco;
	}
}

function mapWidget(deco: WidgetDecoration, step: Step): WidgetDecoration | null {
	switch (step.type) {
		case 'insertText':
			return mapWidgetInsert(deco, step);
		case 'deleteText':
			return mapWidgetDelete(deco, step);
		case 'splitBlock':
			return mapWidgetSplit(deco, step);
		case 'mergeBlocks':
			return mapWidgetMerge(deco, step);
		case 'removeNode':
			return removeIfBlockDeleted(deco, step);
		default:
			return deco;
	}
}

function mapNode(deco: NodeDecoration, step: Step): NodeDecoration | null {
	switch (step.type) {
		case 'mergeBlocks':
			return mapNodeMerge(deco, step);
		case 'removeNode':
			return removeIfBlockDeleted(deco, step);
		default:
			return deco;
	}
}

// --- InsertText ---

function mapInlineInsert(deco: InlineDecoration, step: InsertTextStep): InlineDecoration {
	if (deco.blockId !== step.blockId) return deco;

	const len: number = step.text.length;
	// from: assoc=-1 (stays at boundary — only shifts if insertion is strictly before)
	const newFrom: number = deco.from > step.offset ? deco.from + len : deco.from;
	// to: assoc=1 (moves past insertion — shifts if insertion is at or before)
	const newTo: number = deco.to >= step.offset ? deco.to + len : deco.to;

	if (newFrom === deco.from && newTo === deco.to) return deco;
	return { ...deco, from: newFrom, to: newTo };
}

function mapWidgetInsert(deco: WidgetDecoration, step: InsertTextStep): WidgetDecoration {
	if (deco.blockId !== step.blockId) return deco;

	const len: number = step.text.length;
	// At boundary: side=-1 means "before insertion" (assoc=-1, stays), side=1 means "after" (moves)
	if (deco.offset > step.offset) {
		return { ...deco, offset: deco.offset + len };
	}
	if (deco.offset === step.offset && deco.side >= 1) {
		return { ...deco, offset: deco.offset + len };
	}
	return deco;
}

// --- DeleteText ---

function mapInlineDelete(deco: InlineDecoration, step: DeleteTextStep): InlineDecoration | null {
	if (deco.blockId !== step.blockId) return deco;

	const delLen: number = step.to - step.from;
	const newFrom: number = clampAndShift(deco.from, step.from, step.to, delLen);
	const newTo: number = clampAndShift(deco.to, step.from, step.to, delLen);

	if (newFrom >= newTo) return null;
	if (newFrom === deco.from && newTo === deco.to) return deco;
	return { ...deco, from: newFrom, to: newTo };
}

function mapWidgetDelete(deco: WidgetDecoration, step: DeleteTextStep): WidgetDecoration | null {
	if (deco.blockId !== step.blockId) return deco;

	// Widget strictly inside deleted range → deleted
	if (deco.offset > step.from && deco.offset < step.to) return null;

	const delLen: number = step.to - step.from;
	if (deco.offset >= step.to) {
		return { ...deco, offset: deco.offset - delLen };
	}
	return deco;
}

// --- SplitBlock ---

function mapInlineSplit(
	deco: InlineDecoration,
	step: SplitBlockStep,
): InlineDecoration | readonly InlineDecoration[] {
	if (deco.blockId !== step.blockId) return deco;

	// Entirely before split point → unchanged
	if (deco.to <= step.offset) return deco;

	// Entirely after split point → move to new block, adjust offsets
	if (deco.from >= step.offset) {
		return {
			...deco,
			blockId: step.newBlockId,
			from: deco.from - step.offset,
			to: deco.to - step.offset,
		};
	}

	// Spanning the split point → split into two decorations
	const left: InlineDecoration = { ...deco, to: step.offset };
	const right: InlineDecoration = {
		...deco,
		blockId: step.newBlockId,
		from: 0,
		to: deco.to - step.offset,
	};
	return [left, right];
}

function mapWidgetSplit(deco: WidgetDecoration, step: SplitBlockStep): WidgetDecoration {
	if (deco.blockId !== step.blockId) return deco;

	// Before split → stays
	if (deco.offset < step.offset) return deco;

	// After split → new block
	if (deco.offset > step.offset) {
		return {
			...deco,
			blockId: step.newBlockId,
			offset: deco.offset - step.offset,
		};
	}

	// At boundary: side determines which block
	if (deco.side >= 1) {
		return {
			...deco,
			blockId: step.newBlockId,
			offset: 0,
		};
	}
	return deco;
}

// --- MergeBlocks ---

function mapInlineMerge(deco: InlineDecoration, step: MergeBlocksStep): InlineDecoration {
	if (deco.blockId !== step.sourceBlockId) return deco;

	return {
		...deco,
		blockId: step.targetBlockId,
		from: deco.from + step.targetLengthBefore,
		to: deco.to + step.targetLengthBefore,
	};
}

function mapWidgetMerge(deco: WidgetDecoration, step: MergeBlocksStep): WidgetDecoration {
	if (deco.blockId !== step.sourceBlockId) return deco;

	return {
		...deco,
		blockId: step.targetBlockId,
		offset: deco.offset + step.targetLengthBefore,
	};
}

function mapNodeMerge(deco: NodeDecoration, step: MergeBlocksStep): NodeDecoration | null {
	// Source block disappears → delete its node decoration
	if (deco.blockId === step.sourceBlockId) return null;
	return deco;
}

// --- RemoveNode ---

function removeIfBlockDeleted<T extends Decoration>(deco: T, step: RemoveNodeStep): T | null {
	if (deco.blockId === step.removedNode.id) return null;
	return deco;
}

// --- Helpers ---

function clampAndShift(pos: number, delFrom: number, delTo: number, delLen: number): number {
	if (pos <= delFrom) return pos;
	if (pos >= delTo) return pos - delLen;
	return delFrom;
}
