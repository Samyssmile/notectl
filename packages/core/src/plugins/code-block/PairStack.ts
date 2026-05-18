/**
 * Auto-pair tracking stack: records the position of each auto-inserted
 * close character so that overtype (Bracket-Skip) and pair-delete only
 * fire on chars *we* produced — never on chars the user typed themselves.
 *
 * Positions are migrated through `Transaction.mapping` after every state
 * change. The single non-trivial choice is the association bias for
 * `mapResult`: we use `+1` ("sticky right") so an insert *at* the close
 * char's position lands left of the close char, matching the user
 * intuition "I'm typing before this auto-paired `)`".
 */

import type { Position } from '../../model/Selection.js';
import { createPosition } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { Mapping } from '../../state/Mapping.js';

export interface PairEntry {
	readonly pos: Position;
	readonly char: string;
}

/** Per-block stack of auto-pair entries. */
export class PairStack {
	private readonly buckets = new Map<BlockId, PairEntry[]>();

	/** Records a new auto-inserted close char at `pos`. */
	push(pos: Position, char: string): void {
		const bucket: PairEntry[] = this.buckets.get(pos.blockId) ?? [];
		bucket.push({ pos, char });
		this.buckets.set(pos.blockId, bucket);
	}

	/**
	 * Finds (and removes) an entry whose position matches `blockId`/`offset`
	 * exactly. Returns the entry or `undefined` if no match.
	 */
	take(blockId: BlockId, offset: number): PairEntry | undefined {
		const bucket: PairEntry[] | undefined = this.buckets.get(blockId);
		if (!bucket) return undefined;
		for (let i = bucket.length - 1; i >= 0; i--) {
			const entry: PairEntry | undefined = bucket[i];
			if (entry && entry.pos.offset === offset) {
				bucket.splice(i, 1);
				if (bucket.length === 0) this.buckets.delete(blockId);
				return entry;
			}
		}
		return undefined;
	}

	/** Returns (without removing) an entry whose position matches. */
	peek(blockId: BlockId, offset: number): PairEntry | undefined {
		const bucket: PairEntry[] | undefined = this.buckets.get(blockId);
		if (!bucket) return undefined;
		for (let i = bucket.length - 1; i >= 0; i--) {
			const entry: PairEntry | undefined = bucket[i];
			if (entry && entry.pos.offset === offset) return entry;
		}
		return undefined;
	}

	/** Clears all entries for the given block (used on code_block → paragraph). */
	clearBlock(blockId: BlockId): void {
		this.buckets.delete(blockId);
	}

	/** Drops every recorded entry — used on plugin destroy/HMR. */
	clear(): void {
		this.buckets.clear();
	}

	/** Number of recorded entries for a block; primarily for diagnostics/tests. */
	sizeForBlock(blockId: BlockId): number {
		return this.buckets.get(blockId)?.length ?? 0;
	}

	/** Aggregate size across all blocks. */
	get size(): number {
		let total = 0;
		for (const bucket of this.buckets.values()) total += bucket.length;
		return total;
	}

	/**
	 * Migrates every recorded position through `mapping`. Entries that fall
	 * inside removed content (or whose host block has vanished) are dropped.
	 * Entries that change block (e.g. via split) get re-bucketed.
	 */
	migrate(mapping: Mapping): void {
		if (mapping.isEmpty) return;
		const next = new Map<BlockId, PairEntry[]>();
		for (const bucket of this.buckets.values()) {
			for (const entry of bucket) {
				const result = mapping.mapResult(entry.pos, +1);
				if (result.deleted) continue;
				const migrated: PairEntry = { pos: result.pos, char: entry.char };
				const bid: BlockId = result.pos.blockId;
				const target: PairEntry[] = next.get(bid) ?? [];
				target.push(migrated);
				next.set(bid, target);
			}
		}
		this.buckets.clear();
		for (const [bid, entries] of next) this.buckets.set(bid, entries);
	}

	/** Builds a position with the same shape as auto-pair entries. */
	static makePos(blockId: BlockId, offset: number): Position {
		return createPosition(blockId, offset);
	}
}
