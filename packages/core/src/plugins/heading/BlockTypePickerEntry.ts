/**
 * Shared interface for block type picker entries.
 * Any plugin can register entries that appear in the block type dropdown.
 */

import type { EditorState } from '../../state/EditorState.js';

export interface PickerEntryStyle {
	readonly fontSize: string;
	readonly fontWeight: string;
}

export interface BlockTypePickerEntry {
	/** Unique identifier, e.g. 'heading-1', 'footer'. */
	readonly id: string;
	/** Display label shown in the picker, e.g. 'Heading 1'. */
	readonly label: string;
	/** Command to execute when the entry is selected. */
	readonly command: string;
	/** Sort order — lower values appear first. */
	readonly priority: number;
	/** Optional styling for the label in the picker dropdown. */
	readonly style?: PickerEntryStyle;
	/** Returns true when this entry matches the current block type. */
	isActive(state: EditorState): boolean;
}
