/**
 * Transaction system for the Notectl editor.
 * Transactions describe atomic, invertible state changes.
 *
 * This module defines the Transaction and TransactionMetadata interfaces
 * and re-exports all related types from their focused modules.
 */

import type { Mark } from '../model/Document.js';
import type { EditorSelection } from '../model/Selection.js';
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
}

// --- Re-exports ---

export * from './Steps.js';
export { invertStep, invertTransaction } from './StepInversion.js';
export { TransactionBuilder } from './TransactionBuilder.js';
