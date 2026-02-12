import { describe, expect, it } from 'vitest';
import {
	addMarkToSet,
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
	generateBlockId,
	getBlockContentSegmentsInRange,
	getBlockLength,
	getBlockMarksAtOffset,
	getBlockText,
	getContentAtOffset,
	getInlineChildren,
	getTextChildren,
	hasMark,
	isBlockNode,
	isInlineNode,
	isLeafBlock,
	isTextNode,
	markSetsEqual,
	normalizeInlineContent,
	normalizeTextNodes,
	removeMarkFromSet,
	walkInlineContent,
} from './Document.js';
import type { InlineNode, Mark, TextNode } from './Document.js';
import { inlineType } from './TypeBrands.js';

describe('Document model', () => {
	describe('createTextNode', () => {
		it('creates a text node with empty marks', () => {
			const node = createTextNode('hello');
			expect(node.type).toBe('text');
			expect(node.text).toBe('hello');
			expect(node.marks).toEqual([]);
		});

		it('creates a text node with marks', () => {
			const node = createTextNode('bold', [{ type: 'bold' }]);
			expect(node.marks).toEqual([{ type: 'bold' }]);
		});
	});

	describe('createBlockNode', () => {
		it('creates a paragraph block with default empty text child', () => {
			const block = createBlockNode('paragraph');
			expect(block.type).toBe('paragraph');
			expect(block.children).toHaveLength(1);
			expect(getTextChildren(block)[0]?.text).toBe('');
		});

		it('creates a block with given children', () => {
			const children = [createTextNode('hello')];
			const block = createBlockNode('paragraph', children);
			expect(getTextChildren(block)[0]?.text).toBe('hello');
		});

		it('generates unique IDs', () => {
			const a = createBlockNode('paragraph');
			const b = createBlockNode('paragraph');
			expect(a.id).not.toBe(b.id);
		});

		it('generated IDs start with block- prefix', () => {
			const block = createBlockNode('paragraph');
			expect(block.id).toMatch(/^block-/);
		});
	});

	describe('generateBlockId', () => {
		it('produces unique IDs across many generations', () => {
			const ids = new Set<string>();
			for (let i = 0; i < 1000; i++) {
				ids.add(generateBlockId());
			}
			expect(ids.size).toBe(1000);
		});

		it('starts with block- prefix', () => {
			const id = generateBlockId();
			expect(id).toMatch(/^block-/);
		});
	});

	describe('createDocument', () => {
		it('creates a document with a default empty paragraph', () => {
			const doc = createDocument();
			expect(doc.children).toHaveLength(1);
			expect(doc.children[0]?.type).toBe('paragraph');
		});

		it('creates a document with given blocks', () => {
			const blocks = [
				createBlockNode('paragraph', [createTextNode('first')]),
				createBlockNode('paragraph', [createTextNode('second')]),
			];
			const doc = createDocument(blocks);
			expect(doc.children).toHaveLength(2);
		});
	});

	describe('type guards', () => {
		it('isTextNode returns true for text nodes', () => {
			expect(isTextNode(createTextNode('hi'))).toBe(true);
		});

		it('isTextNode returns false for non-text objects', () => {
			expect(isTextNode({ type: 'paragraph', id: '1', children: [] })).toBe(false);
			expect(isTextNode(null)).toBe(false);
			expect(isTextNode('string')).toBe(false);
		});

		it('isBlockNode returns true for block nodes', () => {
			expect(isBlockNode(createBlockNode('paragraph'))).toBe(true);
		});

		it('isBlockNode returns false for text nodes', () => {
			expect(isBlockNode(createTextNode('hi'))).toBe(false);
		});

		it('isBlockNode returns false for inline nodes', () => {
			const inline: InlineNode = createInlineNode(inlineType('image'));
			expect(isBlockNode(inline)).toBe(false);
		});
	});

	describe('getBlockText', () => {
		it('concatenates text from all children', () => {
			const block = createBlockNode('paragraph', [
				createTextNode('hello '),
				createTextNode('world'),
			]);
			expect(getBlockText(block)).toBe('hello world');
		});

		it('skips InlineNodes', () => {
			const block = createBlockNode('paragraph', [
				createTextNode('before'),
				createInlineNode(inlineType('emoji'), { name: 'smile' }),
				createTextNode('after'),
			]);
			expect(getBlockText(block)).toBe('beforeafter');
		});
	});

	describe('getBlockLength', () => {
		it('returns total text length', () => {
			const block = createBlockNode('paragraph', [createTextNode('abc'), createTextNode('de')]);
			expect(getBlockLength(block)).toBe(5);
		});

		it('counts InlineNodes as width 1', () => {
			const block = createBlockNode('paragraph', [
				createTextNode('ab'),
				createInlineNode(inlineType('image')),
				createTextNode('cd'),
			]);
			// 2 + 1 + 2 = 5
			expect(getBlockLength(block)).toBe(5);
		});
	});

	describe('getBlockMarksAtOffset', () => {
		it('returns marks at offset within a node', () => {
			const block = createBlockNode('paragraph', [
				createTextNode('plain'),
				createTextNode('bold', [{ type: 'bold' }]),
			]);
			expect(getBlockMarksAtOffset(block, 0)).toEqual([]);
			expect(getBlockMarksAtOffset(block, 5)).toEqual([{ type: 'bold' }]);
		});

		it('returns last node marks at end of block', () => {
			const block = createBlockNode('paragraph', [createTextNode('text', [{ type: 'italic' }])]);
			expect(getBlockMarksAtOffset(block, 4)).toEqual([{ type: 'italic' }]);
		});

		it('returns empty marks at InlineNode offset', () => {
			const block = createBlockNode('paragraph', [
				createTextNode('ab', [{ type: 'bold' }]),
				createInlineNode(inlineType('image')),
				createTextNode('cd'),
			]);
			// offset 2 is the InlineNode
			expect(getBlockMarksAtOffset(block, 2)).toEqual([]);
			// offset 3 is 'c' in the second text node
			expect(getBlockMarksAtOffset(block, 3)).toEqual([]);
		});
	});

	describe('mark utilities', () => {
		const bold: Mark = { type: 'bold' };
		const italic: Mark = { type: 'italic' };

		it('hasMark finds marks in set', () => {
			expect(hasMark([bold, italic], 'bold')).toBe(true);
			expect(hasMark([italic], 'bold')).toBe(false);
		});

		it('markSetsEqual compares mark sets', () => {
			expect(markSetsEqual([bold, italic], [italic, bold])).toBe(true);
			expect(markSetsEqual([bold], [italic])).toBe(false);
			expect(markSetsEqual([bold], [bold, italic])).toBe(false);
		});

		it('addMarkToSet adds without duplicates', () => {
			expect(addMarkToSet([], bold)).toEqual([bold]);
			expect(addMarkToSet([bold], bold)).toEqual([bold]);
			expect(addMarkToSet([bold], italic)).toEqual([bold, italic]);
		});

		it('removeMarkFromSet removes by type', () => {
			expect(removeMarkFromSet([bold, italic], 'bold')).toEqual([italic]);
			expect(removeMarkFromSet([italic], 'bold')).toEqual([italic]);
		});
	});

	describe('normalizeTextNodes', () => {
		it('merges adjacent nodes with same marks', () => {
			const nodes = [
				createTextNode('hel', [{ type: 'bold' }]),
				createTextNode('lo', [{ type: 'bold' }]),
			];
			const result = normalizeTextNodes(nodes);
			expect(result).toHaveLength(1);
			expect(result[0]?.text).toBe('hello');
		});

		it('keeps nodes with different marks separate', () => {
			const nodes = [createTextNode('hello', [{ type: 'bold' }]), createTextNode(' world')];
			const result = normalizeTextNodes(nodes);
			expect(result).toHaveLength(2);
		});

		it('returns single empty text node for empty array', () => {
			const result = normalizeTextNodes([]);
			expect(result).toHaveLength(1);
			expect(result[0]?.text).toBe('');
		});
	});

	// --- InlineNode tests ---

	describe('createInlineNode', () => {
		it('creates an InlineNode with given type and attrs', () => {
			const node: InlineNode = createInlineNode(inlineType('image'), {
				src: 'test.png',
			});
			expect(node.type).toBe('inline');
			expect(node.inlineType).toBe('image');
			expect(node.attrs).toEqual({ src: 'test.png' });
		});

		it('creates an InlineNode with empty attrs by default', () => {
			const node: InlineNode = createInlineNode(inlineType('emoji'));
			expect(node.attrs).toEqual({});
		});
	});

	describe('isInlineNode', () => {
		it('returns true for InlineNodes', () => {
			expect(isInlineNode(createInlineNode(inlineType('img')))).toBe(true);
		});

		it('returns false for TextNodes', () => {
			expect(isInlineNode(createTextNode('hi'))).toBe(false);
		});

		it('returns false for BlockNodes', () => {
			expect(isInlineNode(createBlockNode('paragraph'))).toBe(false);
		});

		it('returns false for null/undefined', () => {
			expect(isInlineNode(null)).toBe(false);
			expect(isInlineNode(undefined)).toBe(false);
		});
	});

	describe('getInlineChildren', () => {
		it('returns TextNode and InlineNode children, excludes BlockNode', () => {
			const inline: InlineNode = createInlineNode(inlineType('img'));
			const text: TextNode = createTextNode('hello');
			const nested: import('./Document.js').BlockNode = createBlockNode('paragraph');
			const block = createBlockNode('wrapper', [text, inline, nested]);
			const result = getInlineChildren(block);
			expect(result).toHaveLength(2);
			expect(result[0]).toBe(text);
			expect(result[1]).toBe(inline);
		});
	});

	describe('isLeafBlock', () => {
		it('returns true for text-only blocks', () => {
			const block = createBlockNode('paragraph', [createTextNode('hi')]);
			expect(isLeafBlock(block)).toBe(true);
		});

		it('returns true for blocks with InlineNodes and TextNodes', () => {
			const block = createBlockNode('paragraph', [
				createTextNode('a'),
				createInlineNode(inlineType('img')),
				createTextNode('b'),
			]);
			expect(isLeafBlock(block)).toBe(true);
		});

		it('returns false for blocks with nested BlockNodes', () => {
			const block = createBlockNode('wrapper', [
				createBlockNode('paragraph', [createTextNode('hi')]),
			]);
			expect(isLeafBlock(block)).toBe(false);
		});
	});

	describe('walkInlineContent', () => {
		it('yields TextNodes with correct offset ranges', () => {
			const children: (TextNode | InlineNode)[] = [createTextNode('ab'), createTextNode('cde')];
			const entries = [...walkInlineContent(children)];
			expect(entries).toHaveLength(2);
			expect(entries[0]).toEqual({ child: children[0], from: 0, to: 2 });
			expect(entries[1]).toEqual({ child: children[1], from: 2, to: 5 });
		});

		it('yields InlineNodes with width 1', () => {
			const inline: InlineNode = createInlineNode(inlineType('img'));
			const children: (TextNode | InlineNode)[] = [
				createTextNode('ab'),
				inline,
				createTextNode('cd'),
			];
			const entries = [...walkInlineContent(children)];
			expect(entries).toHaveLength(3);
			expect(entries[0]).toEqual({ child: children[0], from: 0, to: 2 });
			expect(entries[1]).toEqual({ child: inline, from: 2, to: 3 });
			expect(entries[2]).toEqual({ child: children[2], from: 3, to: 5 });
		});
	});

	describe('getContentAtOffset', () => {
		it('returns text char at offset', () => {
			const block = createBlockNode('paragraph', [createTextNode('hello')]);
			const result = getContentAtOffset(block, 0);
			expect(result).toEqual({ kind: 'text', char: 'h', marks: [] });
		});

		it('returns InlineNode at offset', () => {
			const inline: InlineNode = createInlineNode(inlineType('img'));
			const block = createBlockNode('paragraph', [
				createTextNode('ab'),
				inline,
				createTextNode('cd'),
			]);
			const result = getContentAtOffset(block, 2);
			expect(result).toEqual({ kind: 'inline', node: inline });
		});

		it('returns null past end of content', () => {
			const block = createBlockNode('paragraph', [createTextNode('hi')]);
			expect(getContentAtOffset(block, 2)).toBeNull();
		});
	});

	describe('normalizeInlineContent', () => {
		it('merges adjacent TextNodes with same marks', () => {
			const nodes: (TextNode | InlineNode)[] = [
				createTextNode('a', [{ type: 'bold' }]),
				createTextNode('b', [{ type: 'bold' }]),
			];
			const result = normalizeInlineContent(nodes);
			expect(result).toHaveLength(1);
			expect(isTextNode(result[0]) && result[0].text).toBe('ab');
		});

		it('preserves InlineNodes between text', () => {
			const inline: InlineNode = createInlineNode(inlineType('img'));
			const nodes: (TextNode | InlineNode)[] = [createTextNode('a'), inline, createTextNode('b')];
			const result = normalizeInlineContent(nodes);
			expect(result).toHaveLength(3);
			expect(result[1]).toBe(inline);
		});

		it('removes empty TextNodes adjacent to InlineNodes', () => {
			const inline: InlineNode = createInlineNode(inlineType('img'));
			const nodes: (TextNode | InlineNode)[] = [createTextNode(''), inline, createTextNode('text')];
			const result = normalizeInlineContent(nodes);
			// Empty text node before inline should be removed
			expect(result).toHaveLength(2);
			expect(isInlineNode(result[0])).toBe(true);
			expect(isTextNode(result[1]) && result[1].type === 'text').toBe(true);
		});

		it('returns empty TextNode for empty input', () => {
			const result = normalizeInlineContent([]);
			expect(result).toHaveLength(1);
			expect(isTextNode(result[0]) && result[0].type === 'text').toBe(true);
		});

		it('prepends empty TextNode if only InlineNodes remain', () => {
			const inline: InlineNode = createInlineNode(inlineType('img'));
			const nodes: (TextNode | InlineNode)[] = [createTextNode(''), inline];
			const result = normalizeInlineContent(nodes);
			// Should have at least one TextNode
			expect(result.some((n) => isTextNode(n))).toBe(true);
		});
	});

	describe('getBlockContentSegmentsInRange', () => {
		it('returns text segments for text-only content', () => {
			const block = createBlockNode('paragraph', [createTextNode('hello', [{ type: 'bold' }])]);
			const segs = getBlockContentSegmentsInRange(block, 0, 5);
			expect(segs).toEqual([{ kind: 'text', text: 'hello', marks: [{ type: 'bold' }] }]);
		});

		it('returns inline segments for InlineNodes', () => {
			const inline: InlineNode = createInlineNode(inlineType('img'));
			const block = createBlockNode('paragraph', [
				createTextNode('ab'),
				inline,
				createTextNode('cd'),
			]);
			const segs = getBlockContentSegmentsInRange(block, 0, 5);
			expect(segs).toHaveLength(3);
			expect(segs[0]).toEqual({ kind: 'text', text: 'ab', marks: [] });
			expect(segs[1]).toEqual({ kind: 'inline', node: inline });
			expect(segs[2]).toEqual({ kind: 'text', text: 'cd', marks: [] });
		});

		it('returns partial ranges correctly', () => {
			const inline: InlineNode = createInlineNode(inlineType('img'));
			const block = createBlockNode('paragraph', [
				createTextNode('ab'),
				inline,
				createTextNode('cd'),
			]);
			// Range [1, 4] = 'b', inline, 'c'
			const segs = getBlockContentSegmentsInRange(block, 1, 4);
			expect(segs).toHaveLength(3);
			expect(segs[0]).toEqual({ kind: 'text', text: 'b', marks: [] });
			expect(segs[1]).toEqual({ kind: 'inline', node: inline });
			expect(segs[2]).toEqual({ kind: 'text', text: 'c', marks: [] });
		});
	});
});
