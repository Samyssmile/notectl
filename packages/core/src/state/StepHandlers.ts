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
import { IDENTITY_MAP, Mapping, type StepMap } from './Mapping.js';
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
	mapAddMark,
	mapDeleteText,
	mapInsertInlineNode,
	mapInsertNode,
	mapInsertText,
	mapMergeBlocks,
	mapRemoveInlineNode,
	mapRemoveMark,
	mapRemoveNode,
	mapSetBlockType,
	mapSetInlineNodeAttr,
	mapSetNodeAttr,
	mapSetStoredMarks,
	mapSplitBlock,
} from './StepMapping.js';
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
 * Forward, inverse, position-mapping, and step-rebase behavior of one step
 * subtype, co-located so a new step type is one registry entry.
 *
 * - `apply` / `invert` / `getMap` cover the existing step pipeline.
 * - `map` rebases the step itself through a {@link Mapping} describing
 *   intervening changes; returns `null` when the step can no longer be
 *   applied meaningfully (block removed, range fragmented, range fully
 *   eaten). See {@link StepMapping.ts} for per-step semantics.
 *
 * `getMap` and `map` both receive the document at the step's "current"
 * frame: `getMap` against the pre-apply doc, `map` against the doc that
 * the rebased step will be applied to. The latter is needed to re-snapshot
 * inverse-payload fields (`deletedText`, `previousAttrs`, etc.) so the
 * rebased step inverts correctly on redo.
 */
export interface StepHandler<S extends Step> {
	readonly apply: (doc: Document, step: S) => Document;
	readonly invert: (step: S) => Step;
	readonly getMap: (doc: Document, step: S) => StepMap;
	readonly map: (step: S, mapping: Mapping, doc: Document) => Step | null;
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
	insertText: {
		apply: applyInsertText,
		invert: invertInsertText,
		getMap: getMapInsertText,
		map: mapInsertText,
	},
	deleteText: {
		apply: applyDeleteText,
		invert: invertDeleteText,
		getMap: getMapDeleteText,
		map: mapDeleteText,
	},
	splitBlock: {
		apply: applySplitBlock,
		invert: invertSplitBlock,
		getMap: getMapSplitBlock,
		map: mapSplitBlock,
	},
	mergeBlocks: {
		apply: applyMergeBlocks,
		invert: invertMergeBlocks,
		getMap: getMapMergeBlocks,
		map: mapMergeBlocks,
	},
	addMark: {
		apply: applyAddMark,
		invert: invertAddMark,
		getMap: getMapAddMark,
		map: mapAddMark,
	},
	removeMark: {
		apply: applyRemoveMark,
		invert: invertRemoveMark,
		getMap: getMapRemoveMark,
		map: mapRemoveMark,
	},
	setStoredMarks: {
		apply: applySetStoredMarks,
		invert: invertSetStoredMarks,
		getMap: getMapSetStoredMarks,
		map: mapSetStoredMarks,
	},
	setBlockType: {
		apply: applySetBlockType,
		invert: invertSetBlockType,
		getMap: getMapSetBlockType,
		map: mapSetBlockType,
	},
	insertNode: {
		apply: applyInsertNode,
		invert: invertInsertNode,
		getMap: getMapInsertNode,
		map: mapInsertNode,
	},
	removeNode: {
		apply: applyRemoveNode,
		invert: invertRemoveNode,
		getMap: getMapRemoveNode,
		map: mapRemoveNode,
	},
	setNodeAttr: {
		apply: applySetNodeAttr,
		invert: invertSetNodeAttr,
		getMap: getMapSetNodeAttr,
		map: mapSetNodeAttr,
	},
	insertInlineNode: {
		apply: applyInsertInlineNode,
		invert: invertInsertInlineNode,
		getMap: getMapInsertInlineNode,
		map: mapInsertInlineNode,
	},
	removeInlineNode: {
		apply: applyRemoveInlineNode,
		invert: invertRemoveInlineNode,
		getMap: getMapRemoveInlineNode,
		map: mapRemoveInlineNode,
	},
	setInlineNodeAttr: {
		apply: applySetInlineNodeAttr,
		invert: invertSetInlineNodeAttr,
		getMap: getMapSetInlineNodeAttr,
		map: mapSetInlineNodeAttr,
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
 * Rebases a step through a {@link Mapping} describing intervening edits in
 * position space, returning either the rebased step or `null` when the
 * step can no longer be applied meaningfully (block removed, range fully
 * eaten, range fragmented across blocks, structural ancestor migrated).
 *
 * `doc` must be the document at the frame the rebased step will run
 * against — `map` re-snapshots inverse-payload fields (`deletedText`,
 * `previousAttrs`, …) from it so the rebased step inverts correctly on
 * redo.
 *
 * Callers (e.g. {@link HistoryManager.undo}) treat a `null` as a signal to
 * abandon the entire undo/redo group rather than apply a partial rebase
 * that would silently corrupt the document.
 */
export function mapStep(step: Step, mapping: Mapping, doc: Document): Step | null {
	if (mapping.isEmpty) return step;
	return getHandler(step).map(step, mapping, doc);
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
 *
 * `forwardStepMaps` is set to identity placeholders for the same reason —
 * the inverse-step forward effect is only computable against the document
 * state at each inverse, which the caller (e.g. `HistoryManager.undo`)
 * tracks while walking.
 */
export function invertTransaction(tr: Transaction): Transaction {
	const invertedSteps: Step[] = tr.steps.map(invertStep).reverse();
	return {
		steps: invertedSteps,
		selectionBefore: tr.selectionAfter,
		selectionAfter: tr.selectionBefore,
		storedMarksAfter: deriveStoredMarksBefore(tr),
		mapping: Mapping.empty,
		forwardStepMaps: invertedSteps.map(() => IDENTITY_MAP),
		metadata: {
			origin: 'history',
			timestamp: Date.now(),
		},
	};
}
