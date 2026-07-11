/**
 * Per-step apply functions: each transforms a Document by applying a single
 * Step of the matching type. Dispatch lives in `StepHandlers.ts`, which pairs
 * each function with its inverse counterpart in `StepInversion.ts`.
 */

import {
	type BlockAttrs,
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
import type { NodeTypeName } from '../model/TypeBrands.js';
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
} from './Transaction.js';

export function applyInsertText(doc: Document, step: InsertTextStep): Document {
	return mapBlockInlineContent(doc, step.blockId, (inline) =>
		step.segments
			? insertSegmentsIntoInlineContent(inline, step.offset, step.segments)
			: insertTextIntoInlineContent(inline, step.offset, step.text, step.marks),
	);
}

export function applyDeleteText(doc: Document, step: DeleteTextStep): Document {
	return mapBlockInlineContent(doc, step.blockId, (inline) =>
		deleteFromInlineContent(inline, step.from, step.to),
	);
}

export function applySplitBlock(doc: Document, step: SplitBlockStep): Document {
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

		// When the step carries overrides (typically produced by inverting a
		// cross-type merge), use the captured source identity verbatim so
		// undo restores the original block. An absent override means the new
		// block inherits the target block's type/attrs, matching the natural
		// outcome of a user-initiated split.
		const hasOverride: boolean = step.newBlockType !== undefined;
		const newType: NodeTypeName = step.newBlockType ?? block.type;
		const newAttrs: BlockAttrs | undefined = hasOverride ? step.newBlockAttrs : block.attrs;

		const newBlock: BlockNode = createBlockNode(
			newType,
			normalizeInlineContent(nodesAfterSplit),
			step.newBlockId,
			newAttrs,
			step.newBlockHTMLId,
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

export function applyMergeBlocks(doc: Document, step: MergeBlocksStep): Document {
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

export function applyAddMark(doc: Document, step: AddMarkStep): Document {
	return mapBlockInlineContent(doc, step.blockId, (inline) =>
		applyMarkToInlineContent(inline, step.from, step.to, step.mark, true),
	);
}

export function applyRemoveMark(doc: Document, step: RemoveMarkStep): Document {
	return mapBlockInlineContent(doc, step.blockId, (inline) =>
		applyMarkToInlineContent(inline, step.from, step.to, step.mark, false),
	);
}

/**
 * Stored marks live on EditorState, not on the Document, so applying this
 * step at the document level is a no-op. The state-level update happens in
 * `EditorState.apply()`.
 */
export function applySetStoredMarks(doc: Document): Document {
	return doc;
}

// --- InlineNode Step Application ---

export function applyInsertInlineNode(doc: Document, step: InsertInlineNodeStep): Document {
	return mapBlockInlineContent(doc, step.blockId, (inline) =>
		insertInlineNodeAtOffset(inline, step.offset, step.node),
	);
}

export function applyRemoveInlineNode(doc: Document, step: RemoveInlineNodeStep): Document {
	return mapBlockInlineContent(doc, step.blockId, (inline) =>
		removeInlineNodeAtOffset(inline, step.offset),
	);
}

export function applySetInlineNodeAttr(doc: Document, step: SetInlineNodeAttrStep): Document {
	return mapBlockInlineContent(
		doc,
		step.blockId,
		(inline) => setInlineNodeAttrsAtOffset(inline, step.offset, step.attrs),
		false,
	);
}

/** Maps inline content of a block, optionally normalizing the result. */
function mapBlockInlineContent(
	doc: Document,
	blockId: string,
	fn: (inline: readonly (TextNode | InlineNode)[]) => (TextNode | InlineNode)[],
	normalize = true,
): Document {
	return mapBlock(doc, blockId, (block) => {
		const inlineChildren: readonly (TextNode | InlineNode)[] = getInlineChildren(block);
		const newChildren: (TextNode | InlineNode)[] = fn(inlineChildren);
		return {
			...block,
			children: replaceInlineChildren(
				block.children,
				normalize ? normalizeInlineContent(newChildren) : newChildren,
			),
		};
	});
}

export function applySetBlockType(doc: Document, step: SetBlockTypeStep): Document {
	return mapBlock(doc, step.blockId, (block) => {
		const { attrs: _previousAttrs, ...rest } = block;
		return {
			...rest,
			type: step.nodeType,
			...(step.attrs ? { attrs: step.attrs } : {}),
		};
	});
}

// --- Structural Step Application ---

export function applyInsertNode(doc: Document, step: InsertNodeStep): Document {
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

export function applyRemoveNode(doc: Document, step: RemoveNodeStep): Document {
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

export function applySetNodeAttr(doc: Document, step: SetNodeAttrStep): Document {
	const nodeId: string | undefined = step.path[step.path.length - 1];
	if (!nodeId) return doc;

	return mapBlock(doc, nodeId, (block) => ({
		...block,
		attrs: step.attrs,
	}));
}
