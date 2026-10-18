/**
 * Selection replacement for paste paths: deletes a range selection and resolves
 * where the replacing content goes in the document that results from the
 * deletion. Every paste strategy must resolve positions through this module,
 * never against the state before the deletion, and decide by the receiving
 * block, never by the selection anchor (#267).
 */

import type { BlockNode } from '../model/Document.js';
import type { EditorSelection } from '../model/Selection.js';
import { isCollapsed, isTextSelection } from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { TransactionBuilder } from '../state/Transaction.js';
import { resolveAnchorBlockId } from './BlockInsertion.js';
import type { InsertPoint } from './CommandHelpers.js';
import { resolveInsertPoint } from './CommandHelpers.js';
import { addDeleteSelectionSteps } from './Commands.js';

/**
 * How replacing content relates to {@link ReplacementTarget.blockId}: `inside` goes
 * into the block at the target offset, `beside` goes next to a selected or
 * gap-adjacent block, which itself receives nothing.
 */
export type ReplacementPlacement = 'inside' | 'beside';

/** Where replacing content goes once the current selection has been deleted. */
export interface ReplacementTarget {
	/** The document after the deletion. Resolve parents, siblings and indices here. */
	readonly state: EditorState;
	/** Receiving block (caret, range start or landing block), or the selected/adjacent block. */
	readonly blockId: BlockId;
	/** Text offset within {@link blockId}; 0 when the content goes beside it. */
	readonly offset: number;
	readonly placement: ReplacementPlacement;
}

/**
 * Deletes the selection through `builder` and resolves the replacement target.
 *
 * A text range is deleted and the target is its start in document order, so the
 * result does not depend on the selection direction: the anchor of a backward
 * range may be merged away by the deletion. When the deletion removes the start
 * block, the landing block it creates is the target. A collapsed caret, a node
 * selection and a gap cursor delete nothing and resolve against `state` itself;
 * the latter two place content beside their block.
 *
 * `builder` must be a fresh builder created from `state`, because the returned
 * state reflects every step it has recorded.
 */
export function resolveReplacementTarget(
	state: EditorState,
	builder: TransactionBuilder,
): ReplacementTarget {
	const selection: EditorSelection = state.selection;
	if (!isTextSelection(selection)) {
		return { state, blockId: resolveAnchorBlockId(selection), offset: 0, placement: 'beside' };
	}
	if (isCollapsed(selection)) {
		const { blockId, offset } = selection.anchor;
		return { state, blockId, offset, placement: 'inside' };
	}

	const landingId: BlockId | undefined = addDeleteSelectionSteps(state, builder);
	const start: InsertPoint = resolveInsertPoint(selection, state.getBlockOrder());
	return {
		state: state.apply(builder.build()),
		blockId: landingId ?? start.blockId,
		offset: landingId ? 0 : start.offset,
		placement: 'inside',
	};
}

/**
 * The block that receives the replacing content, looked up after the deletion, or
 * `undefined` when the content goes beside the target block. Decisions about how
 * to paste belong to this block, never to the selection anchor: the anchor of a
 * backward range sits in a different block or is merged away entirely.
 */
export function getReceivingBlock(target: ReplacementTarget): BlockNode | undefined {
	if (target.placement === 'beside') return undefined;
	return target.state.getBlock(target.blockId);
}
