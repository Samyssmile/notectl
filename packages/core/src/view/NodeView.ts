/**
 * NodeView: custom rendering and behavior for block nodes.
 */

import type { BlockNode } from '../model/Document.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';

export interface NodeView {
	/** Root DOM element. Must have `data-block-id` set. */
	readonly dom: HTMLElement;
	/** Where text children are rendered. Null for void nodes. */
	readonly contentDOM: HTMLElement | null;
	/** For nodes with multiple content areas (e.g. table cells), returns the DOM for a specific child. */
	getContentDOM?(childId: string): HTMLElement | null;
	/** Returns true if the update was handled, false to re-create the NodeView. */
	update?(node: BlockNode): boolean;
	destroy?(): void;
	selectNode?(): void;
	deselectNode?(): void;
}

export type NodeViewFactory = (
	node: BlockNode,
	getState: () => EditorState,
	dispatch: (tr: Transaction) => void,
) => NodeView;
