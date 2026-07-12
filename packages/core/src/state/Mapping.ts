/**
 * Generic position-mapping primitive.
 *
 * Each {@link Step} produces a {@link StepMap} that describes how positions
 * in `{blockId, offset}` space shift when the step is applied. A
 * {@link Mapping} composes a sequence of `StepMap`s — typically all the maps
 * of a transaction — into a single mapper, so any consumer (decorations,
 * comments, selections, remote cursors, history) can fold a position
 * through an entire change set without re-implementing per-step math.
 *
 * The model mirrors ProseMirror's `StepMap` / `Mapping`, adapted to
 * notectl's `{blockId, offset}` position space (positions are scoped to
 * blocks, not a flat document offset).
 *
 * ## Association (bias) semantics
 *
 * The optional `assoc` argument decides which side of a boundary a position
 * sticks to:
 *
 * - `assoc = -1` ("sticky left"): the position stays at the boundary when
 *   content is inserted at, or split exactly at, the position. This is the
 *   semantics expected by an inclusive-start range marker (a decoration's
 *   `from`, the left edge of a selection).
 * - `assoc = +1` ("sticky right"): the position moves past inserted content
 *   and migrates to the new block when its host block is split exactly at
 *   the position. This is the semantics expected by an exclusive-end range
 *   marker (a decoration's `to`, the right edge of a selection).
 *
 * The default is `-1`, matching the most common case (cursor and from-side
 * mappers).
 *
 * ## StepMap categories
 *
 * Every {@link Step} produces exactly one of six categories:
 *
 * 1. `identity` — no position shift (mark, attribute, schema, block-type).
 * 2. `shift` — within a single block, the range `[from, to)` is replaced
 *    with content of length `newLen`. Covers `insertText`, `deleteText`,
 *    `insertInlineNode`, `removeInlineNode` as a single primitive.
 * 3. `split` — a block is split at an offset; positions past the split
 *    migrate to the new block with rebased offsets.
 * 4. `merge` — a source block is appended to a target block; positions in
 *    the source block migrate to the target block with offsets shifted by
 *    the target's previous length.
 * 5. `blockRemoval` — one block subtree vanishes; positions inside any
 *    removed block are marked deleted, and sibling child-indices in the
 *    same parent shift down by one past the removed index.
 * 6. `childIndexShift` — a new block was inserted at `fromIndex` in
 *    `parentPath`'s children; sibling child-indices `≥ fromIndex` shift up.
 *    Position space ({blockId, offset}) is unaffected.
 *
 * `blockRemoval` and `childIndexShift` are the two categories that carry
 * **structural** information about a parent's child list. They are
 * orthogonal to positions ({blockId, offset}) and are interpreted by
 * {@link mapChildIndex} when rebasing tree-structural steps
 * (`insertNode` / `removeNode`).
 */

import { isBlockNode } from '../model/Document.js';
import type { BlockNode } from '../model/Document.js';
import type { Position } from '../model/Selection.js';
import { createPosition } from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';

/**
 * Result of mapping an `(blockId, [from, to))` range through a {@link Mapping}.
 *
 * Both endpoints are guaranteed to live in the same block. Callers can rely
 * on `from <= to` (the helper returns `null` rather than producing an
 * inverted range).
 */
export interface MappedInBlockRange {
	readonly blockId: BlockId;
	readonly from: number;
	readonly to: number;
}

/** Position-mapping bias at a boundary. */
export type Assoc = -1 | 1;

// --- StepMap variants ---

/** No-op map: positions pass through unchanged. */
export interface IdentityMap {
	readonly type: 'identity';
}

/**
 * Within `blockId`, the offset range `[from, to)` is replaced with content
 * of length `newLen`. Covers all in-block content edits with a single
 * primitive:
 *
 * - `insertText(blockId, off, text)` → `{from: off, to: off, newLen: text.length}`.
 * - `deleteText(blockId, f, t)`      → `{from: f,   to: t,   newLen: 0}`.
 * - `insertInlineNode(blockId, off)` → `{from: off, to: off, newLen: 1}`.
 * - `removeInlineNode(blockId, off)` → `{from: off, to: off + 1, newLen: 0}`.
 */
export interface ShiftMap {
	readonly type: 'shift';
	readonly blockId: BlockId;
	readonly from: number;
	readonly to: number;
	readonly newLen: number;
}

