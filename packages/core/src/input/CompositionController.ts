/**
 * CompositionController: owns the lifecycle of an IME composition, from
 * `compositionstart` to committing its result into the model.
 *
 * While composing, the browser owns the composition block's DOM: the model is
 * not updated, the reconciler skips the block, and composing deletions are
 * left to the browser (#230). When the composition ends, the block's rendered
 * text is the source of truth for the browser's edits: the composed text,
 * deletions reaching committed text in front of the composition start
 * (#257), and recomposition of an existing word. The controller follows every
 * transaction applied while composing, so those edits are placed into the
 * current document without reverting changes made meanwhile (#260).
 */

import {
	type CompositionBase,
	commitComposition,
	createCompositionBase,
	mapCompositionBase,
} from '../commands/CompositionCommands.js';
import type { CompositionSnapshot } from '../model/CompositionState.js';
import type { BlockNode } from '../model/Document.js';
import { type Selection, isTextSelection } from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import type { CompositionTracker } from './CompositionTracker.js';

/**
 * View-side DOM access needed to commit a composition. Implemented by the
 * view and wired by the composition root, because `input/` must not depend
 * on `view/`.
 */
export interface CompositionDOM {
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

export class CompositionController {
	private readonly options: CompositionControllerOptions;
	private base: CompositionBase | null = null;
	private commitHandled = false;

	constructor(options: CompositionControllerOptions) {
		this.options = options;
	}

	/**
	 * Starts tracking a composition at the current selection. Compositions on
	 * non-text selections are not tracked. Only a selection inside one leaf
	 * block records a base for the rendered-text commit.
	 */
	start(): void {
		this.base = null;
		const state: EditorState = this.options.getState();
		const selection = state.selection;
		if (!isTextSelection(selection)) return;
		this.commitHandled = false;
		this.options.tracker.start(selection.anchor.blockId);
		this.base = singleBlockBase(state, selection);
	}

	/**
	 * Follows a transaction applied while composing, so the commit can place
	 * the browser's edit in the changed document.
	 */
	onStateChange(oldState: EditorState, newState: EditorState, tr: Transaction): void {
		if (!this.base) return;
		this.base = mapCompositionBase(this.base, oldState, newState, tr);
	}

	/**
	 * Records that an `insertFromComposition` input event already applied the
	 * composed text, so ending the composition must not apply it again.
	 */
	markCommitHandled(): void {
		this.commitHandled = true;
	}

	/**
	 * Ends the composition and makes the model adopt its result. Unless the
	 * commit changed the composition block, which re-renders it, the block is
	 * re-rendered from the model so no browser-owned DOM outlives the
	 * composition.
	 *
	 * @param composedText - The `compositionend` data, used only when the
	 *   rendered edit cannot be read or placed.
	 */
	end(composedText: string): void {
		const base: CompositionBase | null = this.base;
		this.base = null;
		this.options.tracker.end();
		if (this.options.isReadOnly()) return;

		if (this.commitHandled) {
			this.commitHandled = false;
			this.restore(base);
			return;
		}

		const blockBefore: BlockNode | undefined = base ? this.compositionBlock(base) : undefined;
		const tr: Transaction | null = this.buildCommit(base, composedText);
		if (tr) this.options.dispatch(tr);
		if (base && this.compositionBlock(base) === blockBefore) this.restore(base);
	}

	private buildCommit(base: CompositionBase | null, composedText: string): Transaction | null {
		const rendered = base ? (this.options.compositionDOM?.readBlock(base.blockId) ?? null) : null;
		return commitComposition(this.options.getState(), composedText, base, rendered);
	}

	private compositionBlock(base: CompositionBase): BlockNode | undefined {
		return this.options.getState().getBlock(base.blockId);
	}

	private restore(base: CompositionBase | null): void {
		if (base) this.options.compositionDOM?.restoreBlock(base.blockId);
	}
}

/** The base of a selection inside one leaf block, or `null` for any other selection. */
function singleBlockBase(state: EditorState, selection: Selection): CompositionBase | null {
	const { anchor, head } = selection;
	if (anchor.blockId !== head.blockId) return null;
	return createCompositionBase(state, anchor.blockId, Math.min(anchor.offset, head.offset));
}
