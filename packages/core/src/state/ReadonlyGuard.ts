/**
 * Pure guard functions for readonly mode enforcement.
 * Used by the central dispatch guard to determine whether a transaction
 * should be allowed in readonly mode.
 */

import type { Transaction } from './Transaction.js';

/** Returns true if the transaction contains no document-mutating steps. */
export function isSelectionOnlyTransaction(tr: Transaction): boolean {
	for (const step of tr.steps) {
		if (step.type !== 'setStoredMarks') return false;
	}
	return true;
}

/** Returns true if the transaction is allowed to proceed in readonly mode. */
export function isAllowedInReadonly(tr: Transaction): boolean {
	if (tr.metadata.readonlyAllowed) return true;
	return isSelectionOnlyTransaction(tr);
}
