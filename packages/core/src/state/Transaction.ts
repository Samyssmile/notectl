/**
 * Transaction system for the Notectl editor.
 * Transactions describe atomic, invertible state changes.
 *
 * This module defines the Transaction and TransactionMetadata interfaces
 * and re-exports all related types from their focused modules.
 */

import type { Mark } from '../model/Document.js';
import type { EditorSelection } from '../model/Selection.js';
import type { Mapping } from './Mapping.js';
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
}

// --- Re-exports ---

export * from './Steps.js';
export type { Mapping, MapResult, PositionRange, StepMap, Assoc } from './Mapping.js';
export { invertStep, invertTransaction } from './StepHandlers.js';
export { TransactionBuilder } from './TransactionBuilder.js';
