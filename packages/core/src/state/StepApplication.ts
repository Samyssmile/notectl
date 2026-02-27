/**
 * Pure step-application functions operating on Document.
 * Extracted from EditorState for reuse in TransactionBuilder.
 */

import {
	type BlockNode,
	type ChildNode,
	type Document,
	type InlineNode,
	type TextNode,
	createBlockNode,
	getBlockLength,
	getInlineChildren,
	isBlockNode,
	normalizeInlineContent,
} from '../model/Document.js';
import { findAndTransformChildren, mapBlock, mapNodeByPath } from './BlockTreeOps.js';
import {
	applyMarkToInlineContent,
	deleteFromInlineContent,
	insertInlineNodeAtOffset,
	insertSegmentsIntoInlineContent,
	insertTextIntoInlineContent,
	removeInlineNodeAtOffset,
	replaceInlineChildren,
	setInlineNodeAttrsAtOffset,
	sliceInlineContent,
} from './InlineContentOps.js';
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
	const splitAtLevel = (children: readonly ChildNode[]): readonly ChildNode[] => {
		const blockIndex: number = children.findIndex((c) => isBlockNode(c) && c.id === step.blockId);
		if (blockIndex === -1) return children;

		const block: BlockNode = children[blockIndex] as BlockNode;
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

		const result: ChildNode[] = [...children];
		result.splice(blockIndex, 1, updatedBlock, newBlock);
		return result;
	};

	const hasTarget = (children: readonly ChildNode[]): boolean =>
		children.some((c) => isBlockNode(c) && c.id === step.blockId);

	const transformed: readonly ChildNode[] | null = findAndTransformChildren(
		doc.children,
		hasTarget,
		splitAtLevel,
	);
	return transformed ? { children: transformed as BlockNode[] } : doc;
}

function applyMergeBlocks(doc: Document, step: MergeBlocksStep): Document {
	const mergeAtLevel = (children: readonly ChildNode[]): readonly ChildNode[] => {
		const targetIdx: number = children.findIndex(
			(c) => isBlockNode(c) && c.id === step.targetBlockId,
		);
		const sourceIdx: number = children.findIndex(
			(c) => isBlockNode(c) && c.id === step.sourceBlockId,
		);
		if (targetIdx === -1 || sourceIdx === -1) return children;

		const target: BlockNode = children[targetIdx] as BlockNode;
		const source: BlockNode = children[sourceIdx] as BlockNode;
		const targetInline: readonly (TextNode | InlineNode)[] = getInlineChildren(target);
		const sourceInline: readonly (TextNode | InlineNode)[] = getInlineChildren(source);
		const mergedChildren: readonly (TextNode | InlineNode)[] = normalizeInlineContent([
			...targetInline,
			...sourceInline,
		]);
		const mergedBlock: BlockNode = { ...target, children: mergedChildren };

		const filtered: ChildNode[] = children.filter(
			(c) => !isBlockNode(c) || c.id !== step.sourceBlockId,
		);
		return filtered.map((c) => (isBlockNode(c) && c.id === step.targetBlockId ? mergedBlock : c));
	};

	const hasTargetAndSource = (children: readonly ChildNode[]): boolean =>
		children.some((c) => isBlockNode(c) && c.id === step.targetBlockId) &&
		children.some((c) => isBlockNode(c) && c.id === step.sourceBlockId);

	const transformed: readonly ChildNode[] | null = findAndTransformChildren(
		doc.children,
		hasTargetAndSource,
		mergeAtLevel,
	);
	return transformed ? { children: transformed as BlockNode[] } : doc;
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
