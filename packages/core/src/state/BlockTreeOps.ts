/**
 * Pure functions for recursive block-tree traversal and transformation.
 * Extracted from StepApplication.ts to keep files under ~500 lines.
 */

import { type BlockNode, type ChildNode, type Document, isBlockNode } from '../model/Document.js';

/** Finds a block by ID anywhere in the tree and applies a transform. */
export function mapBlock(
	doc: Document,
	blockId: string,
	fn: (block: BlockNode) => BlockNode,
): Document {
	return {
		children: mapBlockInChildren(doc.children, blockId, fn) as BlockNode[],
	};
}

/** Recursively maps over children to find and transform a block by ID. */
export function mapBlockInChildren(
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
 * Maps a node at the given path, replacing it with the result of fn.
 * Navigates down the path immutably, creating new parent nodes as needed.
 */
export function mapNodeByPath(
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

/** Recursive helper for mapNodeByPath — walks one level deeper. */
export function mapNodeByPathRecursive(
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

/**
 * Searches children for a level where `predicate` matches,
 * then applies `transform` at that level.
 * Recurses into nested BlockNodes if not found at the current level.
 *
 * Returns `null` if no matching level was found.
 */
export function findAndTransformChildren(
	children: readonly ChildNode[],
	predicate: (children: readonly ChildNode[]) => boolean,
	transform: (children: readonly ChildNode[]) => readonly ChildNode[],
): readonly ChildNode[] | null {
	if (predicate(children)) {
		return transform(children);
	}

	let changed = false;
	const newChildren: ChildNode[] = children.map((child) => {
		if (!isBlockNode(child)) return child;
		const result: readonly ChildNode[] | null = findAndTransformChildren(
			child.children,
			predicate,
			transform,
		);
		if (result) {
			changed = true;
			return { ...child, children: result };
		}
		return child;
	});

	return changed ? newChildren : null;
}