/**
 * A block is split at `offset`. Content `[0, offset)` stays in `blockId`;
 * content `[offset, length)` migrates to `newBlockId` rebased to start at 0.
 */
export interface SplitMap {
	readonly type: 'split';
	readonly blockId: BlockId;
	readonly offset: number;
	readonly newBlockId: BlockId;
}

/**
 * `sourceBlockId` is appended to `targetBlockId`. Positions in the source
 * block migrate to the target block with offset shifted by
 * `targetLengthBefore` (the target's length before the merge).
 */
export interface MergeMap {
	readonly type: 'merge';
	readonly targetBlockId: BlockId;
	readonly sourceBlockId: BlockId;
	readonly targetLengthBefore: number;
}

/**
 * A block subtree is removed from the document. Positions whose `blockId`
 * is in `removedBlockIds` are marked deleted; `removedBlockIds` covers the
 * removed root **plus all descendant block IDs** (see
 * {@link collectRemovedBlockIds}).
 *
 * `parentPath` and `index` carry the removal's structural coordinates so
 * sibling child-indices in the same parent can be rebased: any
 * `(parentPath, i)` with `i === index` becomes invalid (the block is gone),
 * and `i > index` shifts down by one. See {@link mapChildIndex}.
 */
export interface BlockRemovalMap {
	readonly type: 'blockRemoval';
	readonly removedBlockIds: ReadonlySet<BlockId>;
	readonly parentPath: readonly BlockId[];
	readonly index: number;
}

/**
 * A new block was inserted at `fromIndex` in `parentPath`'s child list.
 * Sibling child-indices `≥ fromIndex` shift up by `delta` (always `+1`
 * since {@link InsertNodeStep} inserts a single block). Position space
 * (`{blockId, offset}`) is unaffected — the new block has no prior
 * positions, and positions inside other siblings keep their offsets.
 *
 * Consumed by {@link mapChildIndex}, {@link mapInsertionIndex}, and exact
 * structural inverse detection during history replay.
 */
export interface ChildIndexShiftMap {
	readonly type: 'childIndexShift';
	readonly parentPath: readonly BlockId[];
	readonly fromIndex: number;
	readonly delta: number;
	/**
	 * IDs introduced by an InsertNodeStep. Optional for synthetic/test maps;
	 * when present it makes the map an exact structural inverse of the matching
	 * BlockRemovalMap during history replay.
	 */
	readonly insertedBlockIds?: ReadonlySet<BlockId>;
}

/**
 * One existing subtree moves between child lists. Positions inside the moved
 * subtree keep their block IDs and offsets; sibling child indices in both
 * parents are shifted by the removal followed by the insertion.
 */
export interface MoveNodeMap {
	readonly type: 'moveNode';
	readonly movedNodeId: BlockId;
	readonly fromParentPath: readonly BlockId[];
	readonly fromIndex: number;
	readonly toParentPath: readonly BlockId[];
	/** Destination index after removing the source node. */
	readonly destinationIndex: number;
}

/** Discriminated union of all StepMap variants. */
export type StepMap =
	| IdentityMap
	| ShiftMap
	| SplitMap
	| MergeMap
	| BlockRemovalMap
	| ChildIndexShiftMap
	| MoveNodeMap;

// --- Map results ---

/** Result of mapping a single position. */
export interface MapResult {
	readonly pos: Position;
	/** True if the input position fell inside content removed by the map. */
	readonly deleted: boolean;
}

/** A range expressed in `Position` space. */
export interface PositionRange {
	readonly from: Position;
	readonly to: Position;
}

// --- Singletons / factories ---

/** The shared identity StepMap; reuse instead of allocating per step. */
export const IDENTITY_MAP: IdentityMap = { type: 'identity' };

/**
 * Walks a block subtree and returns the set of its own ID plus every
 * descendant block ID. Used to build {@link BlockRemovalMap.removedBlockIds}.
 */
export function collectRemovedBlockIds(node: BlockNode): Set<BlockId> {
	const ids = new Set<BlockId>();
	const walk = (n: BlockNode): void => {
		ids.add(n.id);
		for (const child of n.children) {
			if (isBlockNode(child)) walk(child);
		}
	};
	walk(node);
	return ids;
}

