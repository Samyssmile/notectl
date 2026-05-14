/**
 * Maps an {@link EditorSelection} through a {@link Mapping}.
 *
 * Used for keeping selection state semantically valid across transactions
 * that affected the document — e.g. restoring the pre-edit cursor on undo
 * when out-of-band transactions interleaved with the user's own edits, or
 * preserving a remote user's caret when a local edit shifts the position
 * space.
 *
 * Semantics:
 *
 * - {@link Selection} (anchor + head): anchor is mapped with `assoc = -1`
 *   (sticky left, the natural choice for the "start" side), head with
 *   `assoc = +1` (sticky right, "end" side). When the caller knows the
 *   selection's direction (e.g. via {@link selectionRange}), they can
 *   override via {@link mapTextSelection}.
 * - {@link NodeSelection}: the selection is kept if and only if the
 *   selected node still exists after the mapping. If the block was removed,
 *   `null` is returned and the caller must decide on a fallback (e.g.
 *   first leaf block, as {@link EditorState.validateSelection} does).
 * - {@link GapCursorSelection}: identical handling to NodeSelection — the
 *   referenced block must still exist.
 *
 * The returned value is a brand-new selection only when the mapping
 * changed something; reference equality is preserved for no-op cases so
 * downstream change-detection can short-circuit cheaply.
 */

import type {
	EditorSelection,
	GapCursorSelection,
	NodeSelection,
	Position,
	Selection,
} from '../model/Selection.js';
import {
	createCollapsedSelection,
	createGapCursor,
	createNodeSelection,
	createSelection,
	isCollapsed,
	isGapCursor,
	isNodeSelection,
} from '../model/Selection.js';
import type { Mapping } from './Mapping.js';

/**
 * Maps a generic {@link EditorSelection} through a {@link Mapping}.
 *
 * @returns the mapped selection, or `null` if the selection became
 *          structurally invalid (node-selection's node disappeared, or
 *          gap-cursor's host block disappeared) and the caller must fall
 *          back. For ordinary text selections this never returns `null` —
 *          positions clamp to the start of removed content as part of
 *          {@link Mapping.map}.
 */
export function mapSelection(sel: EditorSelection, mapping: Mapping): EditorSelection | null {
	if (mapping.isEmpty) return sel;
	if (isNodeSelection(sel)) return mapNodeSelection(sel, mapping);
	if (isGapCursor(sel)) return mapGapCursor(sel, mapping);
	return mapTextSelection(sel, mapping);
}

/**
 * Maps a text selection. For non-collapsed selections, anchor uses
 * `assoc=-1` (sticky-left, inclusive-start) and head uses `assoc=+1`
 * (sticky-right, exclusive-end). For *collapsed* selections (a cursor),
 * both endpoints use the same `assoc=-1` so the cursor stays collapsed
 * rather than being torn across a split boundary into two different
 * blocks.
 *
 * Reference equality is preserved when neither endpoint moved.
 */
export function mapTextSelection(sel: Selection, mapping: Mapping): Selection {
	if (isCollapsed(sel)) {
		const pos: Position = mapping.map(sel.anchor, -1);
		if (pos === sel.anchor) return sel;
		return createCollapsedSelection(pos.blockId, pos.offset);
	}
	const anchor: Position = mapping.map(sel.anchor, -1);
	const head: Position = mapping.map(sel.head, 1);
	if (anchor === sel.anchor && head === sel.head) return sel;
	return createSelection(anchor, head);
}

function mapNodeSelection(sel: NodeSelection, mapping: Mapping): NodeSelection | null {
	// A NodeSelection survives only if the targeted node is still reachable.
	// The mapping flags positions in removed blocks as `deleted`; we probe
	// at offset 0 of the node since NodeSelection has no offset semantics.
	const probe: Position = { blockId: sel.nodeId, offset: 0 };
	const result = mapping.mapResult(probe, -1);
	if (result.deleted) return null;
	// If the block was merged into another, the probe migrates to the
	// target block; the selected node ID is no longer addressable as a
	// stand-alone block, so we drop it.
	if (result.pos.blockId !== sel.nodeId) return null;
	return createNodeSelection(sel.nodeId, sel.path);
}

function mapGapCursor(sel: GapCursorSelection, mapping: Mapping): GapCursorSelection | null {
	const probe: Position = { blockId: sel.blockId, offset: 0 };
	const result = mapping.mapResult(probe, -1);
	if (result.deleted) return null;
	if (result.pos.blockId !== sel.blockId) return null;
	return createGapCursor(sel.blockId, sel.side, sel.path);
}
