/**
 * Selection validation against a document.
 *
 * Every selection that enters an EditorState passes through here: referenced
 * blocks must exist and offsets must be in bounds. Void blocks (images,
 * horizontal rules) cannot host a caret, so a text position never settles on
 * one: a collapsed cursor that would land there becomes a NodeSelection of
 * that block, and fallbacks prefer the first block that can hold text. A range
 * may still start or end on a void block, which then counts as wholly selected.
 */

import type { BlockNode, ChildNode, Document } from '../model/Document.js';
import { getBlockLength, isBlockNode, isLeafBlock } from '../model/Document.js';
import { findNode, findNodePath } from '../model/NodeResolver.js';
import type { Schema } from '../model/Schema.js';
import { isVoidNodeType } from '../model/Schema.js';
import type { EditorSelection, Position } from '../model/Selection.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	createPosition,
	createSelection,
	isGapCursor,
	isNodeSelection,
} from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';

/** Validates a selection: blockIds must exist, offsets stay in bounds, void blocks never host a caret. */
export function validateSelection(
	doc: Document,
	schema: Schema,
	sel: EditorSelection,
): EditorSelection {
	if (isNodeSelection(sel)) {
		return findNode(doc, sel.nodeId) ? sel : (homeSelection(doc, schema) ?? sel);
	}
	if (isGapCursor(sel)) {
		return findNode(doc, sel.blockId) ? sel : (homeSelection(doc, schema) ?? sel);
	}

	const anchor: Position = validatePosition(doc, schema, sel.anchor);
	const head: Position = validatePosition(doc, schema, sel.head);
	if (anchor.blockId === head.blockId && isVoidBlockId(doc, schema, anchor.blockId)) {
		return nodeSelectionOf(doc, anchor.blockId);
	}
	if (anchor === sel.anchor && head === sel.head) return sel;
	return createSelection(anchor, head);
}

/**
 * The selection a document rests on when nothing better is known: a caret at
 * the start of the first block that can hold text, else the first (void) leaf
 * selected as a node. `null` for a document without leaf blocks.
 */
export function homeSelection(doc: Document, schema: Schema): EditorSelection | null {
	const leaf: BlockNode | null = findCaretLeaf(doc.children, schema);
	if (!leaf) return null;
	if (isVoidNodeType(schema, leaf.type)) return nodeSelectionOf(doc, leaf.id);
	return createCollapsedSelection(leaf.id, 0);
}

/** Validates a position: clamps the offset on a leaf, otherwise settles on the nearest caret leaf. */
function validatePosition(doc: Document, schema: Schema, pos: Position): Position {
	const block: BlockNode | undefined = findNode(doc, pos.blockId);
	if (block && isLeafBlock(block)) return clampOffset(block, pos);

	// A container block or a vanished block: prefer a leaf inside the container,
	// then anywhere in the document.
	const scope: readonly ChildNode[] = block ? block.children : doc.children;
	const leaf: BlockNode | null =
		findCaretLeaf(scope, schema) ?? (block ? findCaretLeaf(doc.children, schema) : null);
	return leaf ? createPosition(leaf.id, 0) : pos;
}

/** Clamps a leaf position's offset into `[0, blockLength]`, keeping the object when already valid. */
function clampOffset(block: BlockNode, pos: Position): Position {
	const length: number = getBlockLength(block);
	const finiteOffset: number = Number.isFinite(pos.offset) ? Math.trunc(pos.offset) : 0;
	const offset: number = Math.max(0, Math.min(length, finiteOffset));
	if (offset === pos.offset) return pos;
	return createPosition(pos.blockId, offset, pos.path);
}

/**
 * The first leaf below `children` that can hold a caret; when every leaf is
 * void, the first void leaf (to be selected as a node by the caller).
 */
function findCaretLeaf(children: readonly ChildNode[], schema: Schema): BlockNode | null {
	return (
		findLeaf(children, (leaf) => !isVoidNodeType(schema, leaf.type)) ??
		findLeaf(children, () => true)
	);
}

/** Depth-first search for the first leaf block accepted by `accept`. */
function findLeaf(
	children: readonly ChildNode[],
	accept: (leaf: BlockNode) => boolean,
): BlockNode | null {
	for (const child of children) {
		if (!isBlockNode(child)) continue;
		if (isLeafBlock(child)) {
			if (accept(child)) return child;
			continue;
		}
		const nested: BlockNode | null = findLeaf(child.children, accept);
		if (nested) return nested;
	}
	return null;
}

function isVoidBlockId(doc: Document, schema: Schema, id: BlockId): boolean {
	const block: BlockNode | undefined = findNode(doc, id);
	return block !== undefined && isVoidNodeType(schema, block.type);
}

function nodeSelectionOf(doc: Document, id: BlockId): EditorSelection {
	const path: readonly string[] = findNodePath(doc, id) ?? [];
	return createNodeSelection(id, path as readonly BlockId[]);
}
