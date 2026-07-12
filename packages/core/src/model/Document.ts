/**
 * Core document model types for the Notectl editor.
 * All types are deeply readonly — mutations create new instances.
 */

import { normalizeHTMLId } from './HTMLUtils.js';
import type { BlockId, InlineTypeName, MarkTypeName, NodeTypeName } from './TypeBrands.js';

// --- Mark Types ---

export interface Mark {
	readonly type: MarkTypeName;
	readonly attrs?: Readonly<Record<string, string | number | boolean>>;
}

export interface BoldMark extends Mark {
	readonly type: MarkTypeName & 'bold';
}

export interface ItalicMark extends Mark {
	readonly type: MarkTypeName & 'italic';
}

export interface UnderlineMark extends Mark {
	readonly type: MarkTypeName & 'underline';
}

// --- Node Types ---

/** JSON-compatible primitive stored in a block attribute. */
export type BlockAttrPrimitive = string | number | boolean | null;

/** Scalar member permitted inside a structured block-attribute array. */
export type BlockAttrArrayValue = BlockAttrPrimitive;

/**
 * Immutable JSON-compatible block attribute value.
 *
 * Marks and inline nodes intentionally retain their scalar-only attributes.
 * Block nodes may additionally own structured state (for example a table's
 * logical column-width vector) without encoding it in delimiter strings.
 */
export type BlockAttrValue = Exclude<BlockAttrPrimitive, null> | readonly BlockAttrArrayValue[];

export interface BlockAttrs {
	readonly [key: string]: BlockAttrValue;
}

export interface TextNode {
	readonly type: 'text';
	readonly text: string;
	readonly marks: readonly Mark[];
}

/** Atomic inline element (width 1 in offset space). */
export interface InlineNode {
	readonly type: 'inline';
	readonly inlineType: InlineTypeName;
	readonly attrs: Readonly<Record<string, string | number | boolean>>;
	/**
	 * Marks applied to this atomic node (e.g. a `link` on an inline image). Inline
	 * nodes carry marks just like text nodes do, so a linked inline image survives
	 * import, export, and rendering without the link being dropped.
	 */
	readonly marks: readonly Mark[];
}

/** A child of a BlockNode: text, inline element, or nested block. */
export type ChildNode = TextNode | InlineNode | BlockNode;

export interface BlockNode {
	/** Internal editor identity, serialized to HTML as `data-block-id`. */
	readonly id: BlockId;
	/** Optional document-local HTML target, serialized to the block element's `id` attribute. */
	readonly htmlId?: string;
	readonly type: NodeTypeName;
	readonly attrs?: BlockAttrs;
	readonly children: readonly ChildNode[];
}

export interface Document {
	readonly children: readonly BlockNode[];
}

// --- Text Segment (for mark-preserving undo) ---

export interface TextSegment {
	readonly text: string;
	readonly marks: readonly Mark[];
}

/** A content segment: either text (with marks) or an inline node. */
export type ContentSegment =
	| { readonly kind: 'text'; readonly text: string; readonly marks: readonly Mark[] }
	| { readonly kind: 'inline'; readonly node: InlineNode };

/** Creates a text {@link ContentSegment}. */
export function textSegment(text: string, marks: readonly Mark[] = []): ContentSegment {
	return { kind: 'text', text, marks };
}

/** Creates an inline {@link ContentSegment} wrapping an {@link InlineNode}. */
export function inlineSegment(node: InlineNode): ContentSegment {
	return { kind: 'inline', node };
}

/** Returns content segments (text and inline) for a block range. */
export function getBlockContentSegmentsInRange(
	block: BlockNode,
	from: number,
	to: number,
): readonly ContentSegment[] {
	const segments: ContentSegment[] = [];
	forEachInlineChildInRange(block, from, to, {
		onText(text: string, marks: readonly Mark[]): void {
			segments.push({ kind: 'text', text, marks });
		},
		onInline(node: InlineNode): void {
			segments.push({ kind: 'inline', node });
		},
	});
	return segments;
}

