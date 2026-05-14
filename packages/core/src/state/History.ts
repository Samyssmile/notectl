/**
 * History manager for undo/redo with transaction grouping.
 */

import type { EditorState } from './EditorState.js';
import { Mapping } from './Mapping.js';
import { mapSelection } from './SelectionMapping.js';
import { applyStep, getStepMap } from './StepHandlers.js';
import type { Step, StepMap, Transaction } from './Transaction.js';
import { invertTransaction } from './Transaction.js';

export interface HistoryResult {
	readonly state: EditorState;
	readonly transaction: Transaction;
}

interface HistoryGroup {
	readonly transactions: readonly Transaction[];
	readonly timestamp: number;
	/**
	 * Composed mapping of every transaction that landed in the editor
	 * **after** this group was logically completed. Used by {@link undo}
	 * to fold the restored selection through interleaved edits rather than
	 * relying on numeric clamping. Empty by default.
	 */
	readonly interveningMapping: Mapping;
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
	 *
	 * When a *new* group is started, every older group's
	 * `interveningMapping` is extended with `tr.mapping`, so that on undo
	 * the older group's restored selection can be folded through the
	 * intervening change.
	 */
	push(tr: Transaction): void {
		// History and redo transactions are not pushed
		if (tr.metadata.origin === 'history') return;

		// Skip transactions with no document changes (selection/stored marks only)
		// but break grouping so the next insertion starts a new undo group.
		if (!tr.steps.some((step: Step) => step.type !== 'setStoredMarks')) {
			this.lastOrigin = null;
			return;
		}

		const now = tr.metadata.timestamp;
		const lastGroup = this.undoStack[this.undoStack.length - 1];
		const shouldGroup =
			lastGroup &&
			tr.metadata.origin === 'input' &&
			this.lastOrigin === 'input' &&
			now - lastGroup.timestamp < this.groupTimeoutMs &&
			this.isSameInputType(lastGroup.transactions, tr);

		if (shouldGroup && lastGroup) {
			// Merge into existing group; tr is part of this group, not intervening.
			this.undoStack[this.undoStack.length - 1] = {
				...lastGroup,
				transactions: [...lastGroup.transactions, tr],
				timestamp: now,
			};
		} else {
			// Starting a new group — every existing group now sees `tr` as an
			// intervening change.
			if (!tr.mapping.isEmpty) {
				for (let i = 0; i < this.undoStack.length; i++) {
					const g = this.undoStack[i];
					if (!g) continue;
					this.undoStack[i] = {
						...g,
						interveningMapping: g.interveningMapping.appendMapping(tr.mapping),
					};
				}
			}
			this.undoStack.push({
				transactions: [tr],
				timestamp: now,
				interveningMapping: Mapping.empty,
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

	/**
	 * Records an out-of-band transaction's mapping so that subsequent undos
	 * fold their restored selection through it. Use for transactions
	 * applied to the editor without going through {@link push} (e.g.
	 * collaboration / agent updates that the user should not be able to
	 * undo). Empty mappings are a no-op.
	 */
	recordIntervening(mapping: Mapping): void {
		if (mapping.isEmpty) return;
		for (let i = 0; i < this.undoStack.length; i++) {
			const g = this.undoStack[i];
			if (!g) continue;
			this.undoStack[i] = {
				...g,
				interveningMapping: g.interveningMapping.appendMapping(mapping),
			};
		}
	}

	/** Undoes the last group and returns the new state with transaction, or null if nothing to undo. */
	undo(state: EditorState): HistoryResult | null {
		const group = this.undoStack.pop();
		if (!group) return null;

		let currentState = state;
		const allSteps: Step[] = [];
		const allStepMaps: StepMap[] = [];

		// Apply inverted transactions in reverse order. We accumulate each
		// inverse step's map against the live document so the summary's
		// `mapping` reflects what was actually applied during the undo.
		for (let i = group.transactions.length - 1; i >= 0; i--) {
			const tr = group.transactions[i];
			if (!tr) continue;
			const inverted = invertTransaction(tr);
			let docForMapping = currentState.doc;
			for (const step of inverted.steps) {
				allStepMaps.push(getStepMap(docForMapping, step));
				docForMapping = applyStep(docForMapping, step);
			}
			currentState = currentState.apply(inverted);
			allSteps.push(...inverted.steps);
		}

		// If interleaved transactions arrived after this group was completed,
		// fold the group's original pre-edit selection through their composed
		// mapping. `EditorState.apply` set the selection to the literal
		// `selectionBefore`, which is only numerically valid in the absence of
		// intervening edits.
		if (!group.interveningMapping.isEmpty) {
			const original = group.transactions[0];
			if (original) {
				const mapped = mapSelection(original.selectionBefore, group.interveningMapping);
				if (mapped !== null) {
					currentState = currentState.withSelection(mapped);
				}
			}
		}

		// Push to redo stack
		this.redoStack.push({
			transactions: group.transactions,
			timestamp: Date.now(),
			interveningMapping: Mapping.empty,
		});

		this.lastOrigin = null;

		const transaction: Transaction = {
			steps: allSteps,
			selectionBefore: state.selection,
			selectionAfter: currentState.selection,
			storedMarksAfter: currentState.storedMarks,
			mapping: Mapping.from(allStepMaps),
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
		let mapping: Mapping = Mapping.empty;

		// Re-apply transactions in original order; each one already carries
		// its own mapping, so we just concatenate.
		for (const tr of group.transactions) {
			currentState = currentState.apply(tr);
			allSteps.push(...tr.steps);
			mapping = mapping.appendMapping(tr.mapping);
		}

		// Push back to undo stack
		this.undoStack.push({
			transactions: group.transactions,
			timestamp: Date.now(),
			interveningMapping: Mapping.empty,
		});

		this.lastOrigin = null;

		const transaction: Transaction = {
			steps: allSteps,
			selectionBefore: state.selection,
			selectionAfter: currentState.selection,
			storedMarksAfter: currentState.storedMarks,
			mapping,
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
