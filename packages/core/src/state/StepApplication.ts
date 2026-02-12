/**
 * Pure step-application functions operating on Document.
 * Extracted from EditorState for reuse in TransactionBuilder.
 */

import {
	type BlockNode,
	type ChildNode,
	type Document,
	type InlineNode,
	type Mark,
	type TextNode,
	type TextSegment,
	addMarkToSet,
	createBlockNode,
	createTextNode,
	getBlockLength,
	getInlineChildren,
	isBlockNode,
	isInlineNode,
	isTextNode,
	normalizeInlineContent,
	removeMarkFromSet,
} from '../model/Document.js';
import type {
	AddMarkStep,
	DeleteTextStep,
	InsertInlineNodeStep,
	InsertNodeStep,
	InsertTextStep,
	MergeBlocksStep,
	RemoveInlineNodeStep,
	RemoveMarkStep,
	RemoveNodeStep,
	SetBlockTypeStep,
	SetInlineNodeAttrStep,
	SetNodeAttrStep,
	SplitBlockStep,
	Step,
} from './Transaction.js';

/** Applies a single step to a document and returns the new document. */
export function applyStep(doc: Document, step: Step): Document {
	switch (step.type) {
		case 'insertText':
			return applyInsertText(doc, step);
		case 'deleteText':
			return applyDeleteText(doc, step);
		case 'splitBlock':
			return applySplitBlock(doc, step);
		case 'mergeBlocks':
			return applyMergeBlocks(doc, step);
		case 'addMark':
			return applyAddMark(doc, step);
		case 'removeMark':
			return applyRemoveMark(doc, step);
		case 'setStoredMarks':
			return doc; // Stored marks are handled at the state level, not document
		case 'setBlockType':
			return applySetBlockType(doc, step);
		case 'insertNode':
			return applyInsertNode(doc, step);
		case 'removeNode':
			return applyRemoveNode(doc, step);
		case 'setNodeAttr':
			return applySetNodeAttr(doc, step);
		case 'insertInlineNode':
			return applyInsertInlineNode(doc, step);
		case 'removeInlineNode':
			return applyRemoveInlineNode(doc, step);
		case 'setInlineNodeAttr':
			return applySetInlineNodeAttr(doc, step);
	}
}

function applyInsertText(doc: Document, step: InsertTextStep): Document {
	return mapBlock(doc, step.blockId, (block) => {
		const inlineChildren: readonly (TextNode | InlineNode)[] = getInlineChildren(block);
		const newChildren: (TextNode | InlineNode)[] = step.segments
			? insertSegmentsIntoInlineContent(inlineChildren, step.offset, step.segments)
			: insertTextIntoInlineContent(inlineChildren, step.offset, step.text, step.marks);
		return {
			...block,
			children: replaceInlineChildren(block.children, normalizeInlineContent(newChildren)),
		};
	});
}

function applyDeleteText(doc: Document, step: DeleteTextStep): Document {
	return mapBlock(doc, step.blockId, (block) => {
		const inlineChildren: readonly (TextNode | InlineNode)[] = getInlineChildren(block);
		const newChildren: (TextNode | InlineNode)[] = deleteFromInlineContent(
			inlineChildren,
			step.from,
			step.to,
		);
		return {
			...block,
			children: replaceInlineChildren(block.children, normalizeInlineContent(newChildren)),
		};
	});
}

function applySplitBlock(doc: Document, step: SplitBlockStep): Document {
	// Try at top level first
	const blockIndex: number = doc.children.findIndex((b) => b.id === step.blockId);

	if (blockIndex !== -1) {
		const block: BlockNode | undefined = doc.children[blockIndex];
		if (!block) return doc;
		const inlineChildren: readonly (TextNode | InlineNode)[] = getInlineChildren(block);
		const len: number = getBlockLength(block);
		const nodesBeforeSplit: (TextNode | InlineNode)[] = sliceInlineContent(
			inlineChildren,
			0,
			step.offset,
		);
		const nodesAfterSplit: (TextNode | InlineNode)[] = sliceInlineContent(
			inlineChildren,
			step.offset,
			len,
		);

		const updatedBlock: BlockNode = {
			...block,
			children: normalizeInlineContent(nodesBeforeSplit),
		};
		const newBlock: BlockNode = createBlockNode(
			block.type,
			normalizeInlineContent(nodesAfterSplit),
			step.newBlockId,
			block.attrs,
		);

		const newChildren: BlockNode[] = [...doc.children];
		newChildren.splice(blockIndex, 1, updatedBlock, newBlock);
		return { children: newChildren };
	}

	// Recurse into block children
	return {
		children: doc.children.map((child) => {
			const mapped: BlockNode | null = splitBlockRecursive(child, step);
			return mapped ?? child;
		}),
	};
}

