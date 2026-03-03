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
