/**
 * Announcer: builds screen-reader announcement text for editor state changes.
 * Pure functions — no DOM mutation. The caller applies the result to a live region.
 */

import { isMarkActive } from '../commands/Commands.js';
import { getBlockTypeLabel } from '../model/BlockTypeLabels.js';
import { markType } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';

export { getBlockTypeLabel } from '../model/BlockTypeLabels.js';

/**
 * Derives an announcement string from a state transition.
 * Returns `null` when no announcement is warranted.
 *
 * Priority order: undo/redo > block-type change > mark toggle.
 */
export function buildAnnouncement(
	oldState: EditorState,
	newState: EditorState,
	tr: Transaction,
): string | null {
	// Priority 1: Undo/Redo
	if (tr.metadata.historyDirection === 'undo') return 'Undo';
	if (tr.metadata.historyDirection === 'redo') return 'Redo';

	// Priority 2: Block type changes
	for (const step of tr.steps) {
		if (step.type === 'setBlockType') {
			return getBlockTypeLabel(step.nodeType, step.attrs);
		}
	}

	// Priority 3: Mark changes
	for (const mt of newState.schema.markTypes) {
		const branded = markType(mt);
		const wasActive: boolean = isMarkActive(oldState, branded);
		const nowActive: boolean = isMarkActive(newState, branded);
		if (wasActive !== nowActive) {
			return `${mt} ${nowActive ? 'on' : 'off'}`;
		}
	}

	return null;
}
