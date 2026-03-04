/**
 * Step inversion logic for undo/redo support.
 * Each step type has a corresponding inverse that reverses its effect.
 */

import type { Step } from './Steps.js';
import type { Transaction } from './Transaction.js';

/** Inverts a single step for undo. */
export function invertStep(step: Step): Step {
	switch (step.type) {
		case 'insertText':
			return {
				type: 'deleteText',
				blockId: step.blockId,
				from: step.offset,
				to: step.offset + step.text.length,
				deletedText: step.text,
				deletedMarks: step.marks,
				deletedSegments: step.segments ?? [{ text: step.text, marks: [...step.marks] }],
				...(step.path ? { path: step.path } : {}),
			};
		case 'deleteText':
			return {
				type: 'insertText',
				blockId: step.blockId,
				offset: step.from,
				text: step.deletedText,
				marks: step.deletedMarks,
				segments: step.deletedSegments,
				...(step.path ? { path: step.path } : {}),
			};
		case 'splitBlock':
			return {
				type: 'mergeBlocks',
				targetBlockId: step.blockId,
				sourceBlockId: step.newBlockId,
				targetLengthBefore: step.offset,
				...(step.path ? { path: step.path } : {}),
			};
		case 'mergeBlocks':
			return {
				type: 'splitBlock',
				blockId: step.targetBlockId,
				offset: step.targetLengthBefore,
				newBlockId: step.sourceBlockId,
				...(step.path ? { path: step.path } : {}),
			};
		case 'addMark':
			return {
				type: 'removeMark',
				blockId: step.blockId,
				from: step.from,
				to: step.to,
				mark: step.mark,
				...(step.path ? { path: step.path } : {}),
			};
		case 'removeMark':
			return {
				type: 'addMark',
				blockId: step.blockId,
				from: step.from,
				to: step.to,
				mark: step.mark,
				...(step.path ? { path: step.path } : {}),
			};
		case 'setStoredMarks':
			return {
				type: 'setStoredMarks',
				marks: step.previousMarks,
				previousMarks: step.marks,
			};
		case 'setBlockType':
			return {
				type: 'setBlockType',
				blockId: step.blockId,
				nodeType: step.previousNodeType,
				attrs: step.previousAttrs,
				previousNodeType: step.nodeType,
				previousAttrs: step.attrs,
				...(step.path ? { path: step.path } : {}),
			};
		case 'insertNode':
			return {
				type: 'removeNode',
				parentPath: step.parentPath,
				index: step.index,
				removedNode: step.node,
			};
		case 'removeNode':
			return {
				type: 'insertNode',
				parentPath: step.parentPath,
				index: step.index,
				node: step.removedNode,
			};
		case 'setNodeAttr':
			return {
				type: 'setNodeAttr',
				path: step.path,
				attrs: step.previousAttrs,
				previousAttrs: step.attrs,
			};
		case 'insertInlineNode':
			return {
				type: 'removeInlineNode',
				blockId: step.blockId,
				offset: step.offset,
				removedNode: step.node,
				...(step.path ? { path: step.path } : {}),
			};
		case 'removeInlineNode':
			return {
				type: 'insertInlineNode',
				blockId: step.blockId,
				offset: step.offset,
				node: step.removedNode,
				...(step.path ? { path: step.path } : {}),
			};
		case 'setInlineNodeAttr':
			return {
				type: 'setInlineNodeAttr',
				blockId: step.blockId,
				offset: step.offset,
				attrs: step.previousAttrs,
				previousAttrs: step.attrs,
				...(step.path ? { path: step.path } : {}),
			};
	}
}

/** Inverts an entire transaction (reverses step order and swaps selections). */
export function invertTransaction(tr: Transaction): Transaction {
	return {
		steps: tr.steps.map(invertStep).reverse(),
		selectionBefore: tr.selectionAfter,
		selectionAfter: tr.selectionBefore,
		storedMarksAfter: null,
		metadata: {
			origin: 'history',
			timestamp: Date.now(),
		},
	};
}