function splitBlockRecursive(node: BlockNode, step: SplitBlockStep): BlockNode | null {
	const idx: number = node.children.findIndex((c) => isBlockNode(c) && c.id === step.blockId);
	if (idx !== -1) {
		const block: BlockNode = node.children[idx] as BlockNode;
		const inlineChildren: readonly (TextNode | InlineNode)[] = getInlineChildren(block);
		const len: number = getBlockLength(block);
		const nodesBeforeSplit: (TextNode | InlineNode)[] = sliceInlineContent(
			inlineChildren,
			0,
			step.offset,
		);
		const nodesAfterSplit: (TextNode | InlineNode)[] = sliceInlineContent(
			inlineChildren,
			step.offset,
			len,
		);

		const updatedBlock: BlockNode = {
			...block,
			children: normalizeInlineContent(nodesBeforeSplit),
		};
		const newBlock: BlockNode = createBlockNode(
			block.type,
			normalizeInlineContent(nodesAfterSplit),
			step.newBlockId,
			block.attrs,
		);

		const newChildren: ChildNode[] = [...node.children] as ChildNode[];
		newChildren.splice(idx, 1, updatedBlock, newBlock);
		return { ...node, children: newChildren };
	}

	// Recurse deeper
	let changed = false;
	const newChildren: ChildNode[] = node.children.map((child) => {
		if (!isBlockNode(child)) return child;
		const mapped: BlockNode | null = splitBlockRecursive(child, step);
		if (mapped) {
			changed = true;
			return mapped;
		}
		return child;
	});

	return changed ? { ...node, children: newChildren } : null;
}

function applyMergeBlocks(doc: Document, step: MergeBlocksStep): Document {
	// Try at top level first
	const targetIndex: number = doc.children.findIndex((b) => b.id === step.targetBlockId);
	const sourceIndex: number = doc.children.findIndex((b) => b.id === step.sourceBlockId);

	if (targetIndex !== -1 && sourceIndex !== -1) {
		const target: BlockNode | undefined = doc.children[targetIndex];
		const source: BlockNode | undefined = doc.children[sourceIndex];
		if (!target || !source) return doc;
		const targetInline: readonly (TextNode | InlineNode)[] = getInlineChildren(target);
		const sourceInline: readonly (TextNode | InlineNode)[] = getInlineChildren(source);
		const mergedChildren: readonly (TextNode | InlineNode)[] = normalizeInlineContent([
			...targetInline,
			...sourceInline,
		]);
		const mergedBlock: BlockNode = { ...target, children: mergedChildren };

		const newChildren: readonly BlockNode[] = doc.children.filter(
			(b) => b.id !== step.sourceBlockId,
		);
		return {
			children: newChildren.map((b) => (b.id === step.targetBlockId ? mergedBlock : b)),
		};
	}

	// Recurse into block children
	return {
		children: doc.children.map((child) => {
			const mapped: BlockNode | null = mergeBlocksRecursive(child, step);
			return mapped ?? child;
		}),
	};
}