// --- Single-StepMap application ---

/**
 * Maps a single position through one {@link StepMap}.
 *
 * @param pos input position
 * @param map the StepMap describing the change
 * @param assoc which side of a boundary to stick to (default `-1`)
 * @returns mapped position plus a `deleted` flag indicating whether `pos`
 *          fell inside content that the step removed
 */
export function mapPositionThroughStep(pos: Position, map: StepMap, assoc: Assoc = -1): MapResult {
	switch (map.type) {
		case 'identity':
			return { pos, deleted: false };
		case 'shift':
			return mapPositionThroughShift(pos, map, assoc);
		case 'split':
			return mapPositionThroughSplit(pos, map, assoc);
		case 'merge':
			return mapPositionThroughMerge(pos, map);
		case 'blockRemoval':
			return mapPositionThroughBlockRemoval(pos, map);
		case 'childIndexShift':
			// Child-index shifts do not touch position space ({blockId, offset}):
			// a new sibling block has no prior positions to map, and existing
			// siblings keep their internal offsets even if their parent-relative
			// index changed. Consumed only by {@link mapChildIndex}.
			return { pos, deleted: false };
		case 'moveNode':
			// A move preserves block identity and in-block offsets. Structural
			// child-index consumers handle the parent-list shifts separately.
			return { pos, deleted: false };
	}
}

function mapPositionThroughShift(pos: Position, map: ShiftMap, assoc: Assoc): MapResult {
	if (pos.blockId !== map.blockId) return { pos, deleted: false };

	const delta: number = map.newLen - (map.to - map.from);
	const off: number = pos.offset;

	// Strictly before the affected range
	if (off < map.from) return { pos, deleted: false };

	// At the start boundary
	if (off === map.from) {
		// Pure insertion (from === to): assoc decides whether we stick before
		// or after the inserted run.
		if (map.from === map.to) {
			const newOff: number = assoc === 1 ? map.from + map.newLen : map.from;
			return newOff === off
				? { pos, deleted: false }
				: { pos: shiftedPos(pos, newOff), deleted: false };
		}
		// Deletion starts at this point — position stays at `from` regardless
		// of assoc; nothing was inserted to skip past.
		return { pos, deleted: false };
	}

	// Strictly inside [from, to): position fell into removed content
	if (off < map.to) {
		const newOff: number = assoc === 1 ? map.from + map.newLen : map.from;
		return { pos: shiftedPos(pos, newOff), deleted: true };
	}

	// At or past the end boundary: shift by delta
	const newOff: number = off + delta;
	return newOff === off
		? { pos, deleted: false }
		: { pos: shiftedPos(pos, newOff), deleted: false };
}

function mapPositionThroughSplit(pos: Position, map: SplitMap, assoc: Assoc): MapResult {
	if (pos.blockId !== map.blockId) return { pos, deleted: false };

	if (pos.offset < map.offset) return { pos, deleted: false };

	if (pos.offset > map.offset) {
		return {
			pos: createPosition(map.newBlockId, pos.offset - map.offset),
			deleted: false,
		};
	}

	// At the split boundary: assoc decides which side keeps the cursor.
	if (assoc === 1) {
		return { pos: createPosition(map.newBlockId, 0), deleted: false };
	}
	return { pos, deleted: false };
}

function mapPositionThroughMerge(pos: Position, map: MergeMap): MapResult {
	if (pos.blockId !== map.sourceBlockId) return { pos, deleted: false };
	return {
		pos: createPosition(map.targetBlockId, pos.offset + map.targetLengthBefore),
		deleted: false,
	};
}

function mapPositionThroughBlockRemoval(pos: Position, map: BlockRemovalMap): MapResult {
	if (map.removedBlockIds.has(pos.blockId)) {
		return { pos, deleted: true };
	}
	return { pos, deleted: false };
}

/** Allocates a new Position with the given offset, preserving an optional `path`. */
function shiftedPos(original: Position, newOffset: number): Position {
	return createPosition(original.blockId, newOffset, original.path);
}

// --- Mapping ---

/**
 * Composes a sequence of {@link StepMap}s into a single mapper. A `Mapping`
 * is immutable; `appendMap` returns a new instance.
 *
 * Construction always normalizes by dropping identity maps — they're a
 * common case and would otherwise inflate every transaction's mapping
 * pipeline with no-ops.
 */
