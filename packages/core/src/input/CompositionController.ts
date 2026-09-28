/**
 * CompositionController: owns the lifecycle of an IME composition, from
 * `compositionstart` to committing its result into the model.
 *
 * While composing, the browser owns the composition block's DOM: the model is
 * not updated, the reconciler skips the block, and composing deletions are
 * left to the browser (#230). When the composition ends, the block's rendered
 * text is the source of truth. The controller diffs it against the block as it
 * was when the composition started and dispatches the difference, so every
 * browser edit is adopted: the composed text, deletions reaching committed
 * text in front of the composition start (#257), and recomposition of an
 * existing word. Transactions applied while composing are recorded, so the
 * browser's edit is carried over them instead of reverting them (#260).
 */

import { insertTextCommand } from '../commands/Commands.js';
import {
	type CompositionCommitResult,
	commitComposedText,
} from '../commands/CompositionCommands.js';
import type { CompositionSnapshot } from '../model/CompositionState.js';
import { type BlockNode, isLeafBlock } from '../model/Document.js';
import { type Selection, isTextSelection } from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import { Mapping } from '../state/Mapping.js';
import type { Transaction } from '../state/Transaction.js';
import type { CompositionTracker } from './CompositionTracker.js';

/**
 * View-side DOM access needed to commit a composition. Implemented by the
 * view and wired by the composition root, because `input/` must not depend
 * on `view/`.
 */
export interface CompositionDOM {
	/**
	 * Records which inline node elements leaf block `blockId` renders, so a
	 * later {@link readBlock} can report which of them survived the composition.
	 */
	captureBlock(blockId: BlockId): void;
	/**
	 * Captures the rendered text and caret of leaf block `blockId` together,
	 * or returns `null` when no element renders it.
	 */
	readBlock(blockId: BlockId): CompositionSnapshot | null;
	/** Re-renders block `blockId` from the current state, discarding browser-owned DOM. */
	restoreBlock(blockId: BlockId): void;
}

export interface CompositionControllerOptions {
	readonly getState: () => EditorState;
	readonly dispatch: (tr: Transaction) => void;
	readonly isReadOnly: () => boolean;
	readonly tracker: CompositionTracker;
	/** Without it, a commit falls back to inserting the composed text at the caret. */
	readonly compositionDOM?: CompositionDOM;
}

/** Where a composition started: a leaf block, the selection it replaces, and the block itself. */
interface CompositionAnchor {
	readonly blockId: BlockId;
	readonly from: number;
	readonly to: number;
	/** The block when the composition started; its DOM shows this plus the browser's edits. */
	readonly baseline: BlockNode;
}

/** The transaction that ends a composition, and whether the block's DOM must be rebuilt after it. */
interface CommitPlan {
	readonly tr: Transaction | null;
	readonly restore: boolean;
}

export class CompositionController {
	private readonly options: CompositionControllerOptions;
	private anchor: CompositionAnchor | null = null;
	/** Mapping of the transactions applied while composing; `null` once the document was replaced. */
	private mapping: Mapping | null = Mapping.empty;
	private commitHandled = false;

	constructor(options: CompositionControllerOptions) {
		this.options = options;
	}

	/**
	 * Starts tracking a composition at the current selection. Compositions on
	 * non-text selections are not tracked. Only single-block selections record
	 * an anchor for the rendered-text commit.
	 */
	start(): void {
		this.anchor = null;
		const state: EditorState = this.options.getState();
		const selection = state.selection;
		if (!isTextSelection(selection)) return;
		this.commitHandled = false;
		this.mapping = Mapping.empty;
		this.options.tracker.start(selection.anchor.blockId);
		this.anchor = singleBlockAnchor(state, selection);
		if (this.anchor) this.options.compositionDOM?.captureBlock(this.anchor.blockId);
	}

	/**
	 * Records a state change applied while composing, so the commit carries the
	 * browser's edit over it (#260). A document replaced without steps, such as
	 * `setJSON`, cannot be mapped.
	 */
	observeStateChange(oldState: EditorState, newState: EditorState, tr: Transaction): void {
		if (!this.anchor || !this.mapping) return;
		const replaced: boolean = tr.steps.length === 0 && oldState.doc !== newState.doc;
		this.mapping = replaced ? null : this.mapping.appendMapping(tr.mapping);
	}

	/**
	 * Records that an `insertFromComposition` input event already applied the
	 * composed text, so ending the composition must not apply it again.
	 */
	markCommitHandled(): void {
		this.commitHandled = true;
	}

	/**
	 * Ends the composition and makes the model adopt its result. When nothing
	 * is dispatched, the composition block is re-rendered from the model so no
	 * browser-owned DOM outlives the composition.
	 *
	 * @param composedText - The `compositionend` data, used only when the
	 *   rendered text cannot be read.
	 */
	end(composedText: string): void {
		const anchor: CompositionAnchor | null = this.anchor;
		this.anchor = null;
		this.options.tracker.end();
		if (this.options.isReadOnly()) return;

		if (this.commitHandled) {
			this.commitHandled = false;
			this.restore(anchor);
			return;
		}

		const plan: CommitPlan = this.buildCommit(anchor, composedText);
		if (plan.tr) this.options.dispatch(plan.tr);
		if (plan.tr && plan.tr.steps.length > 0 && !plan.restore) return;
		this.restore(anchor);
	}

	private buildCommit(anchor: CompositionAnchor | null, composedText: string): CommitPlan {
		const state: EditorState = this.options.getState();
		const rendered = anchor
			? (this.options.compositionDOM?.readBlock(anchor.blockId) ?? null)
			: null;
		if (anchor && rendered !== null) {
			const result: CompositionCommitResult = commitComposedText(state, {
				...anchor,
				rendered,
				mapping: this.mapping,
			});
			if (result.kind === 'commit') return { tr: result.tr, restore: false };
			// The browser's edit cannot be adopted without overwriting other edits:
			// keep them, insert the composed text at the caret, and rebuild the
			// block's DOM, which still shows the browser's version.
			return { tr: insertAtCaret(state, composedText), restore: true };
		}
		// Without readable DOM, assume the composition inserted its text at the caret.
		return { tr: insertAtCaret(state, composedText), restore: false };
	}

	private restore(anchor: CompositionAnchor | null): void {
		if (anchor) this.options.compositionDOM?.restoreBlock(anchor.blockId);
	}
}

/** The anchor of a selection inside one leaf block, or `null` for any other selection. */
function singleBlockAnchor(state: EditorState, selection: Selection): CompositionAnchor | null {
	const { anchor, head } = selection;
	if (anchor.blockId !== head.blockId) return null;
	const baseline: BlockNode | undefined = state.getBlock(anchor.blockId);
	if (!baseline || !isLeafBlock(baseline)) return null;
	return {
		blockId: anchor.blockId,
		from: Math.min(anchor.offset, head.offset),
		to: Math.max(anchor.offset, head.offset),
		baseline,
	};
}

function insertAtCaret(state: EditorState, composedText: string): Transaction | null {
	return composedText ? insertTextCommand(state, composedText, 'input') : null;
}
