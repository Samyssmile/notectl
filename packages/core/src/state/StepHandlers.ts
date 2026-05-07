/**
 * Single source of truth that pairs each `Step` discriminator with the
 * functions that apply and invert it. The registry's mapped type makes
 * exhaustiveness a compile-time guarantee: introducing a new member of
 * the `Step` union without registering a handler is a type error here.
 *
 * Public dispatch (`applyStep`, `invertStep`, `invertTransaction`) lives
 * in this module; per-step logic lives in `StepApplication.ts` and
 * `StepInversion.ts`.
 */

import type { Document } from '../model/Document.js';
import {
	applyAddMark,
	applyDeleteText,
	applyInsertInlineNode,
	applyInsertNode,
	applyInsertText,
	applyMergeBlocks,
	applyRemoveInlineNode,
	applyRemoveMark,
	applyRemoveNode,
	applySetBlockType,
	applySetInlineNodeAttr,
	applySetNodeAttr,
	applySetStoredMarks,
	applySplitBlock,
} from './StepApplication.js';
import {
	deriveStoredMarksBefore,
	invertAddMark,
	invertDeleteText,
	invertInsertInlineNode,
	invertInsertNode,
	invertInsertText,
	invertMergeBlocks,
	invertRemoveInlineNode,
	invertRemoveMark,
	invertRemoveNode,
	invertSetBlockType,
	invertSetInlineNodeAttr,
	invertSetNodeAttr,
	invertSetStoredMarks,
	invertSplitBlock,
} from './StepInversion.js';
import type { Step } from './Steps.js';
import type { Transaction } from './Transaction.js';

/** Forward and inverse behavior of one step subtype, co-located. */
export interface StepHandler<S extends Step> {
	readonly apply: (doc: Document, step: S) => Document;
	readonly invert: (step: S) => Step;
}

/**
 * Registry shape: every member of the `Step` union must have a matching
 * handler. If a new step type is added to the union without a handler,
 * the literal below fails to type-check.
 */
type StepHandlerRegistry = {
	readonly [K in Step['type']]: StepHandler<Extract<Step, { readonly type: K }>>;
};

const STEP_HANDLERS: StepHandlerRegistry = {
	insertText: { apply: applyInsertText, invert: invertInsertText },
	deleteText: { apply: applyDeleteText, invert: invertDeleteText },
	splitBlock: { apply: applySplitBlock, invert: invertSplitBlock },
	mergeBlocks: { apply: applyMergeBlocks, invert: invertMergeBlocks },
	addMark: { apply: applyAddMark, invert: invertAddMark },
	removeMark: { apply: applyRemoveMark, invert: invertRemoveMark },
	setStoredMarks: { apply: applySetStoredMarks, invert: invertSetStoredMarks },
	setBlockType: { apply: applySetBlockType, invert: invertSetBlockType },
	insertNode: { apply: applyInsertNode, invert: invertInsertNode },
	removeNode: { apply: applyRemoveNode, invert: invertRemoveNode },
	setNodeAttr: { apply: applySetNodeAttr, invert: invertSetNodeAttr },
	insertInlineNode: { apply: applyInsertInlineNode, invert: invertInsertInlineNode },
	removeInlineNode: { apply: applyRemoveInlineNode, invert: invertRemoveInlineNode },
	setInlineNodeAttr: { apply: applySetInlineNodeAttr, invert: invertSetInlineNodeAttr },
};

/**
 * Looks up the handler for a step. The cast is bounded — `STEP_HANDLERS`
 * is typed such that `step.type` always selects a handler whose parameter
 * type matches `S`. TypeScript cannot narrow indexed access through a
 * discriminator without help, so we assert the relationship once here.
 */
function getHandler<S extends Step>(step: S): StepHandler<S> {
	return STEP_HANDLERS[step.type] as unknown as StepHandler<S>;
}

/** Applies a single step to a document and returns the new document. */
export function applyStep(doc: Document, step: Step): Document {
	return getHandler(step).apply(doc, step);
}

/** Returns the inverse of a step, used for undo/redo. */
export function invertStep(step: Step): Step {
	return getHandler(step).invert(step);
}

/** Inverts an entire transaction (reverses step order and swaps selections). */
export function invertTransaction(tr: Transaction): Transaction {
	return {
		steps: tr.steps.map(invertStep).reverse(),
		selectionBefore: tr.selectionAfter,
		selectionAfter: tr.selectionBefore,
		storedMarksAfter: deriveStoredMarksBefore(tr),
		metadata: {
			origin: 'history',
			timestamp: Date.now(),
		},
	};
}