/** Visitor callbacks invoked by {@link forEachInlineChildInRange} for each in-range child. */
export interface BlockRangeVisitor {
	/** Called with the clipped text and its marks for each text node overlapping the range. */
	readonly onText: (text: string, marks: readonly Mark[]) => void;
	/** Called for each inline node falling within the range. */
	readonly onInline?: (node: InlineNode) => void;
}

/**
 * Walks the inline children of `block` overlapping `[from, to)` and invokes the
 * matching visitor callback for each. Text nodes are clipped to the range before
 * `onText` fires; empty slices are skipped. This is the single read-only walker
 * for range-based inline serialization (segments, HTML, clipboard).
 */
export function forEachInlineChildInRange(
	block: BlockNode,
	from: number,
	to: number,
	visitor: BlockRangeVisitor,
): void {
	for (const { child, from: childFrom, to: childEnd } of walkInlineContent(
		getInlineChildren(block),
	)) {
		if (childEnd <= from || childFrom >= to) continue;

		if (isInlineNode(child)) {
			visitor.onInline?.(child);
		} else {
			const sliceFrom: number = Math.max(0, from - childFrom);
			const sliceTo: number = Math.min(child.text.length, to - childFrom);
			const text: string = child.text.slice(sliceFrom, sliceTo);
			if (text.length > 0) {
				visitor.onText(text, child.marks);
			}
		}
	}
}

// --- Type Guards ---

/** Checks whether a value is a {@link TextNode}. */
export function isTextNode(node: unknown): node is TextNode {
	return (
		typeof node === 'object' &&
		node !== null &&
		(node as TextNode).type === 'text' &&
		typeof (node as TextNode).text === 'string'
	);
}

/** Checks whether a value is an {@link InlineNode}. */
export function isInlineNode(node: unknown): node is InlineNode {
	return (
		typeof node === 'object' &&
		node !== null &&
		(node as InlineNode).type === 'inline' &&
		typeof (node as InlineNode).inlineType === 'string'
	);
}

/** Checks whether a value is a {@link BlockNode}. */
export function isBlockNode(node: unknown): node is BlockNode {
	return (
		typeof node === 'object' &&
		node !== null &&
		typeof (node as BlockNode).id === 'string' &&
		typeof (node as BlockNode).type === 'string' &&
		(node as BlockNode).type !== ('text' as string) &&
		(node as BlockNode).type !== ('inline' as string) &&
		Array.isArray((node as BlockNode).children)
	);
}

// --- Child Node Helpers ---

/** Returns true if a block has only inline content (TextNodes and InlineNodes). */
export function isLeafBlock(node: BlockNode): boolean {
	return node.children.every((c) => isTextNode(c) || isInlineNode(c));
}

/** Returns only the TextNode children of a block. */
export function getTextChildren(node: BlockNode): readonly TextNode[] {
	return node.children.filter((c): c is TextNode => isTextNode(c));
}

/** Returns the inline content children (TextNode | InlineNode) of a block. */
export function getInlineChildren(node: BlockNode): readonly (TextNode | InlineNode)[] {
	return node.children.filter((c): c is TextNode | InlineNode => isTextNode(c) || isInlineNode(c));
}

/** Returns only the BlockNode children of a block. */
export function getBlockChildren(node: BlockNode): readonly BlockNode[] {
	return node.children.filter((c): c is BlockNode => isBlockNode(c));
}

// --- Factory Functions ---

/** Generates a unique block ID using crypto.randomUUID(). */
export function generateBlockId(): BlockId {
	return `block-${crypto.randomUUID()}` as BlockId;
}

/** Creates a new empty {@link Document} with a single empty paragraph. */
export function createDocument(children?: readonly BlockNode[]): Document {
	return {
		children: children ?? [createBlockNode('paragraph' as NodeTypeName)],
	};
}

