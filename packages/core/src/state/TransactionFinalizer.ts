/** Final transaction invariant boundary after middleware or other extension code. */

import type { Document } from '../model/Document.js';
import { type StepMap, snapshotStepMap } from './Mapping.js';
import { applyStep, getStepMap } from './StepHandlers.js';
import type { Step } from './Steps.js';
import type { Transaction } from './Transaction.js';
import {
	hasVerifiedTransactionMaps,
	sealOwnedTransaction,
	snapshotOptionalMarks,
	snapshotSelection,
	snapshotStep,
} from './TransactionSnapshot.js';

/**
 * Re-establishes the complete Transaction contract after an extension boundary.
 * Maps are recomputed step-by-step against their real pre-apply document frame;
 * incoming maps are deliberately ignored because middleware may have replaced,
 * removed, or appended steps without updating them.
 */
export function finalizeTransaction(transaction: Transaction, doc: Document): Transaction {
	if (hasVerifiedTransactionMaps(transaction)) return transaction;

	const steps: Step[] = [];
	const stepMaps: StepMap[] = [];
	let workingDoc = doc;
	for (const sourceStep of transaction.steps) {
		const step = snapshotStep(sourceStep);
		steps.push(step);
		stepMaps.push(snapshotStepMap(getStepMap(workingDoc, step)));
		workingDoc = applyStep(workingDoc, step);
	}

	return sealOwnedTransaction({
		steps,
		selectionBefore: snapshotSelection(transaction.selectionBefore),
		selectionAfter: snapshotSelection(transaction.selectionAfter),
		storedMarksAfter: snapshotOptionalMarks(transaction.storedMarksAfter),
		forwardStepMaps: stepMaps,
		metadata: transaction.metadata,
	});
}