function mergeBlocksRecursive(node: BlockNode, step: MergeBlocksStep): BlockNode | null {
	const targetIdx: number = node.children.findIndex(
		(c) => isBlockNode(c) && c.id === step.targetBlockId,
	);
	const sourceIdx: number = node.children.findIndex(
		(c) => isBlockNode(c) && c.id === step.sourceBlockId,
	);

	if (targetIdx !== -1 && sourceIdx !== -1) {
		const target: BlockNode = node.children[targetIdx] as BlockNode;
		const source: BlockNode = node.children[sourceIdx] as BlockNode;
		const targetInline: readonly (TextNode | InlineNode)[] = getInlineChildren(target);
		const sourceInline: readonly (TextNode | InlineNode)[] = getInlineChildren(source);
		const mergedChildren: readonly (TextNode | InlineNode)[] = normalizeInlineContent([
			...targetInline,
			...sourceInline,
		]);
		const mergedBlock: BlockNode = { ...target, children: mergedChildren };

		const filtered: ChildNode[] = node.children.filter(
			(c) => !isBlockNode(c) || c.id !== step.sourceBlockId,
		);
		const result: ChildNode[] = filtered.map((c) =>
			isBlockNode(c) && c.id === step.targetBlockId ? mergedBlock : c,
		);
		return { ...node, children: result };
	}

	// Recurse deeper
	let changed = false;
	const newChildren: ChildNode[] = node.children.map((child) => {
		if (!isBlockNode(child)) return child;
		const mapped: BlockNode | null = mergeBlocksRecursive(child, step);
		if (mapped) {
			changed = true;
			return mapped;
		}
		return child;
	});

	return changed ? { ...node, children: newChildren } : null;
}

function applyAddMark(doc: Document, step: AddMarkStep): Document {
	return mapBlock(doc, step.blockId, (block) => {
		const inlineChildren: readonly (TextNode | InlineNode)[] = getInlineChildren(block);
		const newChildren: (TextNode | InlineNode)[] = applyMarkToInlineContent(
			inlineChildren,
			step.from,
			step.to,
			step.mark,
			true,
		);
		return {
			...block,
			children: replaceInlineChildren(block.children, normalizeInlineContent(newChildren)),
		};
	});
}

function applyRemoveMark(doc: Document, step: RemoveMarkStep): Document {
	return mapBlock(doc, step.blockId, (block) => {
		const inlineChildren: readonly (TextNode | InlineNode)[] = getInlineChildren(block);
		const newChildren: (TextNode | InlineNode)[] = applyMarkToInlineContent(
			inlineChildren,
			step.from,
			step.to,
			step.mark,
			false,
		);
		return {
			...block,
			children: replaceInlineChildren(block.children, normalizeInlineContent(newChildren)),
		};
	});
}

// --- InlineNode Step Application ---

function applyInsertInlineNode(doc: Document, step: InsertInlineNodeStep): Document {
	return mapBlock(doc, step.blockId, (block) => {
		const inlineChildren: readonly (TextNode | InlineNode)[] = getInlineChildren(block);
		const newChildren: (TextNode | InlineNode)[] = insertInlineNodeAtOffset(
			inlineChildren,
			step.offset,
			step.node,
		);
		return {
			...block,
			children: replaceInlineChildren(block.children, normalizeInlineContent(newChildren)),
		};
	});
}

function applyRemoveInlineNode(doc: Document, step: RemoveInlineNodeStep): Document {
	return mapBlock(doc, step.blockId, (block) => {
		const inlineChildren: readonly (TextNode | InlineNode)[] = getInlineChildren(block);
		const newChildren: (TextNode | InlineNode)[] = removeInlineNodeAtOffset(
			inlineChildren,
			step.offset,
		);
		return {
			...block,
			children: replaceInlineChildren(block.children, normalizeInlineContent(newChildren)),
		};
	});
}

function applySetInlineNodeAttr(doc: Document, step: SetInlineNodeAttrStep): Document {
	return mapBlock(doc, step.blockId, (block) => {
		const inlineChildren: readonly (TextNode | InlineNode)[] = getInlineChildren(block);
		const newChildren: (TextNode | InlineNode)[] = setInlineNodeAttrsAtOffset(
			inlineChildren,
			step.offset,
			step.attrs,
		);
		return {
			...block,
			children: replaceInlineChildren(block.children, newChildren),
		};
	});
}

// --- Helpers ---

