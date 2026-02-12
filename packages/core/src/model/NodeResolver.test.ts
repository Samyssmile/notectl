import { describe, expect, it } from 'vitest';
import { createBlockNode, createDocument, createTextNode } from './Document.js';
import {
	findNode,
	findNodePath,
	findNodeWithPath,
	resolveNodeByPath,
	resolveParentByPath,
	walkNodes,
} from './NodeResolver.js';

function flatDoc() {
	return createDocument([
		createBlockNode('paragraph', [createTextNode('hello')], 'b1'),
		createBlockNode('paragraph', [createTextNode('world')], 'b2'),
	]);
}

describe('NodeResolver — flat documents', () => {
	it('resolveNodeByPath finds top-level block', () => {
		const doc = flatDoc();
		const node = resolveNodeByPath(doc, ['b1']);
		expect(node).toBeDefined();
		expect(node?.id).toBe('b1');
	});

	it('resolveNodeByPath returns undefined for empty path', () => {
		expect(resolveNodeByPath(flatDoc(), [])).toBeUndefined();
	});

	it('resolveNodeByPath returns undefined for unknown id', () => {
		expect(resolveNodeByPath(flatDoc(), ['xxx'])).toBeUndefined();
	});

	it('resolveParentByPath returns Document as parent for top-level block', () => {
		const doc = flatDoc();
		const result = resolveParentByPath(doc, ['b1']);
		expect(result).toBeDefined();
		expect(result?.index).toBe(0);
		expect('children' in (result?.parent ?? {})).toBe(true);
	});

	it('findNodePath finds top-level block', () => {
		const path = findNodePath(flatDoc(), 'b2');
		expect(path).toEqual(['b2']);
	});

	it('findNodePath returns undefined for unknown id', () => {
		expect(findNodePath(flatDoc(), 'xxx')).toBeUndefined();
	});

	it('walkNodes visits all blocks', () => {
		const visited: string[] = [];
		walkNodes(flatDoc(), (node) => visited.push(node.id));
		expect(visited).toEqual(['b1', 'b2']);
	});

	it('findNode finds block by id', () => {
		const node = findNode(flatDoc(), 'b2');
		expect(node).toBeDefined();
		expect(node?.id).toBe('b2');
	});

	it('findNodeWithPath returns node and path', () => {
		const result = findNodeWithPath(flatDoc(), 'b1');
		expect(result).toBeDefined();
		expect(result?.node.id).toBe('b1');
		expect(result?.path).toEqual(['b1']);
	});
});
