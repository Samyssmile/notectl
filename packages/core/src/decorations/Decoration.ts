/**
 * Decoration types and DecorationSet for transient, view-only annotations.
 * Decorations are NOT part of the document model and do NOT affect undo/redo.
 */

import type { BlockId } from '../model/TypeBrands.js';
import type { Transaction } from '../state/Transaction.js';
import { mapDecorationThroughStep } from './PositionMapping.js';

// --- Decoration Attrs ---

export interface DecorationAttrs {
	readonly class?: string;
	readonly style?: string;
	readonly nodeName?: string;
	readonly [key: string]: string | undefined;
}

// --- Decoration Types ---

export interface InlineDecoration {
	readonly type: 'inline';
	readonly blockId: BlockId;
	readonly from: number;
	readonly to: number;
	readonly attrs: DecorationAttrs;
}

export interface NodeDecoration {
	readonly type: 'node';
	readonly blockId: BlockId;
	readonly attrs: DecorationAttrs;
}

export interface WidgetDecoration {
	readonly type: 'widget';
	readonly blockId: BlockId;
	readonly offset: number;
	readonly toDOM: () => HTMLElement;
	readonly side: -1 | 1;
	readonly key?: string;
}

export type Decoration = InlineDecoration | NodeDecoration | WidgetDecoration;

// --- Factory Functions ---

/** Creates an inline decoration for a text range within a block. */
export function inline(
	blockId: BlockId,
	from: number,
	to: number,
	attrs: DecorationAttrs,
): InlineDecoration {
	return { type: 'inline', blockId, from, to, attrs };
}

/** Creates a node decoration that applies to a whole block element. */
export function node(blockId: BlockId, attrs: DecorationAttrs): NodeDecoration {
	return { type: 'node', blockId, attrs };
}

/** Creates a widget decoration that inserts a DOM element at a position. */
export function widget(
	blockId: BlockId,
	offset: number,
	toDOM: () => HTMLElement,
	options?: { readonly side?: -1 | 1; readonly key?: string },
): WidgetDecoration {
	return {
		type: 'widget',
		blockId,
		offset,
		toDOM,
		side: options?.side ?? -1,
		key: options?.key,
	};
}

// --- DecorationSet ---

/**
 * Immutable set of decorations indexed by block ID.
 * Provides efficient lookup and merging of decoration collections.
 */
export class DecorationSet {
	static readonly empty: DecorationSet = new DecorationSet(new Map());

	private constructor(private readonly byBlock: ReadonlyMap<BlockId, readonly Decoration[]>) {}

	/** Creates a DecorationSet from a flat array of decorations. */
	static create(decorations: readonly Decoration[]): DecorationSet {
		if (decorations.length === 0) return DecorationSet.empty;

		const map = new Map<BlockId, Decoration[]>();
		for (const deco of decorations) {
			const existing = map.get(deco.blockId);
			if (existing) {
				existing.push(deco);
			} else {
				map.set(deco.blockId, [deco]);
			}
		}
		return new DecorationSet(map);
	}

	/** Returns all decorations for a given block. */
	find(blockId: BlockId): readonly Decoration[] {
		return this.byBlock.get(blockId) ?? [];
	}

	/** Returns only inline decorations for a given block. */
	findInline(blockId: BlockId): readonly InlineDecoration[] {
		const decos = this.byBlock.get(blockId);
		if (!decos) return [];
		return decos.filter((d): d is InlineDecoration => d.type === 'inline');
	}

	/** Returns only node decorations for a given block. */
	findNode(blockId: BlockId): readonly NodeDecoration[] {
		const decos = this.byBlock.get(blockId);
		if (!decos) return [];
		return decos.filter((d): d is NodeDecoration => d.type === 'node');
	}

	/** Returns only widget decorations for a given block. */
	findWidget(blockId: BlockId): readonly WidgetDecoration[] {
		const decos = this.byBlock.get(blockId);
		if (!decos) return [];
		return decos.filter((d): d is WidgetDecoration => d.type === 'widget');
	}

	/** Returns a new DecorationSet with the given decorations added. */
	add(decorations: readonly Decoration[]): DecorationSet {
		if (decorations.length === 0) return this;
		if (this.isEmpty) return DecorationSet.create(decorations);

		const map = new Map<BlockId, Decoration[]>();
		for (const [bid, decos] of this.byBlock) {
			map.set(bid, [...decos]);
		}
		for (const deco of decorations) {
			const existing = map.get(deco.blockId);
			if (existing) {
				existing.push(deco);
			} else {
				map.set(deco.blockId, [deco]);
			}
		}
		return new DecorationSet(map);
	}