/** Creates a new {@link BlockNode}. */
export function createBlockNode(
	type: NodeTypeName,
	children?: readonly ChildNode[],
	id?: BlockId,
	attrs?: BlockAttrs,
	htmlId?: string,
): BlockNode {
	const normalizedHTMLId: string | undefined = normalizeHTMLId(htmlId);
	return {
		id: id ?? generateBlockId(),
		...(normalizedHTMLId ? { htmlId: normalizedHTMLId } : {}),
		type,
		...(attrs ? { attrs } : {}),
		children: children ?? [createTextNode('')],
	};
}

/** Creates a new {@link TextNode}. */
export function createTextNode(text: string, marks?: readonly Mark[]): TextNode {
	return {
		type: 'text',
		text,
		marks: marks ?? [],
	};
}

/** Creates a new {@link InlineNode}. */
export function createInlineNode(
	inlineType: InlineTypeName,
	attrs?: Readonly<Record<string, string | number | boolean>>,
	marks?: readonly Mark[],
): InlineNode {
	return {
		type: 'inline',
		inlineType,
		attrs: attrs ?? {},
		marks: marks ?? [],
	};
}

/** Creates an empty paragraph block node with the given ID. */
export function createEmptyParagraph(id?: BlockId): BlockNode {
	return createBlockNode('paragraph' as NodeTypeName, [createTextNode('')], id);
}

// --- Utility Functions ---

/** Extracts plain text from a block (InlineNodes are skipped). */
export function getBlockText(block: BlockNode): string {
	const inlineChildren: readonly (TextNode | InlineNode)[] = getInlineChildren(block);
	let text = '';
	for (const child of inlineChildren) {
		if (isTextNode(child)) {
			text += child.text;
		}
	}
	return text;
}

/** Returns the length of a block's inline content (InlineNodes count as 1). */
export function getBlockLength(block: BlockNode): number {
	let len = 0;
	for (const { to } of walkInlineContent(getInlineChildren(block))) {
		len = to;
	}
	return len;
}

/** Returns the marks active at the given offset (empty for InlineNode offsets). */
export function getBlockMarksAtOffset(block: BlockNode, offset: number): readonly Mark[] {
	const inlineChildren: readonly (TextNode | InlineNode)[] = getInlineChildren(block);

	for (const { child, from, to } of walkInlineContent(inlineChildren)) {
		if (isInlineNode(child)) {
			if (offset === from) return [];
			continue;
		}
		if (offset >= from && offset < to) {
			return child.marks;
		}
		// Empty text node (from === to): match exactly at its position.
		if (offset === from && child.text.length === 0) {
			return child.marks;
		}
	}

	// Fall back to last text child's marks
	for (let i: number = inlineChildren.length - 1; i >= 0; i--) {
		const child: TextNode | InlineNode | undefined = inlineChildren[i];
		if (child && isTextNode(child)) {
			return child.marks;
		}
	}
	return [];
}

/** Returns the marks of the text content immediately to the right of `offset`. */
function getMarksAfterOffset(block: BlockNode, offset: number): readonly Mark[] {
	for (const { child, from, to } of walkInlineContent(getInlineChildren(block))) {
		if (isInlineNode(child)) {
			if (offset === from) return [];
			continue;
		}
		if (offset >= from && offset < to) return child.marks;
	}
	return [];
}

/**
 * Returns the marks that text typed at a collapsed cursor should carry.
 *
 * Marks are derived from the content around `offset` (via
 * {@link getBlockMarksAtOffset}). A mark whose spec is non-inclusive
 * (`isMarkInclusive` returns `false`) is only kept when it also covers the
 * content to the right of the cursor, so it never bleeds past its right
 * boundary onto newly typed text. Inclusive marks (the default) are unaffected.
 */
export function getCursorMarks(
	block: BlockNode,
	offset: number,
	isMarkInclusive: (type: MarkTypeName) => boolean,
): readonly Mark[] {
	const marks: readonly Mark[] = getBlockMarksAtOffset(block, offset);
	if (marks.length === 0) return marks;

	const after: readonly Mark[] = getMarksAfterOffset(block, offset);
	return marks.filter(
		(mark) => isMarkInclusive(mark.type) || after.some((a) => marksEqual(a, mark)),
	);
}

