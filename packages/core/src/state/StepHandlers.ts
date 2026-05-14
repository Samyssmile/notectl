/**
 * Single source of truth that pairs each `Step` discriminator with the
 * functions that apply, invert, and map it. The registry's mapped type
 * makes exhaustiveness a compile-time guarantee: introducing a new member
 * of the `Step` union without registering a handler is a type error here.
 *
 * Public dispatch (`applyStep`, `invertStep`, `getStepMap`,
 * `invertTransaction`) lives in this module; per-step logic lives in
 * `StepApplication.ts`, `StepInversion.ts`, and `StepMaps.ts`.
 */

import type { Document } from '../model/Document.js';
import { Mapping, type StepMap } from './Mapping.js';
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
import {
	getMapAddMark,
	getMapDeleteText,
	getMapInsertInlineNode,
	getMapInsertNode,
	getMapInsertText,
	getMapMergeBlocks,
	getMapRemoveInlineNode,
	getMapRemoveMark,
	getMapRemoveNode,
	getMapSetBlockType,
	getMapSetInlineNodeAttr,
	getMapSetNodeAttr,
	getMapSetStoredMarks,
	getMapSplitBlock,
} from './StepMaps.js';
import type { Step } from './Steps.js';
import type { Transaction } from './Transaction.js';

/**
 * Forward, inverse, and position-mapping behavior of one step subtype,
 * co-located so a new step type is one registry entry.
 *
 * `getMap` receives the document **before** the step is applied. Most maps
 * don't need it, but `removeNode` walks the subtree to enumerate descendant
 * block IDs and `mergeBlocks` may use it for invariant checks.
 */
export interface StepHandler<S extends Step> {
	readonly apply: (doc: Document, step: S) => Document;
	readonly invert: (step: S) => Step;
	readonly getMap: (doc: Document, step: S) => StepMap;
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
	insertText: { apply: applyInsertText, invert: invertInsertText, getMap: getMapInsertText },
	deleteText: { apply: applyDeleteText, invert: invertDeleteText, getMap: getMapDeleteText },
	splitBlock: { apply: applySplitBlock, invert: invertSplitBlock, getMap: getMapSplitBlock },
	mergeBlocks: { apply: applyMergeBlocks, invert: invertMergeBlocks, getMap: getMapMergeBlocks },
	addMark: { apply: applyAddMark, invert: invertAddMark, getMap: getMapAddMark },
	removeMark: { apply: applyRemoveMark, invert: invertRemoveMark, getMap: getMapRemoveMark },
	setStoredMarks: {
		apply: applySetStoredMarks,
		invert: invertSetStoredMarks,
		getMap: getMapSetStoredMarks,
	},
	setBlockType: {
		apply: applySetBlockType,
		invert: invertSetBlockType,
		getMap: getMapSetBlockType,
	},
	insertNode: { apply: applyInsertNode, invert: invertInsertNode, getMap: getMapInsertNode },
	removeNode: { apply: applyRemoveNode, invert: invertRemoveNode, getMap: getMapRemoveNode },
	setNodeAttr: { apply: applySetNodeAttr, invert: invertSetNodeAttr, getMap: getMapSetNodeAttr },
	insertInlineNode: {
		apply: applyInsertInlineNode,
		invert: invertInsertInlineNode,
		getMap: getMapInsertInlineNode,
	},
	removeInlineNode: {
		apply: applyRemoveInlineNode,
		invert: invertRemoveInlineNode,
		getMap: getMapRemoveInlineNode,
	},
	setInlineNodeAttr: {
		apply: applySetInlineNodeAttr,
		invert: invertSetInlineNodeAttr,
		getMap: getMapSetInlineNodeAttr,
	},
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

/**
 * Returns the position-space {@link StepMap} for a step, computed against
 * the document state **before** the step was applied.
 */
export function getStepMap(doc: Document, step: Step): StepMap {
	return getHandler(step).getMap(doc, step);
}

/**
 * Inverts an entire transaction (reverses step order and swaps selections).
 *
 * The returned transaction's `mapping` is {@link Mapping.empty}: producing a
 * faithful mapping for inverted steps requires the pre-apply document at
 * each inverse step (e.g. `removeNode` needs to walk the subtree, which is
 * only present in the forward step's payload, not its inverse). Callers
 * that need a real mapping for the inverted transaction should accumulate
 * step maps via {@link getStepMap} as they apply each inverse step.
 */
export function invertTransaction(tr: Transaction): Transaction {
	return {
		steps: tr.steps.map(invertStep).reverse(),
		selectionBefore: tr.selectionAfter,
		selectionAfter: tr.selectionBefore,
		storedMarksAfter: deriveStoredMarksBefore(tr),
		mapping: Mapping.empty,
		metadata: {
			origin: 'history',
			timestamp: Date.now(),
		},
	};
}
