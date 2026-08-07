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

/** A virtual cursor at the boundary of a void block where no native caret can exist. */
export interface GapCursorSelection {
	readonly type: 'gap';
	readonly side: 'before' | 'after';
	readonly blockId: BlockId;
	readonly path: readonly BlockId[];
}

/** Union type representing a text selection, node selection, or gap cursor. */
export type EditorSelection = Selection | NodeSelection | GapCursorSelection;

/** Creates a NodeSelection for the given block. */
export function createNodeSelection(nodeId: BlockId, path: readonly BlockId[]): NodeSelection {
	return { type: 'node', nodeId, path: [...path] };
}

/** Creates a GapCursorSelection at the boundary of a void block. */
export function createGapCursor(
	blockId: BlockId,
	side: 'before' | 'after',
	path: readonly BlockId[],
): GapCursorSelection {
	return { type: 'gap', side, blockId, path: [...path] };
}

/** Type guard: returns true if the selection is a NodeSelection. */
export function isNodeSelection(sel: EditorSelection): sel is NodeSelection {
	return 'type' in sel && sel.type === 'node';
}

/** Type guard: returns true if the selection is a GapCursorSelection. */
export function isGapCursor(sel: EditorSelection): sel is GapCursorSelection {
	return 'type' in sel && sel.type === 'gap';
}

/** Type guard: returns true if the selection is a text Selection. */
export function isTextSelection(sel: EditorSelection): sel is Selection {
	return !('type' in sel);
}

/** Compares two EditorSelections for equality. */
export function selectionsEqual(a: EditorSelection, b: EditorSelection): boolean {
	if (isNodeSelection(a) && isNodeSelection(b)) {
		return a.nodeId === b.nodeId;
	}
	if (isGapCursor(a) && isGapCursor(b)) {
		return a.blockId === b.blockId && a.side === b.side;
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
	return path ? { blockId, offset, path: [...path] } : { blockId, offset };
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

/** Creates a fully detached copy of any editor selection. */
export function cloneEditorSelection(selection: EditorSelection): EditorSelection {
	if (isNodeSelection(selection)) {
		return { ...selection, path: [...selection.path] };
	}
	if (isGapCursor(selection)) {
		return { ...selection, path: [...selection.path] };
	}
	const anchor: Position = clonePosition(selection.anchor);
	const head: Position =
		selection.head === selection.anchor ? anchor : clonePosition(selection.head);
	return createSelection(anchor, head);
}

/** Freezes a selection and its position/path objects in place. */
export function freezeEditorSelection(selection: EditorSelection): EditorSelection {
	if (isNodeSelection(selection) || isGapCursor(selection)) {
		if (!Object.isFrozen(selection.path)) Object.freeze(selection.path);
		return Object.isFrozen(selection) ? selection : Object.freeze(selection);
	}
	if (selection.anchor.path && !Object.isFrozen(selection.anchor.path)) {
		Object.freeze(selection.anchor.path);
	}
	if (selection.head.path && !Object.isFrozen(selection.head.path)) {
		Object.freeze(selection.head.path);
	}
	if (!Object.isFrozen(selection.anchor)) Object.freeze(selection.anchor);
	if (!Object.isFrozen(selection.head)) Object.freeze(selection.head);
	return Object.isFrozen(selection) ? selection : Object.freeze(selection);
}

function clonePosition(position: Position): Position {
	return createPosition(
		position.blockId,
		position.offset,
		position.path ? [...position.path] : undefined,
	);
}

/** Returns true if the selection is collapsed (cursor with no range). NodeSelection and GapCursor are never collapsed. */
export function isCollapsed(sel: EditorSelection): boolean {
	if (!isTextSelection(sel)) return false;
	return sel.anchor.blockId === sel.head.blockId && sel.anchor.offset === sel.head.offset;
}

/**
 * Returns true if the selection direction is forward (anchor before head).
 * When anchor and head are in the same block, compares offsets.
 * Cross-block ordering uses document order (not determinable here — caller provides block order).
 * For NodeSelection, always returns true.
 */
export function isForward(sel: EditorSelection, blockOrder?: readonly BlockId[]): boolean {
	if (!isTextSelection(sel)) return true;
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
