/**
 * Rich block data types for clipboard serialization.
 *
 * These pure data interfaces describe serialized blocks and inline segments
 * with marks, used by both `input/` (clipboard operations) and `commands/`
 * (block insertion). Placed in `model/` to avoid cross-layer dependencies.
 */

/** A serialized text segment preserving marks. */
export interface RichTextSegment {
	readonly text: string;
	readonly marks: readonly { readonly type: string; readonly attrs?: Record<string, unknown> }[];
	/** Omitted for backwards compatibility with existing clipboard payloads. */
	readonly kind?: 'text';
}

/** A serialized inline node preserved in rich clipboard payloads. */
export interface RichInlineSegment {
	readonly kind: 'inline';
	readonly inlineType: string;
	readonly attrs?: Record<string, unknown>;
}

/** A serialized inline segment: either marked text or an inline node. */
export type RichSegment = RichTextSegment | RichInlineSegment;

/** A serialized block from a text-selection copy. */
export interface RichBlockData {
	readonly type: string;
	readonly text: string;
	readonly attrs?: Record<string, unknown>;
	/** Inline segments with marks. When present, used instead of plain `text`. */
	readonly segments?: readonly RichSegment[];
}
