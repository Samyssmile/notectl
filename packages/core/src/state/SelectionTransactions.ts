/**
 * Shared transaction builders for cursor and selection movement.
 *
 * These helpers encapsulate the common pattern of building a transaction
 * that sets a new selection and clears storedMarks.
 */

import { findNodePath } from '../model/NodeResolver.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	createSelection,
} from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import type { EditorState } from './EditorState.js';
import type { Transaction } from './Transaction.js';

/** Builds a collapsed-cursor transaction that clears storedMarks. */
export function moveTx(state: EditorState, blockId: BlockId, offset: number): Transaction {
	return state
		.transaction('input')
		.setSelection(createCollapsedSelection(blockId, offset))
		.setStoredMarks(null, state.storedMarks)
		.build();
}

/** Builds a NodeSelection transaction that clears storedMarks. */
export function nodeSelTx(state: EditorState, targetId: BlockId): Transaction {
	const path: BlockId[] = (findNodePath(state.doc, targetId) ?? []) as BlockId[];
	return state
		.transaction('input')
		.setSelection(createNodeSelection(targetId, path))
		.setStoredMarks(null, state.storedMarks)
		.build();
}

/** Builds a range-selection transaction that clears storedMarks. */
export function extendTx(
	state: EditorState,
	anchorBlockId: BlockId,
	anchorOffset: number,
	headBlockId: BlockId,
	headOffset: number,
): Transaction {
	return state
		.transaction('input')
		.setSelection(
			createSelection(
				{ blockId: anchorBlockId, offset: anchorOffset },
				{ blockId: headBlockId, offset: headOffset },
			),
		)
		.setStoredMarks(null, state.storedMarks)
		.build();
}