export class Mapping {
	/** Shared empty Mapping. */
	static readonly empty: Mapping = new Mapping([]);

	readonly maps: readonly StepMap[];

	private constructor(maps: readonly StepMap[]) {
		this.maps = maps;
	}

	/** Creates a Mapping from a list of StepMaps, dropping identity maps. */
	static from(maps: readonly StepMap[]): Mapping {
		const filtered: StepMap[] = [];
		for (const m of maps) {
			if (m.type !== 'identity') filtered.push(m);
		}
		if (filtered.length === 0) return Mapping.empty;
		return new Mapping(filtered);
	}

	/** Returns a new Mapping with `map` appended. */
	appendMap(map: StepMap): Mapping {
		if (map.type === 'identity') return this;
		return new Mapping([...this.maps, map]);
	}

	/** Concatenates two mappings into a new one. */
	appendMapping(other: Mapping): Mapping {
		if (other.maps.length === 0) return this;
		if (this.maps.length === 0) return other;
		return new Mapping([...this.maps, ...other.maps]);
	}

	/** True if the mapping contains no position-changing maps. */
	get isEmpty(): boolean {
		return this.maps.length === 0;
	}

	/**
	 * Folds a position through every contained StepMap in order.
	 * Returns the mapped position; the `deleted` flag is **not** preserved
	 * (use {@link mapResult} when you need it).
	 */
	map(pos: Position, assoc: Assoc = -1): Position {
		return this.mapResult(pos, assoc).pos;
	}

	/**
	 * Like {@link map}, but returns whether the position is deleted in the final
	 * frame. Content deletion remains sticky across every later map. Structural
	 * deletion can be recovered by an `insertNode` map carrying the same block
	 * ID; a later removal can mark that identity deleted again.
	 */
	mapResult(pos: Position, assoc: Assoc = -1): MapResult {
		let current: Position = pos;
		let contentDeleted = false;
		let structurallyDeleted = false;
		for (const m of this.maps) {
			const result: MapResult = mapPositionThroughStep(current, m, assoc);
			current = result.pos;
			if (result.deleted) {
				if (m.type === 'blockRemoval') {
					structurallyDeleted = true;
				} else {
					contentDeleted = true;
				}
			} else if (m.type === 'childIndexShift' && m.insertedBlockIds?.has(current.blockId)) {
				structurallyDeleted = false;
			}
		}
		return { pos: current, deleted: contentDeleted || structurallyDeleted };
	}

	/**
	 * Maps a range. By convention, `from` is mapped with `assoc = -1`
	 * (inclusive-start) and `to` with `assoc = +1` (exclusive-end). The
	 * caller may override either bias.
	 *
	 * Returns `null` when both endpoints land in deleted content **and** the
	 * mapped range would collapse to length zero or negative — i.e. the
	 * range no longer covers any live content.
	 *
	 * The returned `from`/`to` may live in different blocks (e.g. after a
	 * `split` map). Callers that require an in-block range (decorations,
	 * inline selections) must detect and split accordingly.
	 */
	mapRange(range: PositionRange, assocFrom: Assoc = -1, assocTo: Assoc = 1): PositionRange | null {
		const from: MapResult = this.mapResult(range.from, assocFrom);
		const to: MapResult = this.mapResult(range.to, assocTo);

		if (from.deleted && to.deleted) {
			if (from.pos.blockId === to.pos.blockId && from.pos.offset >= to.pos.offset) {
				return null;
			}
		}
		return { from: from.pos, to: to.pos };
	}
}

// --- In-block range helpers (used by per-step Step→Step mapping) ---

/**
 * Maps an `(blockId, [from, to))` range through `mapping`, asserting the
 * result lives in a single block.
 *
 * Returns `null` when the range no longer addresses live content in a single
 * block:
 *
 * - the host block was removed;
 * - the range was fully deleted (both endpoints flagged deleted and collapse);
 * - the endpoints migrated to different blocks (range fragmented, e.g. a
 *   `split` map placed `from` and `to` on opposite sides of the cut).
 *
 * Default biases are **conservative for step rebasing**: `assocFrom = +1`,
 * `assocTo = -1`. An intervening insertion at either boundary therefore
 * does NOT expand the rebased range to cover the new content — the user's
 * original edit only addressed the original content, and the agent's
 * intervening insertion should be preserved across an undo/redo. This is
 * the opposite of {@link Mapping.mapRange}'s default biases, which model
 * selections (inclusive-start, exclusive-end) where boundary insertions
 * naturally extend the selection.
 */
