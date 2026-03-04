/**
 * Rich block data types for clipboard serialization.
 *
 * These pure data interfaces describe serialized blocks and inline segments
 * with marks, used by both `input/` (clipboard operations) and `commands/`
 * (block insertion). Placed in `model/` to avoid cross-layer dependencies.
 */

/** A serialized inline segment preserving marks. */
export interface RichSegment {
	readonly text: string;
	readonly marks: readonly { readonly type: string; readonly attrs?: Record<string, unknown> }[];
}

/** A serialized block from a text-selection copy. */
export interface RichBlockData {
	readonly type: string;
	readonly text: string;
	readonly attrs?: Record<string, unknown>;
	/** Inline segments with marks. When present, used instead of plain `text`. */
	readonly segments?: readonly RichSegment[];
}