function mapBlock(doc: Document, blockId: string, fn: (block: BlockNode) => BlockNode): Document {
	return {
		children: mapBlockInChildren(doc.children, blockId, fn) as BlockNode[],
	};
}

function mapBlockInChildren(
	children: readonly ChildNode[],
	blockId: string,
	fn: (block: BlockNode) => BlockNode,
): ChildNode[] {
	return children.map((child) => {
		if (!isBlockNode(child)) return child;
		if (child.id === blockId) return fn(child);
		// Recurse into block children
		const mappedChildren: ChildNode[] = mapBlockInChildren(child.children, blockId, fn);
		if (mappedChildren === child.children) return child;
		return { ...child, children: mappedChildren };
	});
}

/**
 * Replaces the inline content children of a ChildNode array,
 * preserving any BlockNode children in their original positions.
 */
function replaceInlineChildren(
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

/**
 * Inserts text into mixed inline content at the given offset.
 * Handles both TextNode and InlineNode children.
 */
function insertTextIntoInlineContent(
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
function insertSegmentsIntoInlineContent(
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
function deleteFromInlineContent(
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
function sliceInlineContent(
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
function applyMarkToInlineContent(
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
function insertInlineNodeAtOffset(
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
function removeInlineNodeAtOffset(
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
function setInlineNodeAttrsAtOffset(
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

function applySetBlockType(doc: Document, step: SetBlockTypeStep): Document {
	return mapBlock(doc, step.blockId, (block) => ({
		...block,
		type: step.nodeType,
		...(step.attrs ? { attrs: step.attrs } : { attrs: undefined }),
	}));
}

// --- Structural Step Application ---

function applyInsertNode(doc: Document, step: InsertNodeStep): Document {
	if (step.parentPath.length === 0) {
		// Insert at document root
		const newChildren: BlockNode[] = [...doc.children];
		newChildren.splice(step.index, 0, step.node);
		return { children: newChildren };
	}

	return mapNodeByPath(doc, step.parentPath, (parent) => {
		const newChildren: ChildNode[] = [...parent.children];
		newChildren.splice(step.index, 0, step.node);
		return { ...parent, children: newChildren };
	});
}

function applyRemoveNode(doc: Document, step: RemoveNodeStep): Document {
	if (step.parentPath.length === 0) {
		// Remove from document root
		const newChildren: BlockNode[] = [...doc.children];
		newChildren.splice(step.index, 1);
		return { children: newChildren };
	}

	return mapNodeByPath(doc, step.parentPath, (parent) => {
		const newChildren: ChildNode[] = [...parent.children];
		newChildren.splice(step.index, 1);
		return { ...parent, children: newChildren };
	});
}

function applySetNodeAttr(doc: Document, step: SetNodeAttrStep): Document {
	const nodeId: string | undefined = step.path[step.path.length - 1];
	if (!nodeId) return doc;

	return mapBlock(doc, nodeId, (block) => ({
		...block,
		attrs: step.attrs,
	}));
}

/**
 * Maps a node at the given path, replacing it with the result of fn.
 * Navigates down the path immutably, creating new parent nodes as needed.
 */
function mapNodeByPath(
	doc: Document,
	path: readonly string[],
	fn: (node: BlockNode) => BlockNode,
): Document {
	if (path.length === 0) return doc;

	const rootId: string | undefined = path[0];
	if (!rootId) return doc;
	return {
		children: doc.children.map((child) => {
			if (!isBlockNode(child) || child.id !== rootId) return child;
			if (path.length === 1) return fn(child);
			return mapNodeByPathRecursive(child, path, 1, fn);
		}),
	};
}

function mapNodeByPathRecursive(
	node: BlockNode,
	path: readonly string[],
	depth: number,
	fn: (node: BlockNode) => BlockNode,
): BlockNode {
	const targetId: string | undefined = path[depth];
	if (!targetId) return node;
	const newChildren: ChildNode[] = node.children.map((child) => {
		if (!isBlockNode(child) || child.id !== targetId) return child;
		if (depth === path.length - 1) return fn(child);
		return mapNodeByPathRecursive(child, path, depth + 1, fn);
	});
	return { ...node, children: newChildren };
}
