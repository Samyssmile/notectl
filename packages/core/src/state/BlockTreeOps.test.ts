import { describe, expect, it } from 'vitest';
import { createBlockNode, createTextNode, isBlockNode } from '../model/Document.js';
import type { BlockNode, ChildNode, Document } from '../model/Document.js';
import { blockId, nodeType } from '../model/TypeBrands.js';
import {
	findAndTransformChildren,
	mapBlock,
	mapBlockInChildren,
	mapNodeByPath,
	mapNodeByPathRecursive,
} from './BlockTreeOps.js';

function makeBlock(id: string, text: string): BlockNode {
	return createBlockNode(nodeType('paragraph'), [createTextNode(text)], blockId(id));
}

function makeParent(id: string, children: ChildNode[]): BlockNode {
	return createBlockNode(nodeType('container'), children, blockId(id));
}

describe('BlockTreeOps', () => {
	describe('mapBlock', () => {
		it('transforms a top-level block by ID', () => {
			const doc: Document = { children: [makeBlock('b1', 'hello')] };
			const result: Document = mapBlock(doc, 'b1', (block) => ({
				...block,
				type: nodeType('heading'),
			}));
			expect(result.children[0]?.type).toBe('heading');
		});

		it('transforms a nested block by ID', () => {
			const nested: BlockNode = makeBlock('b2', 'inner');
			const parent: BlockNode = makeParent('b1', [nested]);
			const doc: Document = { children: [parent] };
			const result: Document = mapBlock(doc, 'b2', (block) => ({
				...block,
				type: nodeType('heading'),
			}));
			const child: ChildNode | undefined = result.children[0]?.children[0];
			expect(child && isBlockNode(child) && child.type).toBe('heading');
		});

		it('returns unchanged doc when block not found', () => {
			const doc: Document = { children: [makeBlock('b1', 'hello')] };
			const result: Document = mapBlock(doc, 'missing', (block) => ({
				...block,
				type: nodeType('heading'),
			}));
			expect(result.children[0]?.type).toBe('paragraph');
		});
	});

	describe('mapBlockInChildren', () => {
		it('maps the matching child', () => {
			const children: ChildNode[] = [makeBlock('b1', 'a'), makeBlock('b2', 'b')];
			const result: ChildNode[] = mapBlockInChildren(children, 'b2', (block) => ({
				...block,
				type: nodeType('heading'),
			}));
			const second: ChildNode | undefined = result[1];
			const first: ChildNode | undefined = result[0];
			if (!first || !second) return;
			expect(isBlockNode(second) && second.type).toBe('heading');
			expect(isBlockNode(first) && first.type).toBe('paragraph'); // untouched
		});
	});

	describe('mapNodeByPath', () => {
		it('maps a node at a single-element path', () => {
			const doc: Document = { children: [makeBlock('b1', 'hello')] };
			const result: Document = mapNodeByPath(doc, ['b1'], (node) => ({
				...node,
				type: nodeType('heading'),
			}));
			expect(result.children[0]?.type).toBe('heading');
		});

		it('maps a deeply nested node', () => {
			const deep: BlockNode = makeBlock('b3', 'deep');
			const mid: BlockNode = makeParent('b2', [deep]);
			const top: BlockNode = makeParent('b1', [mid]);
			const doc: Document = { children: [top] };
			const result: Document = mapNodeByPath(doc, ['b1', 'b2', 'b3'], (node) => ({
				...node,
				type: nodeType('heading'),
			}));
			const b2: ChildNode | undefined = result.children[0]?.children[0];
			const b3: ChildNode | undefined = b2 && isBlockNode(b2) ? b2.children[0] : undefined;
			expect(b3 && isBlockNode(b3) && b3.type).toBe('heading');
		});

		it('returns unchanged doc for empty path', () => {
			const doc: Document = { children: [makeBlock('b1', 'hello')] };
			const result: Document = mapNodeByPath(doc, [], (node) => ({
				...node,
				type: nodeType('heading'),
			}));
			expect(result).toBe(doc);
		});
	});

	describe('mapNodeByPathRecursive', () => {
		it('navigates to the target at the given depth', () => {
			const child: BlockNode = makeBlock('b2', 'inner');
			const parent: BlockNode = makeParent('b1', [child]);
			const result: BlockNode = mapNodeByPathRecursive(parent, ['b1', 'b2'], 1, (node) => ({
				...node,
				type: nodeType('heading'),
			}));
			const mapped: ChildNode | undefined = result.children[0];
			expect(mapped && isBlockNode(mapped) && mapped.type).toBe('heading');
		});
	});

	describe('findAndTransformChildren', () => {
		it('transforms at the top level when predicate matches', () => {
			const children: ChildNode[] = [makeBlock('b1', 'a'), makeBlock('b2', 'b')];
			const result: readonly ChildNode[] | null = findAndTransformChildren(
				children,
				(c) => c.some((n) => isBlockNode(n) && n.id === 'b1'),
				(c) => c.filter((n) => !isBlockNode(n) || n.id !== 'b2'),
			);
			expect(result).toHaveLength(1);
			const first: ChildNode | undefined = result?.[0];
			if (!first) return;
			expect(isBlockNode(first) && first.id).toBe('b1');
		});

		it('recurses into nested blocks', () => {
			const inner: ChildNode[] = [makeBlock('b2', 'a'), makeBlock('b3', 'b')];
			const parent: BlockNode = makeParent('b1', inner);
			const result: readonly ChildNode[] | null = findAndTransformChildren(
				[parent],
				(c) => c.some((n) => isBlockNode(n) && n.id === 'b2'),
				(c) => c.filter((n) => !isBlockNode(n) || n.id !== 'b3'),
			);
			expect(result).toHaveLength(1);
			const updated: ChildNode | undefined = result?.[0];
			if (!updated) return;
			expect(isBlockNode(updated) && updated.children).toHaveLength(1);
		});

		it('returns null when predicate never matches', () => {
			const children: ChildNode[] = [makeBlock('b1', 'a')];
			const result: readonly ChildNode[] | null = findAndTransformChildren(
				children,
				(c) => c.some((n) => isBlockNode(n) && n.id === 'missing'),
				(c) => c,
			);
			expect(result).toBeNull();
		});
	});
});
