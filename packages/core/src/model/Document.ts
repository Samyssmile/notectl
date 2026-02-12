/**
 * Core document model types for the Notectl editor.
 * All types are deeply readonly — mutations create new instances.
 */

import type { BlockId, InlineTypeName, MarkTypeName, NodeTypeName } from './TypeBrands.js';

// --- Mark Types ---

/** @deprecated Use {@link MarkTypeName} for new code. */
export type MarkType = MarkTypeName;

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

/** @deprecated Use {@link NodeTypeName} for new code. */
export type NodeType = NodeTypeName;

export interface BlockAttrs {
	readonly [key: string]: string | number | boolean;
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
}

/** A child of a BlockNode: text, inline element, or nested block. */
export type ChildNode = TextNode | InlineNode | BlockNode;

export interface BlockNode {
	readonly id: BlockId;
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

/** Extracts TextNode segments within a block for the given offset range. */
export function getBlockSegmentsInRange(
	block: BlockNode,
	from: number,
	to: number,
): readonly TextSegment[] {
	const inlineChildren: readonly (TextNode | InlineNode)[] = getInlineChildren(block);
	const segments: TextSegment[] = [];
	let pos = 0;

	for (const child of inlineChildren) {
		const childWidth: number = isInlineNode(child) ? 1 : child.text.length;
		const childEnd: number = pos + childWidth;

		if (childEnd <= from || pos >= to) {
			pos = childEnd;
			continue;
		}

		if (isInlineNode(child)) {
			// InlineNodes are skipped for TextSegment extraction
			pos = childEnd;
			continue;
		}

		const sliceFrom: number = Math.max(0, from - pos);
		const sliceTo: number = Math.min(child.text.length, to - pos);
		const text: string = child.text.slice(sliceFrom, sliceTo);

		if (text.length > 0) {
			segments.push({ text, marks: child.marks });
		}

		pos = childEnd;
	}

	return segments;
}

/** Returns content segments (text and inline) for a block range. */
export function getBlockContentSegmentsInRange(
	block: BlockNode,
	from: number,
	to: number,
): readonly ContentSegment[] {
	const inlineChildren: readonly (TextNode | InlineNode)[] = getInlineChildren(block);
	const segments: ContentSegment[] = [];
	let pos = 0;

	for (const child of inlineChildren) {
		const childWidth: number = isInlineNode(child) ? 1 : child.text.length;
		const childEnd: number = pos + childWidth;

		if (childEnd <= from || pos >= to) {
			pos = childEnd;
			continue;
		}

		if (isInlineNode(child)) {
			segments.push({ kind: 'inline', node: child });
		} else {
			const sliceFrom: number = Math.max(0, from - pos);
			const sliceTo: number = Math.min(child.text.length, to - pos);
			const text: string = child.text.slice(sliceFrom, sliceTo);
			if (text.length > 0) {
				segments.push({ kind: 'text', text, marks: child.marks });
			}
		}

		pos = childEnd;
	}

	return segments;
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
): BlockNode {
	return {
		id: id ?? generateBlockId(),
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
): InlineNode {
	return {
		type: 'inline',
		inlineType,
		attrs: attrs ?? {},
	};
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
	const inlineChildren: readonly (TextNode | InlineNode)[] = getInlineChildren(block);
	let len = 0;
	for (const child of inlineChildren) {
		len += isInlineNode(child) ? 1 : child.text.length;
	}
	return len;
}

/** Returns the marks active at the given offset (empty for InlineNode offsets). */
export function getBlockMarksAtOffset(block: BlockNode, offset: number): readonly Mark[] {
	const inlineChildren: readonly (TextNode | InlineNode)[] = getInlineChildren(block);
	let pos = 0;

	for (const child of inlineChildren) {
		if (isInlineNode(child)) {
			if (offset === pos) return [];
			pos += 1;
			continue;
		}
		const end: number = pos + child.text.length;
		if (offset >= pos && offset < end) {
			return child.marks;
		}
		if (offset === pos && child.text.length === 0) {
			return child.marks;
		}
		pos = end;
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
