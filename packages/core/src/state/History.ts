/**
 * History manager for undo/redo with transaction grouping.
 *
 * Undo and redo both rebase their steps through any `interveningMapping`
 * accumulated by {@link HistoryManager.recordIntervening}, so out-of-band
 * transactions (collaboration updates, agent edits, async plugin writes)
 * can land in the document without corrupting the user's undo/redo
 * history. When a step's coordinates cannot survive the rebase (host block
 * removed, range fully eaten by intervening edits), the entire group is
 * abandoned rather than partially applied.
 *
 * Internally, an undo produces a *synthetic* transaction whose steps are
 * the rebased inverses of the original group's steps. The synthetic is
 * pushed onto the redo stack; redo simply runs the same rebase-and-apply
 * algorithm against it (inverting its steps a second time). This keeps
 * undo and redo perfectly symmetric — both paths exercise the same
 * frame-correct rebasing logic, and the rebased step maps from one
 * direction become the forward step maps used to rebase the other.
 */

import type { Mark } from '../model/Document.js';
import type { Document } from '../model/Document.js';
import type { EditorState } from './EditorState.js';
import { Mapping, type StepMap, invertStepMap, stepMapsEqual } from './Mapping.js';
import { mapSelection } from './SelectionMapping.js';
import { applyStep, getStepMap, invertStep, mapStep } from './StepHandlers.js';
import { deriveStoredMarksBefore } from './StepInversion.js';
import type { Step, Transaction } from './Transaction.js';

export interface HistoryResult {
	readonly state: EditorState;
	readonly transaction: Transaction;
}

interface HistoryGroup {
	readonly transactions: readonly Transaction[];
	readonly timestamp: number;
	/**
	 * Composed mapping of out-of-band transactions accumulated since this
	 * group was placed on its stack. Used by {@link HistoryManager.undo} /
	 * {@link HistoryManager.redo} to fold every step in the group through
	 * intervening edits — not just the restored selection. Empty by default.
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
	 * Pushed transactions never propagate their mapping onto older groups'
	 * {@link interveningMapping}: linear undo pops newer groups before older
	 * ones, reverting their effects first, so by the time an older group is
	 * undone the newer ones' forward maps no longer reflect document state.
	 * Out-of-band edits that the caller does NOT want undoable should use
	 * {@link recordIntervening} instead.
	 */
	push(tr: Transaction): void {
		if (tr.metadata.origin === 'history') return;

		// Skip transactions with no document changes (selection/stored marks only),
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
			this.undoStack[this.undoStack.length - 1] = {
				...lastGroup,
				transactions: [...lastGroup.transactions, tr],
				timestamp: now,
			};
		} else {
			this.undoStack.push({
				transactions: [tr],
				timestamp: now,
				interveningMapping: Mapping.empty,
			});
		}

		this.lastOrigin = tr.metadata.origin;

		// New user input invalidates the redo history.
		this.redoStack = [];

