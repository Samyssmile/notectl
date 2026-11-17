/** Converts significant HTML newlines into model structure before a slice is inserted. */
import type { SliceBlock } from '../model/ContentSlice.js';
import {
	type ContentSegment,
	createInlineNode,
	inlineSegment,
	textSegment,
} from '../model/Document.js';
import type { Schema } from '../model/Schema.js';
import { inlineType } from '../model/TypeBrands.js';

/** A line retains its block type, attributes and text marks, including empty lines. */
export function splitAtLineBreaks(block: SliceBlock): SliceBlock[] {
	const blocks: SliceBlock[] = [];
	let current: ContentSegment[] = [];
	const flush = (): void => {
		blocks.push({ ...block, segments: current.length > 0 ? current : [textSegment('')] });
		current = [];
	};
	for (const segment of block.segments) {
		if (segment.kind === 'inline') {
			current.push(segment);
			continue;
		}
		const parts: readonly string[] = segment.text.split('\n');
		for (const [index, part] of parts.entries()) {
			if (index > 0) flush();
			if (part) current.push(textSegment(part, segment.marks));
		}
	}
	flush();
	return blocks;
}

/**
 * Only code blocks store literal newlines. Other blocks use hard breaks when
 * available, or split into blocks for schemas without that inline capability.
 * Run after wrapper marks/attributes have been applied so every path agrees.
 */
export function materializeLineBreaks(block: SliceBlock, schema: Schema): SliceBlock[] {
	if (
		block.type === 'code_block' ||
		!block.segments.some((segment) => segment.kind === 'text' && segment.text.includes('\n'))
	) {
		return [block];
	}
	if (!schema.getInlineNodeSpec?.('hard_break')) return splitAtLineBreaks(block);
	// Like HTML import, a lone <br> denotes an empty block, not an extra line.
	const only: ContentSegment | undefined =
		block.segments.length === 1 ? block.segments[0] : undefined;
	if (only?.kind === 'text' && only.text === '\n') {
		return [{ ...block, segments: [textSegment('')] }];
	}

	const segments: ContentSegment[] = [];
	for (const segment of block.segments) {
		if (segment.kind === 'inline') {
			segments.push(segment);
			continue;
		}
		for (const [index, part] of segment.text.split('\n').entries()) {
			if (index > 0) {
				segments.push(inlineSegment(createInlineNode(inlineType('hard_break'), {}, segment.marks)));
			}
			if (part) segments.push(textSegment(part, segment.marks));
		}
	}
	return [{ ...block, segments }];
}

/** A trailing break at an inline run's block boundary does not add an empty paragraph. */
export function withoutTrailingLineBreak(
	segments: readonly ContentSegment[],
): readonly ContentSegment[] {
	const last: ContentSegment | undefined = segments.at(-1);
	if (last?.kind !== 'text' || !last.text.endsWith('\n')) return segments;
	const text: string = last.text.slice(0, -1);
	const head: readonly ContentSegment[] = segments.slice(0, -1);
	return text ? [...head, textSegment(text, last.marks)] : head;
}
