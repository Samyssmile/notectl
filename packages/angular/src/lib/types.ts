import type { Document, EditorSelection } from '@notectl/core';

/** Event payload emitted on selection changes. */
export interface SelectionChangeEvent {
	readonly selection: EditorSelection;
}

/** Angular-facing value type used by forms and two-way binding. */
export type NotectlValue = Document | string | null;
