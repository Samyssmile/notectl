/**
 * ContentSlice: an immutable fragment of document content for paste operations.
 * Represents "what to insert" independent of where it will be inserted.
 */

import type { BlockAttrs, TextSegment } from './Document.js';
import type { NodeTypeName } from './TypeBrands.js';
import { nodeType } from './TypeBrands.js';

export interface SliceBlock {
	readonly type: NodeTypeName;
	readonly attrs?: BlockAttrs;
	readonly segments: readonly TextSegment[];
}

export interface ContentSlice {
	readonly blocks: readonly SliceBlock[];
}

/** Concatenates all segment texts within a slice block. */
export function segmentsToText(segments: readonly TextSegment[]): string {
	return segments.reduce((acc: string, s: TextSegment) => acc + s.text, '');
}

/** Returns the total text length of a slice block's segments. */
export function segmentsLength(segments: readonly TextSegment[]): number {
	return segments.reduce((acc: number, s: TextSegment) => acc + s.text.length, 0);
}

/** Creates a single-paragraph content slice from plain text. */
export function plainTextSlice(text: string): ContentSlice {
	const lines: readonly string[] = text.split(/\r?\n/);
	const blocks: readonly SliceBlock[] = lines.map(
		(line: string): SliceBlock => ({
			type: nodeType('paragraph'),
			segments: [{ text: line, marks: [] }],
		}),
	);
	return {
		blocks:
			blocks.length > 0
				? blocks
				: [{ type: nodeType('paragraph'), segments: [{ text: '', marks: [] }] }],
	};
}
