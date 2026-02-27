/**
 * Pure functions for manipulating inline content (TextNode / InlineNode arrays).
 * Extracted from StepApplication.ts to keep files under ~500 lines.
 */

import {
	type ChildNode,
	type InlineNode,
	type Mark,
	type TextNode,
	type TextSegment,
	addMarkToSet,
	createTextNode,
	isInlineNode,
	isTextNode,
	removeMarkFromSet,
} from '../model/Document.js';

/**
 * Inserts text into mixed inline content at the given offset.
 * Handles both TextNode and InlineNode children.
 */
export function insertTextIntoInlineContent(
	nodes: readonly (TextNode | InlineNode)[],
	offset: number,
	text: string,
	marks: readonly Mark[],
): (TextNode | InlineNode)[] {
	const result: (TextNode | InlineNode)[] = [];
	let pos = 0;
	let inserted = false;

	for (const node of nodes) {
		if (isInlineNode(node)) {
			if (!inserted && offset === pos) {
				result.push(createTextNode(text, marks));
				inserted = true;
			}
			result.push(node);
			pos += 1;
			continue;
		}

		const nodeEnd: number = pos + node.text.length;

		if (!inserted && offset >= pos && offset <= nodeEnd) {
			const localOffset: number = offset - pos;
			const before: string = node.text.slice(0, localOffset);
			const after: string = node.text.slice(localOffset);

			if (before) result.push(createTextNode(before, node.marks));
			result.push(createTextNode(text, marks));
			if (after) result.push(createTextNode(after, node.marks));
			inserted = true;
		} else {
			result.push(node);
		}

		pos = nodeEnd;
	}

	if (!inserted) {
		result.push(createTextNode(text, marks));
	}

	return result;
}

/**
 * Inserts segments into mixed inline content at the given offset.
 */
export function insertSegmentsIntoInlineContent(
	nodes: readonly (TextNode | InlineNode)[],
	offset: number,
	segments: readonly TextSegment[],
): (TextNode | InlineNode)[] {
	const result: (TextNode | InlineNode)[] = [];
	let pos = 0;
	let inserted = false;

	for (const node of nodes) {
		if (isInlineNode(node)) {
			if (!inserted && offset === pos) {
				for (const seg of segments) {
					result.push(createTextNode(seg.text, seg.marks));
				}
				inserted = true;
			}
			result.push(node);
			pos += 1;
			continue;
		}

		const nodeEnd: number = pos + node.text.length;

		if (!inserted && offset >= pos && offset <= nodeEnd) {
			const localOffset: number = offset - pos;
			const before: string = node.text.slice(0, localOffset);
			const after: string = node.text.slice(localOffset);

			if (before) result.push(createTextNode(before, node.marks));
			for (const seg of segments) {
				result.push(createTextNode(seg.text, seg.marks));
			}
			if (after) result.push(createTextNode(after, node.marks));
			inserted = true;
		} else {
			result.push(node);
		}

		pos = nodeEnd;
	}

	if (!inserted) {
		for (const seg of segments) {
			result.push(createTextNode(seg.text, seg.marks));
		}
	}

	return result;
}

/**
 * Deletes content from mixed inline content in the given range.
 * Removes InlineNodes that fall within the range.
 */
export function deleteFromInlineContent(
	nodes: readonly (TextNode | InlineNode)[],
	from: number,
	to: number,
): (TextNode | InlineNode)[] {
	const result: (TextNode | InlineNode)[] = [];
	let pos = 0;

	for (const node of nodes) {
		if (isInlineNode(node)) {
			const nodeEnd: number = pos + 1;
			// Keep if outside the delete range
			if (nodeEnd <= from || pos >= to) {
				result.push(node);
			}
			pos = nodeEnd;
			continue;
		}

		const nodeEnd: number = pos + node.text.length;

		if (nodeEnd <= from || pos >= to) {
			result.push(node);
		} else {
			const deleteFrom: number = Math.max(0, from - pos);
			const deleteTo: number = Math.min(node.text.length, to - pos);
			const remaining: string = node.text.slice(0, deleteFrom) + node.text.slice(deleteTo);
			if (remaining.length > 0) {
				result.push(createTextNode(remaining, node.marks));
			}
		}

		pos = nodeEnd;
	}

	return result;
}

/**
 * Slices mixed inline content to the given range.
 * InlineNodes are preserved as atoms (included if within range).
 */
export function sliceInlineContent(
	nodes: readonly (TextNode | InlineNode)[],
	from: number,
	to: number,
): (TextNode | InlineNode)[] {
	const result: (TextNode | InlineNode)[] = [];
	let pos = 0;

	for (const node of nodes) {
		if (isInlineNode(node)) {
			const nodeEnd: number = pos + 1;
			if (nodeEnd > from && pos < to) {
				result.push(node);
			}
			pos = nodeEnd;
			continue;
		}

		const nodeEnd: number = pos + node.text.length;

		if (nodeEnd <= from || pos >= to) {
			// Outside the slice range
		} else {
			const sliceFrom: number = Math.max(0, from - pos);
			const sliceTo: number = Math.min(node.text.length, to - pos);
			const text: string = node.text.slice(sliceFrom, sliceTo);
			if (text.length > 0) {
				result.push(createTextNode(text, node.marks));
			}
		}

		pos = nodeEnd;
	}

	if (result.length === 0) {
		result.push(createTextNode(''));
	}

	return result;
}

