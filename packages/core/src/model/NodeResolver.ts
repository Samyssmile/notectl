/**
 * Utilities for resolving nodes by path within the document tree.
 * Supports both flat and recursive (nested) document structures.
 */

import type { BlockNode, Document } from './Document.js';
import { isBlockNode } from './Document.js';

/**
 * Resolves a node in the document tree by its path (array of block IDs).
 * The path traces the lineage from the root block down to the target.
 */
export function resolveNodeByPath(doc: Document, path: readonly string[]): BlockNode | undefined {
	if (path.length === 0) return undefined;

	let current: BlockNode | undefined = doc.children.find((b) => b.id === path[0]);
	if (!current) return undefined;

	for (let i = 1; i < path.length; i++) {
		const childId = path[i];
		if (!childId) return undefined;
		const next: BlockNode | undefined = current?.children.find(
			(c): c is BlockNode => isBlockNode(c) && c.id === childId,
		);
		if (!next) return undefined;
		current = next;
	}

	return current;
}

/**
 * Resolves the parent of a node at the given path.
 * Returns the parent container (Document or BlockNode) and the child's index within it.
 */
export function resolveParentByPath(
	doc: Document,
	path: readonly string[],
): { parent: Document | BlockNode; index: number } | undefined {
	if (path.length === 0) return undefined;

	if (path.length === 1) {
		const index = doc.children.findIndex((b) => b.id === path[0]);
		if (index === -1) return undefined;
		return { parent: doc, index };
	}

	const parentPath = path.slice(0, -1);
	const parent = resolveNodeByPath(doc, parentPath);
	if (!parent) return undefined;

	const childId = path[path.length - 1];
	if (!childId) return undefined;
	const index = parent.children.findIndex(
		(c): c is BlockNode => isBlockNode(c) && c.id === childId,
	);
	if (index === -1) return undefined;

	return { parent, index };
}

/**
 * Finds the path (array of block IDs) to a node by its ID.
 * Performs recursive DFS through the document tree.
 */
export function findNodePath(doc: Document, nodeId: string): string[] | undefined {
	for (const block of doc.children) {
		if (block.id === nodeId) return [nodeId];

		const subPath = findNodePathInBlock(block, nodeId);
		if (subPath) return [block.id, ...subPath];
	}
	return undefined;
}

function findNodePathInBlock(block: BlockNode, nodeId: string): string[] | undefined {
	for (const child of block.children) {
		if (!isBlockNode(child)) continue;
		if (child.id === nodeId) return [nodeId];

		const subPath = findNodePathInBlock(child, nodeId);
		if (subPath) return [child.id, ...subPath];
	}
	return undefined;
}

/**
 * Walks all block nodes in the document tree in depth-first order.
 * Visits every BlockNode, including nested ones, with their full path.
 */
export function walkNodes(
	doc: Document,
	callback: (node: BlockNode, path: string[]) => void,
): void {
	for (const block of doc.children) {
		walkNodeRecursive(block, [block.id], callback);
	}
}

function walkNodeRecursive(
	node: BlockNode,
	path: string[],
	callback: (node: BlockNode, path: string[]) => void,
): void {
	callback(node, path);
	for (const child of node.children) {
		if (isBlockNode(child)) {
			walkNodeRecursive(child, [...path, child.id], callback);
		}
	}
}

/**
 * Finds a block node by ID anywhere in the document tree (recursive DFS).
 */
export function findNode(doc: Document, nodeId: string): BlockNode | undefined {
	for (const block of doc.children) {
		if (block.id === nodeId) return block;
		const found = findNodeInBlock(block, nodeId);
		if (found) return found;
	}
	return undefined;
}

function findNodeInBlock(block: BlockNode, nodeId: string): BlockNode | undefined {
	for (const child of block.children) {
		if (!isBlockNode(child)) continue;
		if (child.id === nodeId) return child;
		const found = findNodeInBlock(child, nodeId);
		if (found) return found;
	}
	return undefined;
}

/**
 * Finds a block node and returns it together with its path.
 */
export function findNodeWithPath(
	doc: Document,
	nodeId: string,
): { node: BlockNode; path: string[] } | undefined {
	const path = findNodePath(doc, nodeId);
	if (!path) return undefined;
	const node = resolveNodeByPath(doc, path);
	if (!node) return undefined;
	return { node, path };
}
