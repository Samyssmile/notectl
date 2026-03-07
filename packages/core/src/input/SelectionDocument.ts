/**
 * Builds a document fragment for a text selection while preserving composite
 * block structure (for example tables) and trimming only the selected leaf content.
 */

import type { BlockNode, Document, InlineNode, TextNode } from '../model/Document.js';
import {
	createTextNode,
	getBlockChildren,
	getBlockContentSegmentsInRange,
	getBlockLength,
	isLeafBlock,
	normalizeInlineContent,
} from '../model/Document.js';
import type { Selection } from '../model/Selection.js';
import { selectionRange } from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';

interface SelectionBoundary {
	readonly firstBlockId: BlockId;
	readonly firstOffset: number;
	readonly lastBlockId: BlockId;
	readonly lastOffset: number;
	readonly selectedLeafIds: ReadonlySet<BlockId>;
}

/**
 * Creates a partial document containing only the selected content.
 * Composite ancestors are preserved, while first/last leaf blocks are trimmed
 * to the exact selection offsets.
 */
export function buildSelectionDocument(state: EditorState, selection: Selection): Document {
	const blockOrder = state.getBlockOrder();
	const range = selectionRange(selection, blockOrder);
	const fromIdx: number = blockOrder.indexOf(range.from.blockId);
	const toIdx: number = blockOrder.indexOf(range.to.blockId);
	if (fromIdx === -1 || toIdx === -1 || fromIdx > toIdx) {
		return { children: [] };
	}

	const fromPath = state.getNodePath(range.from.blockId);
	const toPath = state.getNodePath(range.to.blockId);
	const fromRootId = fromPath?.[0];
	const toRootId = toPath?.[0];
	if (!fromRootId || !toRootId) {
		return { children: [] };
	}

	const fromRootIdx: number = state.doc.children.findIndex((child) => child.id === fromRootId);
	const toRootIdx: number = state.doc.children.findIndex((child) => child.id === toRootId);
	if (fromRootIdx === -1 || toRootIdx === -1 || fromRootIdx > toRootIdx) {
		return { children: [] };
	}

	const boundary: SelectionBoundary = {
		firstBlockId: range.from.blockId,
		firstOffset: range.from.offset,
		lastBlockId: range.to.blockId,
		lastOffset: range.to.offset,
		selectedLeafIds: new Set(blockOrder.slice(fromIdx, toIdx + 1)),
	};

	const children: BlockNode[] = [];
	for (let i = fromRootIdx; i <= toRootIdx; i++) {
		const root = state.doc.children[i];
		if (!root) continue;
		const sliced = sliceBlock(root, boundary);
		if (sliced) children.push(sliced);
	}

	return { children };
}

function sliceBlock(block: BlockNode, boundary: SelectionBoundary): BlockNode | null {
	if (isLeafBlock(block)) {
		if (!boundary.selectedLeafIds.has(block.id)) return null;
		return sliceLeafBlock(block, boundary);
	}

	const blockChildren: readonly BlockNode[] = getBlockChildren(block);
	const slicedChildren: BlockNode[] = [];
	let changed = blockChildren.length !== block.children.length;

	for (const child of blockChildren) {
		const slicedChild = sliceBlock(child, boundary);
		if (slicedChild) {
			slicedChildren.push(slicedChild);
			if (slicedChild !== child) changed = true;
		} else {
			changed = true;
		}
	}

	if (slicedChildren.length === 0) return null;
	if (!changed) return block;

	return {
		...block,
		children: slicedChildren,
	};
}

function sliceLeafBlock(block: BlockNode, boundary: SelectionBoundary): BlockNode {
	const fullLength: number = getBlockLength(block);
	const from: number = block.id === boundary.firstBlockId ? boundary.firstOffset : 0;
	const to: number = block.id === boundary.lastBlockId ? boundary.lastOffset : fullLength;

	if (from === 0 && to === fullLength) {
		return block;
	}

	const segments = getBlockContentSegmentsInRange(block, from, to);
	const children: readonly (TextNode | InlineNode)[] = normalizeInlineContent(
		segments.map((segment) =>
			segment.kind === 'inline' ? segment.node : createTextNode(segment.text, segment.marks),
		),
	);

	return {
		...block,
		children,
	};
}
