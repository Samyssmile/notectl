/**
 * Generic wrap/lift commands for container blocks (issue #136).
 *
 * A container block (e.g. `blockquote`) holds other blocks as children, mirroring
 * HTML flow-content semantics. Wrapping moves the selected top-level blocks into a
 * new container; lifting dissolves a container and returns its children to the
 * parent. Block identity (IDs) is preserved across both operations so the active
 * selection survives the structural change.
 *
 * Scope: operations act on top-level containers. Nested containers (quote-in-quote,
 * quote-in-cell) are intentionally out of scope here and return `null`.
 */

import type { BlockNode } from '../model/Document.js';
import { createBlockNode, generateBlockId, getBlockChildren } from '../model/Document.js';
import { findAncestorOfType } from '../model/NodeResolver.js';
import type { Selection } from '../model/Selection.js';
import { selectionRange } from '../model/Selection.js';
import type { BlockId, NodeTypeName } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';

/** Returns the index in `doc.children` of the top-level ancestor of the given block. */
function topLevelIndexOf(state: EditorState, blockId: BlockId): number {
	const topId: BlockId | undefined = state.getNodePath(blockId)?.[0];
	if (!topId) return -1;
	return state.doc.children.findIndex((b) => b.id === topId);
}

/**
 * Wraps the top-level blocks spanned by `selection` into new container blocks of
 * `containerType`. Returns `null` when the range cannot be resolved.
 *
 * `isAllowedChild` guards the container's schema (`content.allow`): blocks the
 * container cannot legally hold (e.g. a `table` inside a `blockquote`) are left at
 * the top level instead of being nested into an invalid document. Disallowed blocks
 * therefore split the range into separate contiguous runs, each wrapped in its own
 * container, mirroring `wrapIn`. Defaults to wrapping everything when omitted.
 * Returns `null` when no block in the range is wrappable.
 */
export function wrapSelectionInContainer(
	state: EditorState,
	containerType: NodeTypeName,
	selection: Selection,
	isAllowedChild?: (block: BlockNode) => boolean,
): Transaction | null {
	const range = selectionRange(selection, state.getBlockOrder());
	const fromIdx: number = topLevelIndexOf(state, range.from.blockId);
	const toIdx: number = topLevelIndexOf(state, range.to.blockId);
	if (fromIdx < 0 || toIdx < 0) return null;

	const lo: number = Math.min(fromIdx, toIdx);
	const hi: number = Math.max(fromIdx, toIdx);

	const blocks: readonly BlockNode[] = state.doc.children.slice(lo, hi + 1);
	const allowed: (block: BlockNode) => boolean = isAllowedChild ?? (() => true);

	// Group the range into maximal runs of wrappable blocks; each run becomes one
	// container, disallowed blocks pass through unchanged and break the run.
	const sequence: BlockNode[] = [];
	let run: BlockNode[] = [];
	let wrappedAny = false;
	const flushRun = (): void => {
		if (run.length === 0) return;
		sequence.push(createBlockNode(containerType, run, generateBlockId()));
		wrappedAny = true;
		run = [];
	};
	for (const block of blocks) {
		if (allowed(block)) {
			run.push(block);
		} else {
			flushRun();
			sequence.push(block);
		}
	}
	flushRun();

	if (!wrappedAny) return null;

	const builder = state.transaction('command');
	for (let i: number = hi; i >= lo; i--) {
		builder.removeNode([], i);
	}
	sequence.forEach((node, i) => {
		builder.insertNode([], lo + i, node);
	});
	builder.setSelection(selection);
	return builder.build();
}

/**
 * Lifts the children of the nearest top-level `containerType` ancestor of the
 * selection anchor back out to the top level, dissolving the container. Returns
 * `null` when no such top-level container surrounds the selection.
 */
export function liftSelectionFromContainer(
	state: EditorState,
	containerType: NodeTypeName,
	selection: Selection,
): Transaction | null {
	const ancestor = findAncestorOfType(state.doc, selection.anchor.blockId, containerType);
	// Only top-level containers are dissolved (path === [containerId]).
	if (!ancestor || ancestor.path.length !== 1) return null;

	const containerIdx: number = state.doc.children.findIndex((b) => b.id === ancestor.node.id);
	if (containerIdx < 0) return null;

	const children: readonly BlockNode[] = getBlockChildren(ancestor.node);

	const builder = state.transaction('command');
	builder.removeNode([], containerIdx);
	children.forEach((child, i) => {
		builder.insertNode([], containerIdx + i, child);
	});
	builder.setSelection(selection);
	return builder.build();
}