/**
 * Applies or removes a mark from mixed inline content in the given range.
 * InlineNodes are passed through unchanged (marks only apply to text).
 */
export function applyMarkToInlineContent(
	nodes: readonly (TextNode | InlineNode)[],
	from: number,
	to: number,
	mark: Mark,
	add: boolean,
): (TextNode | InlineNode)[] {
	const result: (TextNode | InlineNode)[] = [];
	let pos = 0;

	for (const node of nodes) {
		if (isInlineNode(node)) {
			result.push(node);
			pos += 1;
			continue;
		}

		const nodeEnd: number = pos + node.text.length;

		if (nodeEnd <= from || pos >= to) {
			result.push(node);
		} else if (pos >= from && nodeEnd <= to) {
			const newMarks: readonly Mark[] = add
				? addMarkToSet(node.marks, mark)
				: removeMarkFromSet(node.marks, mark.type);
			result.push(createTextNode(node.text, newMarks));
		} else {
			const overlapStart: number = Math.max(0, from - pos);
			const overlapEnd: number = Math.min(node.text.length, to - pos);

			const beforeText: string = node.text.slice(0, overlapStart);
			const insideText: string = node.text.slice(overlapStart, overlapEnd);
			const afterText: string = node.text.slice(overlapEnd);

			if (beforeText) result.push(createTextNode(beforeText, node.marks));
			if (insideText) {
				const newMarks: readonly Mark[] = add
					? addMarkToSet(node.marks, mark)
					: removeMarkFromSet(node.marks, mark.type);
				result.push(createTextNode(insideText, newMarks));
			}
			if (afterText) result.push(createTextNode(afterText, node.marks));
		}

		pos = nodeEnd;
	}

	return result;
}

/** Inserts an InlineNode at the given offset in mixed inline content. */
export function insertInlineNodeAtOffset(
	nodes: readonly (TextNode | InlineNode)[],
	offset: number,
	inlineNode: InlineNode,
): (TextNode | InlineNode)[] {
	const result: (TextNode | InlineNode)[] = [];
	let pos = 0;
	let inserted = false;

	for (const node of nodes) {
		if (isInlineNode(node)) {
			if (!inserted && offset === pos) {
				result.push(inlineNode);
				inserted = true;
			}
			result.push(node);
			pos += 1;
			continue;
		}

		const nodeEnd: number = pos + node.text.length;

		if (!inserted && offset >= pos && offset <= nodeEnd) {
			const localOffset: number = offset - pos;
			const before: string = node.text.slice(0, localOffset);
			const after: string = node.text.slice(localOffset);

			if (before) result.push(createTextNode(before, node.marks));
			result.push(inlineNode);
			if (after) result.push(createTextNode(after, node.marks));
			inserted = true;
		} else {
			result.push(node);
		}

		pos = nodeEnd;
	}

	if (!inserted) {
		result.push(inlineNode);
	}

	return result;
}

/** Removes the InlineNode at the given offset from mixed inline content. */
export function removeInlineNodeAtOffset(
	nodes: readonly (TextNode | InlineNode)[],
	offset: number,
): (TextNode | InlineNode)[] {
	const result: (TextNode | InlineNode)[] = [];
	let pos = 0;

	for (const node of nodes) {
		if (isInlineNode(node)) {
			if (pos !== offset) {
				result.push(node);
			}
			pos += 1;
			continue;
		}
		result.push(node);
		pos += node.text.length;
	}

	return result;
}

/** Replaces the attrs of an InlineNode at the given offset. */
export function setInlineNodeAttrsAtOffset(
	nodes: readonly (TextNode | InlineNode)[],
	offset: number,
	attrs: Readonly<Record<string, string | number | boolean>>,
): (TextNode | InlineNode)[] {
	const result: (TextNode | InlineNode)[] = [];
	let pos = 0;

	for (const node of nodes) {
		if (isInlineNode(node)) {
			if (pos === offset) {
				result.push({ ...node, attrs });
			} else {
				result.push(node);
			}
			pos += 1;
			continue;
		}
		result.push(node);
		pos += node.text.length;
	}

	return result;
}

/**
 * Replaces the inline content children of a ChildNode array,
 * preserving any BlockNode children in their original positions.
 */
export function replaceInlineChildren(
	original: readonly ChildNode[],
	newInlineChildren: readonly (TextNode | InlineNode)[],
): readonly ChildNode[] {
	// Fast path: if no block children exist, just return new inline nodes
	if (original.every((c) => isTextNode(c) || isInlineNode(c))) {
		return newInlineChildren;
	}
	// Mixed: put inline nodes first, then block nodes (preserves structure)
	const blockChildren: ChildNode[] = original.filter((c) => !isTextNode(c) && !isInlineNode(c));
	return [...newInlineChildren, ...blockChildren];
}
