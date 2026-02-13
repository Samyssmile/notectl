/**
 * Selection model for the Notectl editor.
 * A selection is defined by an anchor and head position within the document.
 */

import type { BlockId } from './TypeBrands.js';

export interface Position {
	readonly blockId: BlockId;
	readonly offset: number;
	/** Path from root block to leaf block (optional, for nested structures). */
	readonly path?: readonly BlockId[];
}

export interface Selection {
	readonly anchor: Position;
	readonly head: Position;
}

export interface SelectionRange {
	readonly from: Position;
	readonly to: Position;
}

/** A selection that selects an entire node (e.g. void blocks, table selection). */
export interface NodeSelection {
	readonly type: 'node';
	readonly nodeId: BlockId;
	readonly path: readonly BlockId[];
}

/** Union type representing either a text selection or a node selection. */
export type EditorSelection = Selection | NodeSelection;

/** Creates a NodeSelection for the given block. */
export function createNodeSelection(nodeId: BlockId, path: readonly BlockId[]): NodeSelection {
	return { type: 'node', nodeId, path };
}

/** Type guard: returns true if the selection is a NodeSelection. */
export function isNodeSelection(sel: EditorSelection): sel is NodeSelection {
	return 'type' in sel && sel.type === 'node';
}

/** Type guard: returns true if the selection is a text Selection. */
export function isTextSelection(sel: EditorSelection): sel is Selection {
	return !isNodeSelection(sel);
}

/** Compares two EditorSelections for equality. */
export function selectionsEqual(a: EditorSelection, b: EditorSelection): boolean {
	if (isNodeSelection(a) && isNodeSelection(b)) {
		return a.nodeId === b.nodeId;
	}
	if (isTextSelection(a) && isTextSelection(b)) {
		return (
			a.anchor.blockId === b.anchor.blockId &&
			a.anchor.offset === b.anchor.offset &&
			a.head.blockId === b.head.blockId &&
			a.head.offset === b.head.offset
		);
	}
	return false;
}

/** Creates a Position, optionally with a path. */
export function createPosition(
	blockId: BlockId,
	offset: number,
	path?: readonly BlockId[],
): Position {
	return path ? { blockId, offset, path } : { blockId, offset };
}

/** Creates a selection with distinct anchor and head. */
export function createSelection(anchor: Position, head: Position): Selection {
	return { anchor, head };
}

/** Creates a collapsed selection (cursor) at the given position. */
export function createCollapsedSelection(blockId: BlockId, offset: number): Selection {
	const pos: Position = { blockId, offset };
	return { anchor: pos, head: pos };
}

/** Returns true if the selection is collapsed (cursor with no range). NodeSelection is never collapsed. */
export function isCollapsed(sel: EditorSelection): boolean {
	if (isNodeSelection(sel)) return false;
	return sel.anchor.blockId === sel.head.blockId && sel.anchor.offset === sel.head.offset;
}

/**
 * Returns true if the selection direction is forward (anchor before head).
 * When anchor and head are in the same block, compares offsets.
 * Cross-block ordering uses document order (not determinable here — caller provides block order).
 * For NodeSelection, always returns true.
 */
export function isForward(sel: EditorSelection, blockOrder?: readonly BlockId[]): boolean {
	if (isNodeSelection(sel)) return true;
	if (sel.anchor.blockId === sel.head.blockId) {
		return sel.anchor.offset <= sel.head.offset;
	}
	if (blockOrder) {
		const anchorIdx = blockOrder.indexOf(sel.anchor.blockId);
		const headIdx = blockOrder.indexOf(sel.head.blockId);
		return anchorIdx <= headIdx;
	}
	return true;
}

/**
 * Returns a normalized range where `from` is always before `to`.
 * Throws for NodeSelection — use isNodeSelection() guard first.
 */
export function selectionRange(sel: Selection, blockOrder?: readonly BlockId[]): SelectionRange {
	if (isForward(sel, blockOrder)) {
		return { from: sel.anchor, to: sel.head };
	}
	return { from: sel.head, to: sel.anchor };
}
