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
 * Every {@link Step} produces exactly one of five categories:
 *
 * 1. `identity` — no position shift (mark, attribute, schema, block-type,
 *    block-insertion).
 * 2. `shift` — within a single block, the range `[from, to)` is replaced
 *    with content of length `newLen`. Covers `insertText`, `deleteText`,
 *    `insertInlineNode`, `removeInlineNode` as a single primitive.
 * 3. `split` — a block is split at an offset; positions past the split
 *    migrate to the new block with rebased offsets.
 * 4. `merge` — a source block is appended to a target block; positions in
 *    the source block migrate to the target block with offsets shifted by
 *    the target's previous length.
 * 5. `blockRemoval` — one or more blocks vanish; positions inside any
 *    removed block are marked deleted.
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
 * One or more blocks are removed from the document. Positions whose
 * `blockId` is in `removedBlockIds` are marked deleted. When a parent block
 * is removed, the set includes the parent **and all descendant block IDs**.
 */
export interface BlockRemovalMap {
	readonly type: 'blockRemoval';
	readonly removedBlockIds: ReadonlySet<BlockId>;
}

/** Discriminated union of all StepMap variants. */
export type StepMap = IdentityMap | ShiftMap | SplitMap | MergeMap | BlockRemovalMap;

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
	 * Like {@link map}, but returns whether the position landed in deleted
	 * content at any step. Once a position is marked deleted, the flag is
	 * sticky — subsequent steps do not "un-delete" it.
	 */
	mapResult(pos: Position, assoc: Assoc = -1): MapResult {
		let current: Position = pos;
		let deleted = false;
		for (const m of this.maps) {
			const result: MapResult = mapPositionThroughStep(current, m, assoc);
			current = result.pos;
			if (result.deleted) deleted = true;
		}
		return { pos: current, deleted };
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
 * `BlockRemovalMap`'s inverse is {@link IDENTITY_MAP}: re-inserting a
 * removed block subtree does not shift positions in *other* blocks, so the
 * inverse direction is invisible to position-mapping. Callers that need to
 * re-validate "did the block come back" must check the document instead.
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
			return IDENTITY_MAP;
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
			if (a.removedBlockIds.size !== br.removedBlockIds.size) return false;
			for (const id of a.removedBlockIds) {
				if (!br.removedBlockIds.has(id)) return false;
			}
			return true;
		}
	}
}