/** Checks whether two marks are equal by type and attrs. */
export function marksEqual(a: Mark, b: Mark): boolean {
	if (a.type !== b.type) return false;
	const aAttrs = a.attrs;
	const bAttrs = b.attrs;
	if (!aAttrs && !bAttrs) return true;
	if (!aAttrs || !bAttrs) return false;
	const aKeys = Object.keys(aAttrs);
	const bKeys = Object.keys(bAttrs);
	if (aKeys.length !== bKeys.length) return false;
	return aKeys.every((key) => aAttrs[key] === bAttrs[key]);
}

/** Deep equality for immutable, JSON-compatible block attribute values. */
export function blockAttrValuesEqual(
	a: BlockAttrValue | undefined,
	b: BlockAttrValue | undefined,
): boolean {
	if (a === b) return true;
	if (a === undefined || b === undefined || a === null || b === null) return false;
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
		return a.every((value, index) => value === b[index]);
	}
	return false;
}

/** Deep equality for block attribute records. */
export function blockAttrsEqual(a: BlockAttrs | undefined, b: BlockAttrs | undefined): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	const aKeys: readonly string[] = Object.keys(a);
	const bKeys: readonly string[] = Object.keys(b);
	if (aKeys.length !== bKeys.length) return false;
	return aKeys.every((key) => blockAttrValuesEqual(a[key], b[key]));
}

/** Checks whether two mark arrays contain the same marks (order-independent). */
export function markSetsEqual(a: readonly Mark[], b: readonly Mark[]): boolean {
	if (a.length !== b.length) return false;
	return a.every((markA) => b.some((markB) => marksEqual(markA, markB)));
}

/** Returns true if the mark set contains a mark of the given type. */
export function hasMark(marks: readonly Mark[], markType: MarkTypeName): boolean {
	return marks.some((m) => m.type === markType);
}

/** Adds a mark to a mark set (no duplicates). */
export function addMarkToSet(marks: readonly Mark[], mark: Mark): readonly Mark[] {
	if (hasMark(marks, mark.type)) return marks;
	return [...marks, mark];
}

/** Removes a mark type from a mark set. */
export function removeMarkFromSet(marks: readonly Mark[], markType: MarkTypeName): readonly Mark[] {
	return marks.filter((m) => m.type !== markType);
}

/**
 * Normalizes text nodes within a block: merges adjacent nodes with identical marks,
 * removes empty text nodes (keeping at least one).
 */
export function normalizeTextNodes(nodes: readonly TextNode[]): readonly TextNode[] {
	if (nodes.length === 0) return [createTextNode('')];

	const result: TextNode[] = [];
	for (const node of nodes) {
		const prev: TextNode | undefined = result[result.length - 1];
		if (prev && markSetsEqual(prev.marks, node.marks)) {
			result[result.length - 1] = createTextNode(prev.text + node.text, prev.marks);
		} else if (node.text.length > 0 || result.length === 0) {
			result.push(node);
		}
	}

	return result.length === 0 ? [createTextNode('')] : result;
}

/**
 * Normalizes mixed inline content: merges adjacent TextNodes with same marks,
 * removes empty TextNodes adjacent to InlineNodes, preserves InlineNodes as-is.
 * Guarantees at least one TextNode exists if all text is empty.
 */
