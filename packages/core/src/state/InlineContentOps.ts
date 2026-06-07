/**
 * Pure functions for manipulating inline content (TextNode / InlineNode arrays).
 * Extracted from StepApplication.ts to keep files under ~500 lines.
 */

import {
	type ChildNode,
	type ContentSegment,
	type InlineNode,
	type Mark,
	type TextNode,
	addMarkToSet,
	contentSegmentToInlineNode,
	createTextNode,
	isInlineNode,
	isTextNode,
	marksEqual,
	removeMarkFromSet,
} from '../model/Document.js';
import type { MarkTypeName } from '../model/TypeBrands.js';

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
	return insertIntoInlineContent(nodes, offset, () => [createTextNode(text, marks)]);
}

/**
 * Inserts content segments (text and inline nodes) into mixed inline content
 * at the given offset. Inline segments are restored as atomic nodes, so this
 * round-trips the payload captured by `getBlockContentSegmentsInRange`.
 */
export function insertSegmentsIntoInlineContent(
	nodes: readonly (TextNode | InlineNode)[],
	offset: number,
	segments: readonly ContentSegment[],
): (TextNode | InlineNode)[] {
	return insertIntoInlineContent(nodes, offset, () => segments.map(contentSegmentToInlineNode));
}

/** Shared insertion logic for text and segments into mixed inline content. */
function insertIntoInlineContent(
	nodes: readonly (TextNode | InlineNode)[],
	offset: number,
	createInsertedNodes: () => readonly (TextNode | InlineNode)[],
): (TextNode | InlineNode)[] {
	const result: (TextNode | InlineNode)[] = [];
	let pos = 0;
	let inserted = false;

	for (const node of nodes) {
		if (isInlineNode(node)) {
			if (!inserted && offset === pos) {
				result.push(...createInsertedNodes());
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
			result.push(...createInsertedNodes());
			if (after) result.push(createTextNode(after, node.marks));
			inserted = true;
		} else {
			result.push(node);
		}

		pos = nodeEnd;
	}

	if (!inserted) {
		result.push(...createInsertedNodes());
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

/**
 * Maximal sub-ranges within [from, to) where no text node carries a mark
 * of type `markType`. InlineNodes are inert: they pass through and do not
 * break coalescing, but a range never starts on an InlineNode.
 *
 * Used by `TransactionBuilder.addMark` to emit `AddMarkStep`s only over
 * sub-ranges that actually lack the mark, so the symmetric inverse
 * preserves any marks that pre-existed.
 */
export function findRangesMissingMark(
	nodes: readonly (TextNode | InlineNode)[],
	from: number,
	to: number,
	markType: MarkTypeName,
): readonly { readonly from: number; readonly to: number }[] {
	const result: { from: number; to: number }[] = [];
	if (from >= to) return result;
	let current: { from: number; to: number } | null = null;
	let pos = 0;

	const flush = (): void => {
		if (current) {
			result.push(current);
			current = null;
		}
	};

	for (const node of nodes) {
		const nodeLength: number = isInlineNode(node) ? 1 : node.text.length;
		const nodeEnd: number = pos + nodeLength;

		if (nodeEnd <= from || pos >= to) {
			pos = nodeEnd;
			continue;
		}

		const overlapStart: number = Math.max(pos, from);
		const overlapEnd: number = Math.min(nodeEnd, to);

		if (isInlineNode(node)) {
			if (current) current.to = overlapEnd;
		} else if (node.marks.some((m) => m.type === markType)) {
			flush();
		} else if (current) {
			current.to = overlapEnd;
		} else {
			current = { from: overlapStart, to: overlapEnd };
		}

		pos = nodeEnd;
	}

	flush();
	return result;
}

/**
 * Maximal sub-ranges within [from, to) where every text node carries a mark
 * of type `markType`. Each range is paired with the actual mark from the
 * document (including attrs). Adjacent sub-ranges coalesce only when their
 * marks are `marksEqual`. InlineNodes are inert: they pass through and do
 * not break coalescing, but a range never starts on an InlineNode.
 *
 * Used by `TransactionBuilder.removeMark` to emit `RemoveMarkStep`s whose
 * `mark` reflects the actual document content, so the symmetric inverse
 * restores attrs faithfully.
 */
export function findRangesWithMark(
	nodes: readonly (TextNode | InlineNode)[],
	from: number,
	to: number,
	markType: MarkTypeName,
): readonly { readonly from: number; readonly to: number; readonly mark: Mark }[] {
	const result: { from: number; to: number; mark: Mark }[] = [];
	if (from >= to) return result;
	let current: { from: number; to: number; mark: Mark } | null = null;
	let pos = 0;

	const flush = (): void => {
		if (current) {
			result.push(current);
			current = null;
		}
	};

	for (const node of nodes) {
		const nodeLength: number = isInlineNode(node) ? 1 : node.text.length;
		const nodeEnd: number = pos + nodeLength;

		if (nodeEnd <= from || pos >= to) {
			pos = nodeEnd;
			continue;
		}

		const overlapStart: number = Math.max(pos, from);
		const overlapEnd: number = Math.min(nodeEnd, to);

		if (isInlineNode(node)) {
			if (current) current.to = overlapEnd;
		} else {
			const actual: Mark | undefined = node.marks.find((m) => m.type === markType);
			if (!actual) {
				flush();
			} else if (current && marksEqual(current.mark, actual)) {
				current.to = overlapEnd;
			} else {
				flush();
				current = { from: overlapStart, to: overlapEnd, mark: actual };
			}
		}

		pos = nodeEnd;
	}

	flush();
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
