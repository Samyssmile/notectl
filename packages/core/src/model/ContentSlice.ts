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

/** Zero-width characters that render nothing (ZWSP, ZWNJ, ZWJ, word joiner, BOM). */
const ZERO_WIDTH_CHARS = /\u200B|\u200C|\u200D|\u2060|\uFEFF/g;

/** Whether the text renders any characters once zero-width characters are ignored. */
export function hasVisibleTextContent(text: string): boolean {
	return text.replace(ZERO_WIDTH_CHARS, '').length > 0;
}

/** Whether a segment renders anything: inline nodes always do, text only beyond zero-width characters. */
function segmentHasVisibleContent(segment: ContentSegment): boolean {
	if (segment.kind === 'inline') return true;
	return hasVisibleTextContent(segment.text);
}

/**
 * Whether a slice carries anything an insertion could materialize. A block
 * counts when it has visible segment content or is not a plain paragraph (an
 * empty code block is still a visible box). Empty paragraphs alone — the HTML
 * parser's encoding for markup that parsed to nothing, in any number — report
 * false so paste callers can fall back to another clipboard flavor (#216).
 */
export function sliceHasContent(slice: ContentSlice): boolean {
	return slice.blocks.some(
		(block: SliceBlock) =>
			block.type !== nodeType('paragraph') || block.segments.some(segmentHasVisibleContent),
	);
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