export function mapInBlockRange(
	blockId: BlockId,
	from: number,
	to: number,
	mapping: Mapping,
	assocFrom: Assoc = 1,
	assocTo: Assoc = -1,
): MappedInBlockRange | null {
	if (mapping.isEmpty) return { blockId, from, to };

	const fromPos: Position = createPosition(blockId, from);
	const toPos: Position = createPosition(blockId, to);
	const fromResult: MapResult = mapping.mapResult(fromPos, assocFrom);
	const toResult: MapResult = mapping.mapResult(toPos, assocTo);

	// If both endpoints fell inside removed/replaced content, the range no
	// longer addresses live document territory — abandon. A partial overlap
	// (one endpoint deleted, the other shifted) still survives clamped.
	if (fromResult.deleted && toResult.deleted) return null;

	// Range must remain within a single block. A split could have moved one
	// endpoint to the new block; that's a fragmentation we cannot represent
	// as a single in-block step.
	if (fromResult.pos.blockId !== toResult.pos.blockId) return null;

	// Defensive: a range whose endpoints inverted (from > to) is invalid.
	// An empty range with from === to is still valid (e.g. a pure-insertion
	// `shift` whose offset survived).
	if (fromResult.pos.offset > toResult.pos.offset) return null;

	return {
		blockId: fromResult.pos.blockId,
		from: fromResult.pos.offset,
		to: toResult.pos.offset,
	};
}

/**
 * Maps an `(blockId, offset)` point through `mapping`, returning the
 * equivalent in-block position or `null` when the host block was removed.
 *
 * Convenience wrapper around {@link mapInBlockRange} for steps that carry a
 * single offset (`insertText`, `insertInlineNode`, `splitBlock`).
 */
export function mapOffsetInBlock(
	blockId: BlockId,
	offset: number,
	mapping: Mapping,
	assoc: Assoc = -1,
): MappedInBlockRange | null {
	if (mapping.isEmpty) return { blockId, from: offset, to: offset };

	const pos: Position = createPosition(blockId, offset);
	const result: MapResult = mapping.mapResult(pos, assoc);
	if (result.deleted) return null;
	return { blockId: result.pos.blockId, from: result.pos.offset, to: result.pos.offset };
}

// --- Child-index mapping (used by structural step rebasing) ---

/**
 * Rebases a child-index `(parentPath, index)` through `mapping`. The
 * `index` is interpreted as the position of an **existing** child block:
 * if an intervening edit removed exactly that child, the result is
 * `null`. For an **insertion slot** (the target index of a future
 * `insertNode`), use {@link mapInsertionIndex} — slots stay valid even
 * when the block previously at that index is removed.
 *
 * Child-indices live in a coordinate space orthogonal to positions
 * (`{blockId, offset}`): they describe a slot in a parent's child list,
 * not a place inside text. Three {@link StepMap} categories carry
 * child-index-affecting information:
 *
 * - {@link ChildIndexShiftMap} (produced by `insertNode`): shifts
 *   sibling indices `≥ fromIndex` by `delta` (always `+1` today).
 * - {@link BlockRemovalMap} (produced by `removeNode`): removes the child
 *   at `index` (the input index becomes invalid → `null`), and shifts
 *   sibling indices `> index` down by `1`.
 * - {@link MoveNodeMap} (produced by `moveNode`): combines the source removal
 *   and destination insertion while preserving the moved subtree's identity.
 *
 * Maps whose `parentPath` differs from the input pass through; all
 * non-structural categories (`shift`, `split`, `merge`, `identity`) are
 * no-ops here.
 */
export function mapChildIndex(
	parentPath: readonly BlockId[],
	index: number,
	mapping: Mapping,
): number | null {
	return foldChildIndex(parentPath, index, mapping, 'existing');
}