export function normalizeInlineContent(
	nodes: readonly (TextNode | InlineNode)[],
): readonly (TextNode | InlineNode)[] {
	if (nodes.length === 0) return [createTextNode('')];

	// Fast path: no InlineNodes, delegate to normalizeTextNodes
	if (nodes.every((n): n is TextNode => isTextNode(n))) {
		return normalizeTextNodes(nodes);
	}

	const result: (TextNode | InlineNode)[] = [];

	for (const node of nodes) {
		if (isInlineNode(node)) {
			result.push(node);
			continue;
		}
		// TextNode: try to merge with previous TextNode
		const prev: TextNode | InlineNode | undefined = result[result.length - 1];
		if (prev && isTextNode(prev) && markSetsEqual(prev.marks, node.marks)) {
			result[result.length - 1] = createTextNode(prev.text + node.text, prev.marks);
		} else if (node.text.length > 0 || result.length === 0) {
			result.push(node);
		}
	}

	// Remove empty TextNodes that are adjacent to InlineNodes
	const cleaned: (TextNode | InlineNode)[] = result.filter((node, i) => {
		if (isInlineNode(node)) return true;
		if (node.text.length > 0) return true;
		// Keep if it's the only node
		if (result.length === 1) return true;
		// Remove empty TextNode if adjacent to InlineNode
		const prev: TextNode | InlineNode | undefined = result[i - 1];
		const next: TextNode | InlineNode | undefined = result[i + 1];
		if ((prev && isInlineNode(prev)) || (next && isInlineNode(next))) {
			return false;
		}
		return true;
	});

	// Ensure at least one TextNode exists
	if (cleaned.length === 0) return [createTextNode('')];
	if (!cleaned.some((n) => isTextNode(n))) {
		return [createTextNode(''), ...cleaned];
	}

	return cleaned;
}

/** Materializes a single {@link ContentSegment} into its inline child node. */
export function contentSegmentToInlineNode(segment: ContentSegment): TextNode | InlineNode {
	return segment.kind === 'inline' ? segment.node : createTextNode(segment.text, segment.marks);
}

/**
 * Materializes content segments (text + inline) into normalized inline children.
 * Inverse of {@link getBlockContentSegmentsInRange}: used when turning a range of
 * segments back into a block's children (paste insertion, slice extraction).
 */
export function segmentsToInlineChildren(
	segments: readonly ContentSegment[],
): readonly (TextNode | InlineNode)[] {
	return normalizeInlineContent(segments.map(contentSegmentToInlineNode));
}

/** Yields each inline child with its offset range. InlineNodes have width 1. */
export function* walkInlineContent(children: readonly (TextNode | InlineNode)[]): Generator<{
	readonly child: TextNode | InlineNode;
	readonly from: number;
	readonly to: number;
}> {
	let pos = 0;
	for (const child of children) {
		const width: number = isInlineNode(child) ? 1 : child.text.length;
		yield { child, from: pos, to: pos + width };
		pos += width;
	}
}

/**
 * Converts a block-space offset to a text-space offset.
 *
 * Block-space counts InlineNodes as width 1, but `getBlockText()` skips them.
 * This function maps a block offset to the equivalent position in the
 * text-only string returned by `getBlockText()`.
 */
export function blockOffsetToTextOffset(block: BlockNode, blockOffset: number): number {
	let textPos = 0;

	for (const { child, from, to } of walkInlineContent(getInlineChildren(block))) {
		if (isInlineNode(child)) {
			if (from >= blockOffset) return textPos;
		} else {
			if (to >= blockOffset) return textPos + (blockOffset - from);
			textPos += child.text.length;
		}
	}

	return textPos;
}

/** Returns the content at a specific offset: text char, inline node, or null. */
export function getContentAtOffset(
	block: BlockNode,
	offset: number,
):
	| { readonly kind: 'text'; readonly char: string; readonly marks: readonly Mark[] }
	| { readonly kind: 'inline'; readonly node: InlineNode }
	| null {
	const inlineChildren: readonly (TextNode | InlineNode)[] = getInlineChildren(block);

	for (const { child, from } of walkInlineContent(inlineChildren)) {
		if (isInlineNode(child)) {
			if (offset === from) return { kind: 'inline', node: child };
			continue;
		}
		const localOffset: number = offset - from;
		if (localOffset >= 0 && localOffset < child.text.length) {
			return {
				kind: 'text',
				char: child.text[localOffset] ?? '',
				marks: child.marks,
			};
		}
	}

	return null;
}