		while (this.undoStack.length > this.maxDepth) {
			this.undoStack.shift();
		}
	}

	/**
	 * Records an out-of-band transaction's mapping so subsequent undos *and*
	 * redos fold their steps and restored selection through it. Use for
	 * transactions applied to the editor without going through {@link push}
	 * (e.g. collaboration or agent updates that the user is not supposed to
	 * undo / redo). Empty mappings are a no-op.
	 *
	 * Propagates to **both** stacks so a `undo → intervening → redo` flow
	 * is safe: the redo group's steps get rebased through the new mapping
	 * just as the undo group's would have.
	 */
	recordIntervening(mapping: Mapping): void {
		if (mapping.isEmpty) return;
		extendInterveningMapping(this.undoStack, mapping);
		extendInterveningMapping(this.redoStack, mapping);
	}

	/** Undoes the last group and returns the new state with transaction, or null if nothing to undo. */
	undo(state: EditorState): HistoryResult | null {
		const group = this.undoStack.pop();
		if (!group) return null;

		const replayed = rebaseGroupForReplay(group, state, 'undo');
		if (replayed === null) {
			// Group cannot survive intervening edits. Drop it entirely; don't
			// restore (state unchanged), don't push to redo (the inverse
			// sequence is invalid). Report nothing-to-undo so the caller's UX
			// reflects that the operation had no effect.
			this.lastOrigin = null;
			return null;
		}

		this.redoStack.push({
			transactions: [replayed.transaction],
			timestamp: Date.now(),
			interveningMapping: Mapping.empty,
		});
		this.lastOrigin = null;
		return { state: replayed.newState, transaction: replayed.transaction };
	}

	/** Redoes the last undone group and returns the new state with transaction, or null if nothing to redo. */
	redo(state: EditorState): HistoryResult | null {
		const group = this.redoStack.pop();
		if (!group) return null;

		const replayed = rebaseGroupForReplay(group, state, 'redo');
		if (replayed === null) {
			this.lastOrigin = null;
			return null;
		}

		this.undoStack.push({
			transactions: [replayed.transaction],
			timestamp: Date.now(),
			interveningMapping: Mapping.empty,
		});
		this.lastOrigin = null;
		return { state: replayed.newState, transaction: replayed.transaction };
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

		return lastStepType === incomingStepType;
	}
}

// --- Group replay (shared by undo and redo) ---

interface ReplayedGroup {
	readonly newState: EditorState;
	readonly transaction: Transaction;
}

/**
 * Replays a {@link HistoryGroup} against `state`, inverting every step and
 * rebasing each inverse through the group's accumulated `interveningMapping`
 * (plus the running rebase of the steps already applied in this replay).
 *
 * Used for both undo (where `group` holds the original user transactions)
 * and redo (where `group` holds the synthetic produced by the previous
 * undo): in either case we apply the *inverse* of the group's recorded
 * steps, frame-correctly rebased.
 *
 * Returns `null` when any inverse step cannot survive the rebase
 * ({@link mapStep} returned `null`); callers must abandon the entire group
 * rather than apply partial inverses, which would silently corrupt the
 * document.
 *
 * ## Frame-walk
 *
 * A multi-step transaction `tr` has steps `S_1…S_m` taking frames
 * `F_0 →(S_1) F_1 → … →(S_m) F_m`. Each inverse step `invert(S_k)`
 * references coordinates in frame `F_k`. When we replay them in reverse
 * order (`invert(S_m)`, `invert(S_{m-1})`, …), each inverse lives in a
 * progressively older frame, so the running rebase mapping has to be
 * extended on *both* sides at every iteration:
 *
 * - **prepend** the forward map of the original step we just inverted
 *   (advances the source frame from `F_k` to `F_{k-1}` for the next
 *   inverse);
 * - **append** the forward map of the rebased step we just applied
 *   (advances the target frame to the new current document).
 *
 * The identity-filtered {@link Transaction.mapping} would lose the
 * step-to-index correlation, so we read forward maps from
 * {@link Transaction.forwardStepMaps}, which is parallel to `steps`.
 */