	/** Returns a new DecorationSet with decorations matching the predicate removed. */
	remove(predicate: (d: Decoration) => boolean): DecorationSet {
		const map = new Map<BlockId, Decoration[]>();
		let changed = false;

		for (const [bid, decos] of this.byBlock) {
			const filtered = decos.filter((d) => !predicate(d));
			if (filtered.length !== decos.length) changed = true;
			if (filtered.length > 0) {
				map.set(bid, filtered);
			}
		}

		if (!changed) return this;
		if (map.size === 0) return DecorationSet.empty;
		return new DecorationSet(map);
	}

	/** Returns a new DecorationSet merging this set with another. */
	merge(other: DecorationSet): DecorationSet {
		if (other.isEmpty) return this;
		if (this.isEmpty) return other;

		const map = new Map<BlockId, Decoration[]>();
		for (const [bid, decos] of this.byBlock) {
			map.set(bid, [...decos]);
		}
		for (const [bid, decos] of other.byBlock) {
			const existing = map.get(bid);
			if (existing) {
				existing.push(...decos);
			} else {
				map.set(bid, [...decos]);
			}
		}
		return new DecorationSet(map);
	}

	/** Checks equality — reference first, then structural comparison. */
	equals(other: DecorationSet): boolean {
		if (this === other) return true;
		if (this.byBlock.size !== other.byBlock.size) return false;

		for (const [bid, decos] of this.byBlock) {
			const otherDecos = other.byBlock.get(bid);
			if (!otherDecos) return false;
			if (!decorationArraysEqual(decos, otherDecos)) return false;
		}
		return true;
	}

	/** True if the set contains no decorations. */
	get isEmpty(): boolean {
		return this.byBlock.size === 0;
	}

	/**
	 * Maps decorations through document changes described by a transaction.
	 * Decorations that become invalid (e.g. fully deleted range) are removed.
	 * Decorations that span a split point are split into two.
	 */
	map(tr: Transaction): DecorationSet {
		if (this.isEmpty || tr.steps.length === 0) return this;

		let mapped: Decoration[] = [];
		for (const decos of this.byBlock.values()) {
			for (const d of decos) {
				mapped.push(d);
			}
		}

		for (const step of tr.steps) {
			const next: Decoration[] = [];
			for (const deco of mapped) {
				const result = mapDecorationThroughStep(deco, step);
				if (result === null) continue;
				if (Array.isArray(result)) {
					for (const r of result) {
						next.push(r);
					}
				} else {
					next.push(result as Decoration);
				}
			}
			mapped = next;
		}

		if (mapped.length === 0) return DecorationSet.empty;
		return DecorationSet.create(mapped);
	}
}

// --- Helpers ---

/** Compares two decoration arrays for structural equality. */
export function decorationArraysEqual(a: readonly Decoration[], b: readonly Decoration[]): boolean {
	if (a === b) return true;
	if (a.length !== b.length) return false;

	for (let i = 0; i < a.length; i++) {
		const ai = a[i];
		const bi = b[i];
		if (!ai || !bi || !decorationsEqual(ai, bi)) return false;
	}
	return true;
}

/** Compares two individual decorations for structural equality. */
function decorationsEqual(a: Decoration, b: Decoration): boolean {
	if (a.type !== b.type) return false;
	if (a.blockId !== b.blockId) return false;

	switch (a.type) {
		case 'inline': {
			const bi = b as InlineDecoration;
			return a.from === bi.from && a.to === bi.to && attrsEqual(a.attrs, bi.attrs);
		}
		case 'node': {
			const bn = b as NodeDecoration;
			return attrsEqual(a.attrs, bn.attrs);
		}
		case 'widget': {
			const bw = b as WidgetDecoration;
			return (
				a.offset === bw.offset && a.side === bw.side && a.key === bw.key && a.toDOM === bw.toDOM
			);
		}
	}
}

/** Compares two DecorationAttrs objects. */
function attrsEqual(a: DecorationAttrs, b: DecorationAttrs): boolean {
	if (a === b) return true;
	const aKeys = Object.keys(a);
	const bKeys = Object.keys(b);
	if (aKeys.length !== bKeys.length) return false;
	for (const key of aKeys) {
		if (a[key] !== b[key]) return false;
	}
	return true;
}
