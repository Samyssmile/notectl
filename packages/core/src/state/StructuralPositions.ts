/** Shared position contracts for structural builders and step application. */

import type { BlockNode, ChildNode, Document } from '../model/Document.js';
import { isBlockNode } from '../model/Document.js';
import { resolveNodeByPath } from '../model/NodeResolver.js';
import type { BlockId } from '../model/TypeBrands.js';

type Operation = 'insertNode' | 'removeNode';

function positionError(
	operation: Operation,
	parentPath: readonly BlockId[],
	index: number,
	reason: string,
): Error {
	return new Error(
		`${operation} at parent path [${parentPath.join(', ')}], index ${index}: ${reason}`,
	);
}

function validateIndex(operation: Operation, parentPath: readonly BlockId[], index: number): void {
	if (!Number.isInteger(index) || index < 0) {
		throw positionError(operation, parentPath, index, 'expected a nonnegative integer.');
	}
}

function requireChildren(
	doc: Document,
	operation: Operation,
	parentPath: readonly BlockId[],
	index: number,
): readonly ChildNode[] {
	validateIndex(operation, parentPath, index);
	if (parentPath.length === 0) return doc.children;
	const parent = resolveNodeByPath(doc, parentPath);
	if (!parent) throw positionError(operation, parentPath, index, 'parent does not exist.');
	return parent.children;
}

/** Manual builders can validate the number; document bounds are checked on application. */
export function validateInsertPosition(
	doc: Document | null,
	parentPath: readonly BlockId[],
	index: number,
): void {
	validateIndex('insertNode', parentPath, index);
	if (!doc) return;
	const children = requireChildren(doc, 'insertNode', parentPath, index);
	if (index > children.length) {
		throw positionError(
			'insertNode',
			parentPath,
			index,
			`expected an index in 0 … ${children.length}.`,
		);
	}
}

/** Removal must address an existing block, and replay must still address that block's ID. */
export function requireRemovalTarget(
	doc: Document,
	parentPath: readonly BlockId[],
	index: number,
	expectedId?: BlockId,
): BlockNode {
	const children = requireChildren(doc, 'removeNode', parentPath, index);
	const node = children[index];
	if (!node || !isBlockNode(node)) {
		throw positionError('removeNode', parentPath, index, 'no block exists at this position.');
	}
	if (expectedId !== undefined && node.id !== expectedId) {
		throw positionError(
			'removeNode',
			parentPath,
			index,
			`expected block "${expectedId}", found "${node.id}".`,
		);
	}
	return node;
}
