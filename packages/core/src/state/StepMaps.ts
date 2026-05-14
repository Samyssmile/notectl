/**
 * Per-step {@link StepMap} producers. Each function consumes the step plus
 * the document state **before** the step is applied (when needed) and
 * returns the StepMap that describes the position-space change.
 *
 * Dispatch is performed by `StepHandlers.ts` through the
 * `StepHandlerRegistry`, which co-locates `apply`, `invert`, and `getMap`
 * so adding a new step type is a single registry edit.
 */

import type { Document } from '../model/Document.js';
import {
	type BlockRemovalMap,
	IDENTITY_MAP,
	type MergeMap,
	type ShiftMap,
	type SplitMap,
	type StepMap,
	collectRemovedBlockIds,
} from './Mapping.js';
import type {
	AddMarkStep,
	DeleteTextStep,
	InsertInlineNodeStep,
	InsertNodeStep,
	InsertTextStep,
	MergeBlocksStep,
	RemoveInlineNodeStep,
	RemoveMarkStep,
	RemoveNodeStep,
	SetBlockTypeStep,
	SetInlineNodeAttrStep,
	SetNodeAttrStep,
	SetStoredMarksStep,
	SplitBlockStep,
} from './Steps.js';

// --- Content-shifting steps ---

export function getMapInsertText(_doc: Document, step: InsertTextStep): ShiftMap {
	return {
		type: 'shift',
		blockId: step.blockId,
		from: step.offset,
		to: step.offset,
		newLen: step.text.length,
	};
}

export function getMapDeleteText(_doc: Document, step: DeleteTextStep): ShiftMap {
	return {
		type: 'shift',
		blockId: step.blockId,
		from: step.from,
		to: step.to,
		newLen: 0,
	};
}

export function getMapInsertInlineNode(_doc: Document, step: InsertInlineNodeStep): ShiftMap {
	return {
		type: 'shift',
		blockId: step.blockId,
		from: step.offset,
		to: step.offset,
		newLen: 1,
	};
}

export function getMapRemoveInlineNode(_doc: Document, step: RemoveInlineNodeStep): ShiftMap {
	return {
		type: 'shift',
		blockId: step.blockId,
		from: step.offset,
		to: step.offset + 1,
		newLen: 0,
	};
}

// --- Structural steps ---

export function getMapSplitBlock(_doc: Document, step: SplitBlockStep): SplitMap {
	return {
		type: 'split',
		blockId: step.blockId,
		offset: step.offset,
		newBlockId: step.newBlockId,
	};
}

export function getMapMergeBlocks(_doc: Document, step: MergeBlocksStep): MergeMap {
	return {
		type: 'merge',
		targetBlockId: step.targetBlockId,
		sourceBlockId: step.sourceBlockId,
		targetLengthBefore: step.targetLengthBefore,
	};
}

export function getMapRemoveNode(_doc: Document, step: RemoveNodeStep): BlockRemovalMap {
	return {
		type: 'blockRemoval',
		removedBlockIds: collectRemovedBlockIds(step.removedNode),
	};
}

// --- Identity steps (positions unchanged) ---
//
// The following step types do not move offsets:
// - addMark / removeMark: annotation only
// - setStoredMarks: state-only
// - setBlockType: type/attrs change, children unchanged
// - setNodeAttr / setInlineNodeAttr: attribute-only
// - insertNode: a *whole* new block is inserted; positions in *other*
//   blocks (addressed by {blockId, offset}) are not affected, and the
//   new block has no prior positions to map.

export function getMapAddMark(_doc: Document, _step: AddMarkStep): StepMap {
	return IDENTITY_MAP;
}

export function getMapRemoveMark(_doc: Document, _step: RemoveMarkStep): StepMap {
	return IDENTITY_MAP;
}

export function getMapSetStoredMarks(_doc: Document, _step: SetStoredMarksStep): StepMap {
	return IDENTITY_MAP;
}

export function getMapSetBlockType(_doc: Document, _step: SetBlockTypeStep): StepMap {
	return IDENTITY_MAP;
}

export function getMapInsertNode(_doc: Document, _step: InsertNodeStep): StepMap {
	return IDENTITY_MAP;
}

export function getMapSetNodeAttr(_doc: Document, _step: SetNodeAttrStep): StepMap {
	return IDENTITY_MAP;
}

export function getMapSetInlineNodeAttr(_doc: Document, _step: SetInlineNodeAttrStep): StepMap {
	return IDENTITY_MAP;
}
