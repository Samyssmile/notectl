/**
 * Announcer: builds screen-reader announcement text for editor state changes.
 * Pure functions — no DOM mutation. The caller applies the result to a live region.
 */

import { isMarkActive } from '../commands/Commands.js';
import { markType } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';

const BLOCK_TYPE_LABELS: Record<string, string> = {
	paragraph: 'Paragraph',
	heading: 'Heading',
	code_block: 'Code Block',
	blockquote: 'Block Quote',
	list_item: 'List Item',
	horizontal_rule: 'Horizontal Rule',
	image: 'Image',
	table: 'Table',
};

/** Returns a human-readable label for a block type (used in screen reader announcements). */
export function getBlockTypeLabel(typeName: string, attrs?: Record<string, unknown>): string {
	if (typeName === 'heading' && attrs?.level) {
		return `Heading ${attrs.level}`;
	}
	return BLOCK_TYPE_LABELS[typeName] ?? typeName;
}

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
