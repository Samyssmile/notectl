import type { EditorSelection } from '@notectl/core';

/** Event payload emitted on selection changes. */
export interface SelectionChangeEvent {
	readonly selection: EditorSelection;
}
