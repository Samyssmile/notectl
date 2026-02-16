/**
 * History manager for undo/redo with transaction grouping.
 */

import type { EditorState } from './EditorState.js';
import type { Step, Transaction } from './Transaction.js';
import { invertTransaction } from './Transaction.js';

export interface HistoryResult {
	readonly state: EditorState;
	readonly transaction: Transaction;
}

interface HistoryGroup {
	readonly transactions: readonly Transaction[];
	readonly timestamp: number;
}

const DEFAULT_GROUP_TIMEOUT_MS = 500;
const DEFAULT_MAX_DEPTH = 100;

export class HistoryManager {
	private undoStack: HistoryGroup[] = [];
	private redoStack: HistoryGroup[] = [];
	private readonly groupTimeoutMs: number;
	private readonly maxDepth: number;
	private lastOrigin: string | null = null;

	constructor(options?: { groupTimeoutMs?: number; maxDepth?: number }) {
		this.groupTimeoutMs = options?.groupTimeoutMs ?? DEFAULT_GROUP_TIMEOUT_MS;
		this.maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
	}

	/**
	 * Pushes a transaction onto the undo stack.
	 * Groups consecutive input transactions within the timeout window.
	 */
	push(tr: Transaction): void {
		// History and redo transactions are not pushed
		if (tr.metadata.origin === 'history') return;

		const now = tr.metadata.timestamp;
		const lastGroup = this.undoStack[this.undoStack.length - 1];
		const shouldGroup =
			lastGroup &&
			tr.metadata.origin === 'input' &&
			this.lastOrigin === 'input' &&
			now - lastGroup.timestamp < this.groupTimeoutMs &&
			this.isSameInputType(lastGroup.transactions, tr);

		if (shouldGroup && lastGroup) {
			// Merge into existing group
			this.undoStack[this.undoStack.length - 1] = {
				transactions: [...lastGroup.transactions, tr],
				timestamp: now,
			};
		} else {
			// Start new group
			this.undoStack.push({
				transactions: [tr],
				timestamp: now,
			});
		}

		this.lastOrigin = tr.metadata.origin;

		// Clear redo stack on new input
		this.redoStack = [];

		// Enforce max depth
		while (this.undoStack.length > this.maxDepth) {
			this.undoStack.shift();
		}
	}

	/** Undoes the last group and returns the new state with transaction, or null if nothing to undo. */
	undo(state: EditorState): HistoryResult | null {
		const group = this.undoStack.pop();
		if (!group) return null;

		let currentState = state;
		const allSteps: Step[] = [];

		// Apply inverted transactions in reverse order
		for (let i = group.transactions.length - 1; i >= 0; i--) {
			const tr = group.transactions[i];
			if (!tr) continue;
			const inverted = invertTransaction(tr);
			currentState = currentState.apply(inverted);
			allSteps.push(...inverted.steps);
		}

		// Push to redo stack
		this.redoStack.push({
			transactions: group.transactions,
			timestamp: Date.now(),
		});

		this.lastOrigin = null;

		const transaction: Transaction = {
			steps: allSteps,
			selectionBefore: state.selection,
			selectionAfter: currentState.selection,
			storedMarksAfter: currentState.storedMarks,
			metadata: { origin: 'history', timestamp: Date.now(), historyDirection: 'undo' },
		};

		return { state: currentState, transaction };
	}

	/** Redoes the last undone group and returns the new state with transaction, or null if nothing to redo. */
	redo(state: EditorState): HistoryResult | null {
		const group = this.redoStack.pop();
		if (!group) return null;

		let currentState = state;
		const allSteps: Step[] = [];

		// Re-apply transactions in original order
		for (const tr of group.transactions) {
			currentState = currentState.apply(tr);
			allSteps.push(...tr.steps);
		}

		// Push back to undo stack
		this.undoStack.push({
			transactions: group.transactions,
			timestamp: Date.now(),
		});

		this.lastOrigin = null;

		const transaction: Transaction = {
			steps: allSteps,
			selectionBefore: state.selection,
			selectionAfter: currentState.selection,
			storedMarksAfter: currentState.storedMarks,
			metadata: { origin: 'history', timestamp: Date.now(), historyDirection: 'redo' },
		};

		return { state: currentState, transaction };
	}

	/** Returns true if there are entries to undo. */
	canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	/** Returns true if there are entries to redo. */
	canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	/** Clears all history. */
	clear(): void {
		this.undoStack = [];
		this.redoStack = [];
		this.lastOrigin = null;
	}

	/**
	 * Checks if consecutive transactions are of the same "type" for grouping.
	 * Groups text insertion together, deletion together, but not mixed.
	 */
	private isSameInputType(existing: readonly Transaction[], incoming: Transaction): boolean {
		const lastTr = existing[existing.length - 1];
		if (!lastTr) return false;

		const lastStepType = lastTr.steps[0]?.type;
		const incomingStepType = incoming.steps[0]?.type;

		// Group same step types (insertText with insertText, deleteText with deleteText)
		return lastStepType === incomingStepType;
	}
}
