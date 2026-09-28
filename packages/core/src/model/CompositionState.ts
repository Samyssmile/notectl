/**
 * Read-only interface for composition state.
 *
 * EditorView needs to read composition state during reconciliation
 * and selection sync to avoid disrupting active IME sessions.
 * This interface lives in model/ so that both input/ and view/ can
 * import it without cross-layer violations.
 */

import type { BlockId } from './TypeBrands.js';

export interface CompositionState {
	/** Whether an IME composition session is currently active. */
	readonly isComposing: boolean;
	/** The block in which the composition is happening, or null if idle. */
	readonly activeBlockId: BlockId | null;
}

/** Browser-owned text and caret captured together before a composition is reconciled. */
export interface CompositionSnapshot {
	readonly text: string;
	/** Collapsed caret in rendered-text offset space, or null when outside this block. */
	readonly caretOffset: number | null;
	/**
	 * For each inline node element, keyed by its offset in `text`, the model
	 * offset it rendered at when the composition started, or `null` for an
	 * element the view did not see then. A placeholder character without an
	 * entry is text. Absent when the view did not capture the block; inline
	 * nodes then compare by placeholder only.
	 */
	readonly inlineNodeOrigins?: ReadonlyMap<number, number | null>;
}
