import { describe, expect, it } from 'vitest';
import {
	type BlockNode,
	type Document,
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockChildren,
	getBlockText,
	isLeafBlock,
} from '../model/Document.js';
import { nodeType } from '../model/TypeBrands.js';
import { parseMarkdownToDocument } from './MarkdownParser.js';
import { serializeDocumentToMarkdown } from './MarkdownSerializer.js';

/**
 * Multi-block list items (#194): `list_item` is a hybrid leaf/container block.
 * Single-paragraph items stay leaves (inline children, backward compatible);
 * items holding several blocks (second paragraph, code block, blockquote,
 * heading) become containers with block children. Sibling nesting stays
 * flat-with-indent, but indent now derives from CommonMark content columns
 * (marker-relative), not from floor(columns / 2).
 */

// --- Helpers ---

type Shape = { type: string; attrs: Record<string, unknown>; text?: string; children?: Shape[] };

function shape(block: BlockNode): Shape {
	const base: Shape = { type: block.type, attrs: { ...(block.attrs ?? {}) } };
	if (isLeafBlock(block)) return { ...base, text: getBlockText(block) };
	return { ...base, children: getBlockChildren(block).map(shape) };
}

function shapeDoc(doc: Document): Shape[] {
	return doc.children.map(shape);
}

function item(listType: string, indent: number, body: string | Shape[], checked = false): Shape {
	const base: Shape = { type: 'list_item', attrs: { listType, indent, checked } };
	if (typeof body === 'string') return { ...base, text: body };
	return { ...base, children: body };
}

function p(text: string): Shape {
	return { type: 'paragraph', attrs: {}, text };
}

// --- Import: container items ---

describe('markdown import — multi-block list items become containers (#194)', () => {
	it('parses a second paragraph after a blank line as a child block', () => {
		const doc = parseMarkdownToDocument('- foo\n\n  bar');
		expect(shapeDoc(doc)).toEqual([item('bullet', 0, [p('foo'), p('bar')])]);
	});

	it('keeps a loose list of single-paragraph items as leaf items', () => {
		const doc = parseMarkdownToDocument('- foo\n\n- bar');
		expect(shapeDoc(doc)).toEqual([item('bullet', 0, 'foo'), item('bullet', 0, 'bar')]);
	});

	it('keeps lazy continuation lines as leaf item text', () => {
		const doc = parseMarkdownToDocument('- foo\n  bar\nbaz');
		expect(shapeDoc(doc)).toEqual([item('bullet', 0, 'foo bar baz')]);
	});

	it('parses a fenced code block inside an item', () => {
		const doc = parseMarkdownToDocument('- foo\n\n  ```js\n  code\n  ```');
		expect(shapeDoc(doc)).toEqual([
			item('bullet', 0, [
				p('foo'),
				{ type: 'code_block', attrs: { language: 'js' }, text: 'code' },
			]),
		]);
	});

	it('parses indented code inside an item (content column + 4)', () => {
		const doc = parseMarkdownToDocument('1.  foo\n\n        bar');
		expect(shapeDoc(doc)).toEqual([
			item('ordered', 0, [p('foo'), { type: 'code_block', attrs: { language: '' }, text: 'bar' }]),
		]);
	});

	it('parses a blockquote inside an item', () => {
		const doc = parseMarkdownToDocument('- foo\n\n  > quote');
		expect(shapeDoc(doc)).toEqual([
			item('bullet', 0, [p('foo'), { type: 'blockquote', attrs: {}, children: [p('quote')] }]),
		]);
	});

	it('parses a heading on the marker line as a container child', () => {
		const doc = parseMarkdownToDocument('- # Title');
		expect(shapeDoc(doc)).toEqual([
			item('bullet', 0, [{ type: 'heading', attrs: { level: 1 }, text: 'Title' }]),
		]);
	});

	it('parses a thematic break inside an item', () => {
		const doc = parseMarkdownToDocument('- foo\n\n  ***');
		expect(shapeDoc(doc)).toEqual([
			item('bullet', 0, [p('foo'), { type: 'horizontal_rule', attrs: {}, text: '' }]),
		]);
	});

	it('lazily continues a child paragraph at column zero', () => {
		const doc = parseMarkdownToDocument('- foo\n\n  bar\nbaz');
		expect(shapeDoc(doc)).toEqual([item('bullet', 0, [p('foo'), p('bar baz')])]);
	});

	it('preserves the checked state on checklist containers', () => {
		const doc = parseMarkdownToDocument('- [x] done\n\n  details');
		expect(shapeDoc(doc)).toEqual([item('checklist', 0, [p('done'), p('details')], true)]);
	});
});

// --- Import: content-column indent semantics ---