/**
 * Rebases an **insertion slot** `(parentPath, index)` through `mapping`.
 * An insertion slot lives in `[0, children.length]` (inclusive of the
 * end) and represents "where to insert", not an existing block. Slots
 * remain valid across intervening edits — even when the block previously
 * at that index is removed — so this function never returns `null`.
 *
 * Difference from {@link mapChildIndex}: for a `BlockRemovalMap` with
 * matching parent and `index === map.index`, this function keeps the
 * slot (returning `map.index`, which is the same numeric position in the
 * post-removal frame); {@link mapChildIndex} would return `null`.
 * {@link ChildIndexShiftMap} handling is identical.
 */
export function mapInsertionIndex(
	parentPath: readonly BlockId[],
	index: number,
	mapping: Mapping,
): number {
	// `foldChildIndex` with `'insertion'` provably never returns `null` —
	// the only path that would (BlockRemovalMap, matching parent, matching
	// index) is short-circuited inside `mapChildIndexThroughStep`. The
	// overload signature carries that invariant into the type system.
	return foldChildIndex(parentPath, index, mapping, 'insertion');
}

type ChildIndexKind = 'existing' | 'insertion';

function foldChildIndex(
	parentPath: readonly BlockId[],
	index: number,
	mapping: Mapping,
	kind: 'existing',
): number | null;
function foldChildIndex(
	parentPath: readonly BlockId[],
	index: number,
	mapping: Mapping,
	kind: 'insertion',
): number;
function foldChildIndex(
	parentPath: readonly BlockId[],
	index: number,
	mapping: Mapping,
	kind: ChildIndexKind,
): number | null {
	if (mapping.isEmpty) return index;

	let current: number = index;
	for (const m of mapping.maps) {
		const next: number | null = mapChildIndexThroughStep(parentPath, current, m, kind);
		if (next === null) return null;
		current = next;
	}
	return current;
}

function mapChildIndexThroughStep(
	parentPath: readonly BlockId[],
	index: number,
	map: StepMap,
	kind: ChildIndexKind,
): number | null {
	switch (map.type) {
		case 'identity':
		case 'shift':
		case 'split':
		case 'merge':
			return index;
		case 'blockRemoval':
			if (!sameParentPath(parentPath, map.parentPath)) return index;
			if (index === map.index) {
				// Existing-child semantics: that child is gone → invalid.
				// Insertion-slot semantics: the slot survives; nothing was
				// inserted/removed *to the left* of `index`, so the slot
				// number is unchanged in the post-removal frame.
				return kind === 'existing' ? null : index;
			}
			if (index > map.index) return index - 1;
			return index;
		case 'childIndexShift':
			if (!sameParentPath(parentPath, map.parentPath)) return index;
			if (index >= map.fromIndex) return index + map.delta;
			return index;
		case 'moveNode':
			return mapChildIndexThroughMove(parentPath, index, map, kind);
	}
}

function mapChildIndexThroughMove(
	parentPath: readonly BlockId[],
	index: number,
	map: MoveNodeMap,
	kind: ChildIndexKind,
): number | null {
	const sameParent: boolean = sameParentPath(map.fromParentPath, map.toParentPath);
	if (sameParent && map.fromIndex === map.destinationIndex) return index;
	if (
		kind === 'existing' &&
		sameParent &&
		sameParentPath(parentPath, map.fromParentPath) &&
		index === map.fromIndex
	) {
		return map.destinationIndex;
	}

	let current: number = index;
	if (sameParentPath(parentPath, map.fromParentPath)) {
		if (current === map.fromIndex) {
			if (kind === 'existing') return null;
		} else if (current > map.fromIndex) {
			current--;
		}
	}

	if (sameParentPath(parentPath, map.toParentPath) && current >= map.destinationIndex) {
		current++;
	}
	return current;
}

