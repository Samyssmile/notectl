/**
 * Thin decoration-specific adapters over the generic {@link StepMap}
 * primitive. Position-shift arithmetic lives in `state/Mapping.ts`; this
 * module only contains the decoration-shape concerns:
 *
 * - splitting an {@link InlineDecoration} into two when a `splitBlock`
 *   crosses its range,
 * - dropping a {@link NodeDecoration} when its block disappears
 *   (`removeNode`) or is absorbed by a merge,
 * - applying widget `side` as the mapping `assoc`.
 *
 * The legacy entry point `mapDecorationThroughStep(deco, step)` is
 * preserved as a thin shim over `mapDecorationThroughStepMap` so existing
 * tests keep working; new consumers should reach for `Transaction.mapping`
 * directly via `DecorationSet.map(tr)`.
 */

import type { Document } from '../model/Document.js';
import { createPosition } from '../model/Selection.js';
import type { MergeMap, ShiftMap, SplitMap, StepMap } from '../state/Mapping.js';
import { mapPositionThroughStep } from '../state/Mapping.js';
import { getStepMap } from '../state/StepHandlers.js';
import type { Step } from '../state/Transaction.js';
import type {
	Decoration,
	InlineDecoration,
	NodeDecoration,
	WidgetDecoration,
} from './Decoration.js';

const EMPTY_DOC: Document = { children: [] };

/**
 * Maps a decoration through a single {@link StepMap}. Returns:
 * - the (possibly identical) decoration,
 * - an array of two decorations when a `splitBlock` cuts an inline range,
 * - or `null` when the decoration was deleted.
 */
export function mapDecorationThroughStepMap(
	deco: Decoration,
	stepMap: StepMap,
): Decoration | readonly Decoration[] | null {
	switch (deco.type) {
		case 'inline':
			return mapInline(deco, stepMap);
		case 'widget':
			return mapWidget(deco, stepMap);
		case 'node':
			return mapNode(deco, stepMap);
	}
}

/**
 * Legacy entry point — kept for backward compatibility with callers and
 * tests that hold a {@link Step} rather than a {@link StepMap}. Internally
 * converts step → StepMap (cheap, no doc state needed for any of the
 * shape categories used here) and delegates to
 * {@link mapDecorationThroughStepMap}.
 */
export function mapDecorationThroughStep(
	deco: Decoration,
	step: Step,
): Decoration | readonly Decoration[] | null {
	return mapDecorationThroughStepMap(deco, getStepMap(EMPTY_DOC, step));
}

// --- Inline ---

function mapInline(
	deco: InlineDecoration,
	stepMap: StepMap,
): InlineDecoration | readonly InlineDecoration[] | null {
	switch (stepMap.type) {
		case 'identity':
			return deco;
		case 'shift':
			return mapInlineShift(deco, stepMap);
		case 'split':
			return mapInlineSplit(deco, stepMap);
		case 'merge':
			return mapInlineMerge(deco, stepMap);
		case 'blockRemoval':
			return stepMap.removedBlockIds.has(deco.blockId) ? null : deco;
		case 'childIndexShift':
			// Sibling-index shifts don't move text positions.
			return deco;
	}
}

function mapInlineShift(deco: InlineDecoration, map: ShiftMap): InlineDecoration | null {
	if (deco.blockId !== map.blockId) return deco;

	const fromPos = mapPositionThroughStep(createPosition(deco.blockId, deco.from), map, -1).pos;
	const toPos = mapPositionThroughStep(createPosition(deco.blockId, deco.to), map, 1).pos;

	if (fromPos.offset >= toPos.offset) return null;
	if (fromPos.offset === deco.from && toPos.offset === deco.to) return deco;
	return { ...deco, from: fromPos.offset, to: toPos.offset };
}

function mapInlineSplit(
	deco: InlineDecoration,
	map: SplitMap,
): InlineDecoration | readonly InlineDecoration[] {
	if (deco.blockId !== map.blockId) return deco;

	if (deco.to <= map.offset) return deco;

	if (deco.from >= map.offset) {
		return {
			...deco,
			blockId: map.newBlockId,
			from: deco.from - map.offset,
			to: deco.to - map.offset,
		};
	}

	// Spans the split — return both halves
	const left: InlineDecoration = { ...deco, to: map.offset };
	const right: InlineDecoration = {
		...deco,
		blockId: map.newBlockId,
		from: 0,
		to: deco.to - map.offset,
	};
	return [left, right];
}

function mapInlineMerge(deco: InlineDecoration, map: MergeMap): InlineDecoration {
	if (deco.blockId !== map.sourceBlockId) return deco;
	return {
		...deco,
		blockId: map.targetBlockId,
		from: deco.from + map.targetLengthBefore,
		to: deco.to + map.targetLengthBefore,
	};
}

// --- Widget ---

function mapWidget(deco: WidgetDecoration, stepMap: StepMap): WidgetDecoration | null {
	switch (stepMap.type) {
		case 'identity':
			return deco;
		case 'shift':
			return mapWidgetShift(deco, stepMap);
		case 'split':
			return mapWidgetSplit(deco, stepMap);
		case 'merge':
			return mapWidgetMerge(deco, stepMap);
		case 'blockRemoval':
			return stepMap.removedBlockIds.has(deco.blockId) ? null : deco;
		case 'childIndexShift':
			return deco;
	}
}

function mapWidgetShift(deco: WidgetDecoration, map: ShiftMap): WidgetDecoration | null {
	if (deco.blockId !== map.blockId) return deco;

	const result = mapPositionThroughStep(createPosition(deco.blockId, deco.offset), map, deco.side);
	// A widget that lands strictly inside removed content is deleted.
	if (result.deleted) return null;
	if (result.pos.offset === deco.offset) return deco;
	return { ...deco, offset: result.pos.offset };
}

function mapWidgetSplit(deco: WidgetDecoration, map: SplitMap): WidgetDecoration {
	if (deco.blockId !== map.blockId) return deco;
	const result = mapPositionThroughStep(createPosition(deco.blockId, deco.offset), map, deco.side);
	if (result.pos.blockId === deco.blockId && result.pos.offset === deco.offset) return deco;
	return { ...deco, blockId: result.pos.blockId, offset: result.pos.offset };
}

function mapWidgetMerge(deco: WidgetDecoration, map: MergeMap): WidgetDecoration {
	if (deco.blockId !== map.sourceBlockId) return deco;
	return {
		...deco,
		blockId: map.targetBlockId,
		offset: deco.offset + map.targetLengthBefore,
	};
}

// --- Node ---

function mapNode(deco: NodeDecoration, stepMap: StepMap): NodeDecoration | null {
	switch (stepMap.type) {
		case 'identity':
		case 'shift':
		case 'split':
			// Node decorations are bound to a block; in-block content edits
			// and splits don't affect them. Splits keep the decoration on the
			// original block (the new block has no decoration of its own).
			return deco;
		case 'merge':
			// Source block disappears as a separate block → its decoration is dropped.
			return deco.blockId === stepMap.sourceBlockId ? null : deco;
		case 'blockRemoval':
			return stepMap.removedBlockIds.has(deco.blockId) ? null : deco;
		case 'childIndexShift':
			return deco;
	}
}
