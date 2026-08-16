/**
 * ContentSlice: an immutable fragment of document content for paste operations.
 * Represents "what to insert" independent of where it will be inserted.
 */

import type { BlockAttrs, ContentSegment } from './Document.js';
import { textSegment } from './Document.js';
import type { NodeTypeName } from './TypeBrands.js';
import { nodeType } from './TypeBrands.js';

export interface SliceBlock {
	readonly type: NodeTypeName;
	readonly attrs?: BlockAttrs;
	/** Inline content: text segments (with marks) and atomic inline nodes. */
	readonly segments: readonly ContentSegment[];
}

export interface ContentSlice {
	readonly blocks: readonly SliceBlock[];
}

/** Returns the offset-space length of a block's segments (inline nodes count as 1). */
export function segmentsLength(segments: readonly ContentSegment[]): number {
	return segments.reduce(
		(acc: number, s: ContentSegment) => acc + (s.kind === 'inline' ? 1 : s.text.length),
		0,
	);
}

/**
 * Whether a slice carries anything an insertion could materialize. The HTML
 * parser represents "parsed to nothing" as a single empty paragraph; that
 * sentinel (and a genuinely empty block list) reports false so paste callers
 * can fall back to another clipboard flavor (#216).
 */
export function sliceHasContent(slice: ContentSlice): boolean {
	if (slice.blocks.length > 1) return true;
	const only: SliceBlock | undefined = slice.blocks[0];
	if (!only) return false;
	if (only.type !== nodeType('paragraph')) return true;
	return segmentsLength(only.segments) > 0;
}

/** Creates a content slice from plain text, one paragraph block per line. */
export function plainTextSlice(text: string): ContentSlice {
	const lines: readonly string[] = text.split(/\r?\n/);
	return {
		blocks: lines.map(
			(line: string): SliceBlock => ({
				type: nodeType('paragraph'),
				segments: [textSegment(line)],
			}),
		),
	};
}