function sameParentPath(a: readonly BlockId[], b: readonly BlockId[]): boolean {
	if (a === b) return true;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

// --- StepMap inversion (used by history's frame-walk cancellation) ---

/**
 * Returns the {@link StepMap} that undoes `map` in position space — i.e.
 * composing `map` with `invertStepMap(map)` is content-preserving (though
 * the composed position-mapping is *not* a true identity in our framework:
 * positions interior to a delete-then-reinsert round-trip clamp to the
 * deletion start during the deletion half and don't return on the insert
 * half).
 *
 * Used by history to detect mutually-inverse stepmaps in the rebase chain
 * and cancel them, sidestepping the round-trip clamping for cases where
 * the rebase is a no-op in content terms.
 *
 * Structural maps include enough metadata to recover their exact inverse
 * where possible. Synthetic ChildIndexShiftMaps without inserted subtree IDs
 * remain position-only and therefore invert to {@link IDENTITY_MAP}.
 */
export function invertStepMap(map: StepMap): StepMap {
	switch (map.type) {
		case 'identity':
			return IDENTITY_MAP;
		case 'shift':
			return {
				type: 'shift',
				blockId: map.blockId,
				from: map.from,
				to: map.from + map.newLen,
				newLen: map.to - map.from,
			};
		case 'split':
			return {
				type: 'merge',
				targetBlockId: map.blockId,
				sourceBlockId: map.newBlockId,
				targetLengthBefore: map.offset,
			};
		case 'merge':
			return {
				type: 'split',
				blockId: map.targetBlockId,
				offset: map.targetLengthBefore,
				newBlockId: map.sourceBlockId,
			};
		case 'blockRemoval':
			return {
				type: 'childIndexShift',
				parentPath: map.parentPath,
				fromIndex: map.index,
				delta: 1,
				insertedBlockIds: map.removedBlockIds,
			};
		case 'childIndexShift':
			if (map.delta === 1 && map.insertedBlockIds) {
				return {
					type: 'blockRemoval',
					removedBlockIds: map.insertedBlockIds,
					parentPath: map.parentPath,
					index: map.fromIndex,
				};
			}
			return IDENTITY_MAP;
		case 'moveNode':
			return {
				type: 'moveNode',
				movedNodeId: map.movedNodeId,
				fromParentPath: map.toParentPath,
				fromIndex: map.destinationIndex,
				toParentPath: map.fromParentPath,
				destinationIndex: map.fromIndex,
			};
	}
}

/**
 * Structural equality for {@link StepMap}s. Used by history to recognize
 * cancelling pairs in the rebase chain ({@link invertStepMap}(a) ≡ b).
 */
export function stepMapsEqual(a: StepMap, b: StepMap): boolean {
	if (a.type !== b.type) return false;
	switch (a.type) {
		case 'identity':
			return true;
		case 'shift': {
			const bs = b as ShiftMap;
			return (
				a.blockId === bs.blockId && a.from === bs.from && a.to === bs.to && a.newLen === bs.newLen
			);
		}
		case 'split': {
			const bs = b as SplitMap;
			return a.blockId === bs.blockId && a.offset === bs.offset && a.newBlockId === bs.newBlockId;
		}
		case 'merge': {
			const bm = b as MergeMap;
			return (
				a.targetBlockId === bm.targetBlockId &&
				a.sourceBlockId === bm.sourceBlockId &&
				a.targetLengthBefore === bm.targetLengthBefore
			);
		}
		case 'blockRemoval': {
			const br = b as BlockRemovalMap;
			if (a.index !== br.index) return false;
			if (!sameParentPath(a.parentPath, br.parentPath)) return false;
			if (a.removedBlockIds.size !== br.removedBlockIds.size) return false;
			for (const id of a.removedBlockIds) {
				if (!br.removedBlockIds.has(id)) return false;
			}
			return true;
		}
		case 'childIndexShift': {
			const cs = b as ChildIndexShiftMap;
			return (
				a.fromIndex === cs.fromIndex &&
				a.delta === cs.delta &&
				sameParentPath(a.parentPath, cs.parentPath) &&
				optionalIdSetsEqual(a.insertedBlockIds, cs.insertedBlockIds)
			);
		}
		case 'moveNode': {
			if (b.type !== 'moveNode') return false;
			return (
				a.movedNodeId === b.movedNodeId &&
				a.fromIndex === b.fromIndex &&
				a.destinationIndex === b.destinationIndex &&
				sameParentPath(a.fromParentPath, b.fromParentPath) &&
				sameParentPath(a.toParentPath, b.toParentPath)
			);
		}
	}
}

function optionalIdSetsEqual(
	a: ReadonlySet<BlockId> | undefined,
	b: ReadonlySet<BlockId> | undefined,
): boolean {
	if (a === b) return true;
	if (!a || !b || a.size !== b.size) return false;
	for (const id of a) {
		if (!b.has(id)) return false;
	}
	return true;
}