describe('markdown import — content-column list semantics (#194)', () => {
	it('keeps nested lists as flat siblings with indent', () => {
		const doc = parseMarkdownToDocument('- top\n  - nested\n    - deeper');
		expect(shapeDoc(doc)).toEqual([
			item('bullet', 0, 'top'),
			item('bullet', 1, 'nested'),
			item('bullet', 2, 'deeper'),
		]);
	});

	it('nests a sublist under a wide ordered marker (spec 296)', () => {
		const doc = parseMarkdownToDocument('10) foo\n    - bar');
		expect(shapeDoc(doc)).toEqual([item('ordered', 0, 'foo'), item('bullet', 1, 'bar')]);
	});

	it('reads an under-indented marker after a wide marker as a sibling list (spec 297)', () => {
		const doc = parseMarkdownToDocument('10) foo\n   - bar');
		expect(shapeDoc(doc)).toEqual([item('ordered', 0, 'foo'), item('bullet', 0, 'bar')]);
	});

	it('treats one-to-three leading spaces as the same list level (spec 295)', () => {
		const doc = parseMarkdownToDocument('- foo\n - bar\n  - baz\n   - boo');
		expect(shapeDoc(doc)).toEqual([
			item('bullet', 0, 'foo'),
			item('bullet', 0, 'bar'),
			item('bullet', 0, 'baz'),
			item('bullet', 0, 'boo'),
		]);
	});

	it('parses an ordered item with two leading spaces at indent zero (spec 291)', () => {
		const doc = parseMarkdownToDocument('  1.  A paragraph\n    with two lines.');
		expect(shapeDoc(doc)).toEqual([item('ordered', 0, 'A paragraph with two lines.')]);
	});

	it('reads a four-space marker line as indented code (spec 289)', () => {
		const doc = parseMarkdownToDocument('    1. not a list');
		expect(shapeDoc(doc)).toEqual([
			{ type: 'code_block', attrs: { language: '' }, text: '1. not a list' },
		]);
	});

	it('reads under-indented content after a code-start item as indented code (spec 257)', () => {
		const doc = parseMarkdownToDocument(' -    one\n\n     two');
		expect(shapeDoc(doc)).toEqual([
			item('bullet', 0, 'one'),
			{ type: 'code_block', attrs: { language: '' }, text: ' two' },
		]);
	});

	it('still chains marker-only lines into nested items', () => {
		const doc = parseMarkdownToDocument('- - foo');
		expect(shapeDoc(doc)).toEqual([item('bullet', 0, ''), item('bullet', 1, 'foo')]);
	});

	it('folds an over-indented marker into the open paragraph (spec 238)', () => {
		const doc = parseMarkdownToDocument('> foo\n    - bar');
		expect(shapeDoc(doc)).toEqual([{ type: 'blockquote', attrs: {}, children: [p('foo - bar')] }]);
	});
});

// --- Export ---

describe('markdown export — container list items (#194)', () => {
	function li(
		listType: string,
		indent: number,
		content: BlockNode[] | string,
		checked = false,
	): BlockNode {
		const children = typeof content === 'string' ? [createTextNode(content)] : content;
		return createBlockNode(nodeType('list_item'), children, undefined, {
			listType,
			indent,
			checked,
		});
	}

	function para(text: string): BlockNode {
		return createBlockNode(nodeType('paragraph'), [createTextNode(text)]);
	}

	it('serializes a container item with blank-line separated children', () => {
		const doc = createDocument([li('bullet', 0, [para('foo'), para('bar')])]);
		expect(serializeDocumentToMarkdown(doc)).toBe('- foo\n\n  bar\n');
	});

	it('pads nested items to the parent content column (ordered parent)', () => {
		const doc = createDocument([li('ordered', 0, 'a'), li('bullet', 1, 'b')]);
		expect(serializeDocumentToMarkdown(doc)).toBe('1. a\n   - b\n');
	});

	it('serializes checklist containers with the task marker on the first line only', () => {
		const doc = createDocument([li('checklist', 0, [para('done'), para('details')], true)]);
		expect(serializeDocumentToMarkdown(doc)).toBe('- [x] done\n\n  details\n');
	});

	it('serializes a fenced code child indented to the content column', () => {
		const code = createBlockNode(nodeType('code_block'), [createTextNode('x')], undefined, {
			language: 'js',
		});
		const doc = createDocument([li('bullet', 0, [para('a'), code])]);
		expect(serializeDocumentToMarkdown(doc)).toBe('- a\n\n  ```js\n  x\n  ```\n');
	});

	it('serializes a thematic-break child in the asterisk form', () => {
		const hr = createBlockNode(nodeType('horizontal_rule'), [createTextNode('')]);
		const doc = createDocument([li('bullet', 0, [para('a'), hr])]);
		expect(serializeDocumentToMarkdown(doc)).toBe('- a\n\n  ***\n');
	});

	it('round-trips container items structurally', () => {
		const source = '- foo\n\n  bar\n- baz';
		const doc = parseMarkdownToDocument(source);
		const md = serializeDocumentToMarkdown(doc);
		expect(shapeDoc(parseMarkdownToDocument(md))).toEqual(shapeDoc(doc));
		expect(md).toBe(`${source}\n`);
	});

	it('round-trips a deeply mixed list document to a serialization fixpoint', () => {
		const source = [
			'1. first',
			'',
			'   second paragraph',
			'',
			'   ```',
			'   code',
			'   ```',
			'2. next',
			'   - nested',
			'',
			'     nested detail',
		].join('\n');
		const doc = parseMarkdownToDocument(source);
		const md2 = serializeDocumentToMarkdown(doc);
		const md3 = serializeDocumentToMarkdown(parseMarkdownToDocument(md2));
		expect(md3).toBe(md2);
		expect(shapeDoc(parseMarkdownToDocument(md2))).toEqual(shapeDoc(doc));
	});
});
