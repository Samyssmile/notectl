/**
 * CompositionController: owns the lifecycle of an IME composition, from
 * `compositionstart` to committing its result into the model.
 *
 * While composing, the browser owns the composition block's DOM: the model is
 * not updated, the reconciler skips the block, and composing deletions are
 * left to the browser (#230). When the composition ends, the block's rendered
 * text is the source of truth. The controller diffs it against the model and
 * dispatches the difference, so every browser edit is adopted: the composed
 * text, deletions reaching committed text in front of the composition start
 * (#257), and recomposition of an existing word.
 */

import { insertTextCommand } from '../commands/Commands.js';
import { commitComposedText } from '../commands/CompositionCommands.js';
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
	 * Returns the text leaf block `blockId` currently renders, in model-offset
	 * space, or `null` when no element renders it.
	 */
	readBlockText(blockId: BlockId): string | null;
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

/** Where a composition started: a block and the start offset of the selection it replaces. */
interface CompositionAnchor {
	readonly blockId: BlockId;
	readonly from: number;
}

export class CompositionController {
	private readonly options: CompositionControllerOptions;
	private anchor: CompositionAnchor | null = null;
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
		const selection = this.options.getState().selection;
		if (!isTextSelection(selection)) return;
		this.commitHandled = false;
		this.options.tracker.start(selection.anchor.blockId);
		this.anchor = singleBlockAnchor(selection);
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

		const tr: Transaction | null = this.buildCommit(anchor, composedText);
		if (tr) {
			this.options.dispatch(tr);
			return;
		}
		this.restore(anchor);
	}

	private buildCommit(anchor: CompositionAnchor | null, composedText: string): Transaction | null {
		const state: EditorState = this.options.getState();
		const rendered: string | null = anchor
			? (this.options.compositionDOM?.readBlockText(anchor.blockId) ?? null)
			: null;
		if (anchor && rendered !== null) {
			return commitComposedText(state, anchor.blockId, rendered, anchor.from);
		}
		// Without readable DOM, assume the composition inserted its text at the caret.
		return composedText ? insertTextCommand(state, composedText, 'input') : null;
	}

	private restore(anchor: CompositionAnchor | null): void {
		if (anchor) this.options.compositionDOM?.restoreBlock(anchor.blockId);
	}
}

/** The anchor of a selection inside one block, or `null` for a multi-block selection. */
function singleBlockAnchor(selection: Selection): CompositionAnchor | null {
	const { anchor, head } = selection;
	if (anchor.blockId !== head.blockId) return null;
	return { blockId: anchor.blockId, from: Math.min(anchor.offset, head.offset) };
}
