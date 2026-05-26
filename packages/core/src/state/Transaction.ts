/**
 * Transaction system for the Notectl editor.
 * Transactions describe atomic, invertible state changes.
 *
 * This module defines the Transaction and TransactionMetadata interfaces
 * and re-exports all related types from their focused modules.
 */

import type { Mark } from '../model/Document.js';
import type { EditorSelection } from '../model/Selection.js';
import type { Mapping, StepMap } from './Mapping.js';
import type { Step, TransactionOrigin } from './Steps.js';

// --- Transaction ---

export interface TransactionMetadata {
	readonly origin: TransactionOrigin;
	readonly timestamp: number;
	readonly historyDirection?: 'undo' | 'redo';
	readonly readonlyAllowed?: boolean;
}

export interface Transaction {
	readonly steps: readonly Step[];
	readonly selectionBefore: EditorSelection;
	readonly selectionAfter: EditorSelection;
	readonly storedMarksAfter: readonly Mark[] | null;
	readonly metadata: TransactionMetadata;
	/**
	 * Composed position-mapping for every step in {@link steps}, in order.
	 * Consumers (decorations, selections, history, comments) fold positions
	 * through this mapping rather than re-implementing per-step math.
	 *
	 * Always present, even for selection-only transactions ({@link Mapping.empty}).
	 */
	readonly mapping: Mapping;
	/**
	 * Per-step forward {@link StepMap}s in original order, parallel to
	 * {@link steps} (one entry per step, including identity maps that
	 * {@link mapping} would otherwise filter out).
	 *
	 * Required by history's step-rebase logic: when an inverse step
	 * `inverted.steps[j] = invert(steps[m-1-j])` is rebased after intervening
	 * edits, the next inverse `inverted.steps[j+1]` lives in the frame
	 * **before** `steps[m-1-j]` was applied, and the rebase mapping must be
	 * prepended with `forwardStepMaps[m-1-j]` to span back to that frame.
	 * The identity-filtered {@link mapping} loses this index-to-step
	 * correlation, so we keep the raw array alongside it.
	 */
	readonly forwardStepMaps: readonly StepMap[];
}

// --- Re-exports ---

export * from './Steps.js';
export type { Mapping, MapResult, PositionRange, StepMap, Assoc } from './Mapping.js';
export { invertStep, invertTransaction, mapStep } from './StepHandlers.js';
export { TransactionBuilder } from './TransactionBuilder.js';
