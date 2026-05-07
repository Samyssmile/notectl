/**
 * Per-step invert functions: each returns the inverse of a single step
 * for undo/redo support. Dispatch and transaction-level inversion live in
 * `StepHandlers.ts`, which pairs each function with its forward counterpart
 * in `StepApplication.ts`.
 */

import type { Mark } from '../model/Document.js';
import type { BlockId } from '../model/TypeBrands.js';
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
	Step,
} from './Steps.js';
import type { Transaction } from './Transaction.js';

/** Returns a path spread object if the step has a path, or empty object otherwise. */
function optionalPath(step: { readonly path?: readonly BlockId[] }):
	| { readonly path: readonly BlockId[] }
	| Record<string, never> {
	return step.path ? { path: step.path } : {};
}

export function invertInsertText(step: InsertTextStep): Step {
	return {
		type: 'deleteText',
		blockId: step.blockId,
		from: step.offset,
		to: step.offset + step.text.length,
		deletedText: step.text,
		deletedMarks: step.marks,
		deletedSegments: step.segments ?? [{ text: step.text, marks: [...step.marks] }],
		...optionalPath(step),
	};
}

export function invertDeleteText(step: DeleteTextStep): Step {
	return {
		type: 'insertText',
		blockId: step.blockId,
		offset: step.from,
		text: step.deletedText,
		marks: step.deletedMarks,
		segments: step.deletedSegments,
		...optionalPath(step),
	};
}

export function invertSplitBlock(step: SplitBlockStep): Step {
	return {
		type: 'mergeBlocks',
		targetBlockId: step.blockId,
		sourceBlockId: step.newBlockId,
		targetLengthBefore: step.offset,
		...optionalPath(step),
	};
}

export function invertMergeBlocks(step: MergeBlocksStep): Step {
	return {
		type: 'splitBlock',
		blockId: step.targetBlockId,
		offset: step.targetLengthBefore,
		newBlockId: step.sourceBlockId,
		...optionalPath(step),
	};
}

export function invertAddMark(step: AddMarkStep): Step {
	return {
		type: 'removeMark',
		blockId: step.blockId,
		from: step.from,
		to: step.to,
		mark: step.mark,
		...optionalPath(step),
	};
}

export function invertRemoveMark(step: RemoveMarkStep): Step {
	return {
		type: 'addMark',
		blockId: step.blockId,
		from: step.from,
		to: step.to,
		mark: step.mark,
		...optionalPath(step),
	};
}

export function invertSetStoredMarks(step: SetStoredMarksStep): Step {
	return {
		type: 'setStoredMarks',
		marks: step.previousMarks,
		previousMarks: step.marks,
	};
}

export function invertSetBlockType(step: SetBlockTypeStep): Step {
	return {
		type: 'setBlockType',
		blockId: step.blockId,
		nodeType: step.previousNodeType,
		attrs: step.previousAttrs,
		previousNodeType: step.nodeType,
		previousAttrs: step.attrs,
		...optionalPath(step),
	};
}

export function invertInsertNode(step: InsertNodeStep): Step {
	return {
		type: 'removeNode',
		parentPath: step.parentPath,
		index: step.index,
		removedNode: step.node,
	};
}

export function invertRemoveNode(step: RemoveNodeStep): Step {
	return {
		type: 'insertNode',
		parentPath: step.parentPath,
		index: step.index,
		node: step.removedNode,
	};
}

export function invertSetNodeAttr(step: SetNodeAttrStep): Step {
	return {
		type: 'setNodeAttr',
		path: step.path,
		attrs: step.previousAttrs,
		previousAttrs: step.attrs,
	};
}

export function invertInsertInlineNode(step: InsertInlineNodeStep): Step {
	return {
		type: 'removeInlineNode',
		blockId: step.blockId,
		offset: step.offset,
		removedNode: step.node,
		...optionalPath(step),
	};
}

export function invertRemoveInlineNode(step: RemoveInlineNodeStep): Step {
	return {
		type: 'insertInlineNode',
		blockId: step.blockId,
		offset: step.offset,
		node: step.removedNode,
		...optionalPath(step),
	};
}

export function invertSetInlineNodeAttr(step: SetInlineNodeAttrStep): Step {
	return {
		type: 'setInlineNodeAttr',
		blockId: step.blockId,
		offset: step.offset,
		attrs: step.previousAttrs,
		previousAttrs: step.attrs,
		...optionalPath(step),
	};
}

/**
 * Walks the transaction's steps to find the storedMarks value that was
 * active before the transaction ran, falling back to the post-state if
 * no `setStoredMarks` step was recorded.
 */
export function deriveStoredMarksBefore(tr: Transaction): readonly Mark[] | null {
	for (const step of tr.steps) {
		if (step.type === 'setStoredMarks') {
			return step.previousMarks;
		}
	}
	return tr.storedMarksAfter;
}