function rebaseGroupForReplay(
	group: HistoryGroup,
	state: EditorState,
	direction: 'undo' | 'redo',
): ReplayedGroup | null {
	let rebaseMapping: Mapping = group.interveningMapping;
	let currentDoc: Document = state.doc;
	const rebasedSteps: Step[] = [];
	const rebasedStepMaps: StepMap[] = [];

	for (let i = group.transactions.length - 1; i >= 0; i--) {
		const tr = group.transactions[i];
		if (!tr) continue;

		for (let j = tr.steps.length - 1; j >= 0; j--) {
			const originalStep = tr.steps[j];
			const originalForwardMap = tr.forwardStepMaps[j];
			if (!originalStep || !originalForwardMap) continue;

			const inverse: Step = invertStep(originalStep);
			const rebased: Step | null = mapStep(inverse, rebaseMapping, currentDoc);
			if (rebased === null) return null;

			const rebasedMap: StepMap = getStepMap(currentDoc, rebased);
			rebasedSteps.push(rebased);
			rebasedStepMaps.push(rebasedMap);
			currentDoc = applyStep(currentDoc, rebased);

			rebaseMapping = extendRebaseChain(originalForwardMap, rebaseMapping, rebasedMap);
		}
	}

	const storedMarksAfter: readonly Mark[] | null = deriveStoredMarksAfterReplay(group);

	const summaryTr: Transaction = {
		steps: rebasedSteps,
		selectionBefore: state.selection,
		selectionAfter: state.selection, // overwritten below with the mapped selection
		storedMarksAfter,
		mapping: Mapping.from(rebasedStepMaps),
		forwardStepMaps: rebasedStepMaps,
		metadata: {
			origin: 'history',
			timestamp: Date.now(),
			historyDirection: direction,
		},
	};

	let newState: EditorState = state.apply(summaryTr);

	// `rebaseMapping` now spans `F_0` (pre-group) → current doc, exactly the
	// mapping the original group's pre-edit selection needs to land in the
	// post-replay frame.
	const first = group.transactions[0];
	if (first) {
		const mapped = mapSelection(first.selectionBefore, rebaseMapping);
		if (mapped !== null) {
			newState = newState.withSelection(mapped);
		}
	}

	const finalTr: Transaction = {
		...summaryTr,
		selectionAfter: newState.selection,
	};

	return { newState, transaction: finalTr };
}

/**
 * Derives the storedMarks the document should carry after the group's
 * inverse has been applied. For undo of a user-pushed group this is the
 * pre-group storedMarks; for redo of a synthetic this is the pre-undo
 * storedMarks. Both fall out of {@link deriveStoredMarksBefore} applied to
 * the group's first transaction, because the synthetic's inverted
 * `setStoredMarks` step (if any) sits at the head of its step list.
 */
function deriveStoredMarksAfterReplay(group: HistoryGroup): readonly Mark[] | null {
	const first = group.transactions[0];
	if (!first) return null;
	return deriveStoredMarksBefore(first);
}

/**
 * Extends the rebase chain by prepending `originalForwardMap` and appending
 * `rebasedMap` to `existing`. When `existing` is empty AND
 * `originalForwardMap` and `rebasedMap` are mutual inverses (i.e. the rebase
 * was a no-op — the rebased step is the literal inverse of the original),
 * the prepend/append cancel out and we return `existing` unchanged.
 *
 * Why this matters: the natural composition `[forward, inverse]` describes
 * a content-preserving round-trip but is *not* a position-mapping identity
 * (positions interior to a delete-then-reinsert clamp to the deletion
 * start). Without cancellation, the rebase chain accumulates these lossy
 * round-trips on every multi-step group and corrupts subsequent inverse
 * steps' coordinates. With cancellation, the chain stays empty whenever no
 * real intervening edit reshaped the rebased step, which is the common
 * case.
 *
 * Cancellation only fires when nothing sits between the two stepmaps —
 * once an intervening map is in the middle, the round-trip is no longer
 * "no-op" because the intervening could have reshaped positions inside the
 * affected range.
 */
function extendRebaseChain(
	originalForwardMap: StepMap,
	existing: Mapping,
	rebasedMap: StepMap,
): Mapping {
	if (existing.isEmpty && stepMapsEqual(invertStepMap(originalForwardMap), rebasedMap)) {
		return existing;
	}
	return Mapping.from([originalForwardMap]).appendMapping(existing).appendMap(rebasedMap);
}

function extendInterveningMapping(stack: HistoryGroup[], mapping: Mapping): void {
	for (let i = 0; i < stack.length; i++) {
		const g = stack[i];
		if (!g) continue;
		stack[i] = {
			...g,
			interveningMapping: g.interveningMapping.appendMapping(mapping),
		};
	}
}
