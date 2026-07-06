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
import { SchemaRegistry } from '../model/SchemaRegistry.js';
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

// --- Review fixes (#194 hardening): grammar agreement, escaping, laziness ---

describe('markdown list hardening (#194 review fixes)', () => {
	function li(listType: string, indent: number, content: BlockNode[] | string): BlockNode {
		const children = typeof content === 'string' ? [createTextNode(content)] : content;
		return createBlockNode(nodeType('list_item'), children, undefined, {
			listType,
			indent,
			checked: false,
		});
	}

	// Defect 1: the serializer must not emit a marker at >= 4 leading columns (the
	// parser reads that as indented code, merging the item into its predecessor or
	// dropping its marker). Orphan indents normalize a level; content is preserved.
	it('round-trips an orphan-indent item without merging it into its predecessor', () => {
		const doc = createDocument([li('bullet', 0, 'a'), li('bullet', 3, 'c')]);
		const md = serializeDocumentToMarkdown(doc);
		expect(md).toBe('- a\n  - c\n');
		expect(shapeDoc(parseMarkdownToDocument(md))).toEqual([
			item('bullet', 0, 'a'),
			item('bullet', 1, 'c'),
		]);
		// Serialization fixpoint: a second round-trip is stable.
		expect(serializeDocumentToMarkdown(parseMarkdownToDocument(md))).toBe(md);
	});

	it('serializes a single orphan indent-2 item as a valid top-level marker', () => {
		const doc = createDocument([li('bullet', 2, 'x')]);
		const md = serializeDocumentToMarkdown(doc);
		expect(md).toBe('- x\n');
		expect(shapeDoc(parseMarkdownToDocument(md))).toEqual([item('bullet', 0, 'x')]);
	});

	// Defect 2: leaf item content is block-tokenized on re-import, so a leaf whose
	// text opens with a block marker must be line-start escaped to stay a leaf.
	it.each([['# not a heading'], ['- not a sublist'], ['1. not ordered'], ['> not a quote']])(
		'keeps leaf text %j a leaf across a round-trip',
		(text) => {
			const doc = createDocument([li('bullet', 0, text)]);
			const md = serializeDocumentToMarkdown(doc);
			expect(shapeDoc(parseMarkdownToDocument(md))).toEqual([item('bullet', 0, text)]);
		},
	);

	// Defect 4: an indented line cannot start a code block while a paragraph is
	// open, so it continues the paragraph — and a following column-zero line lazily
	// continues it too, rather than leaking out of the list.
	it('keeps a lazy continuation after an over-indented line inside the item', () => {
		const doc = parseMarkdownToDocument('- foo\n      bar\nbaz');
		expect(shapeDoc(doc)).toEqual([item('bullet', 0, 'foo bar baz')]);
	});
});

// --- Review fix (#194): schema-invalid nesting is repaired, not produced ---

describe('markdown list schema repair (#194 review fix)', () => {
	function createListTableRegistry(): SchemaRegistry {
		const registry = new SchemaRegistry();
		const dom = (tag: string) => (node: BlockNode) => {
			const el = document.createElement(tag);
			el.setAttribute('data-block-id', node.id);
			return el;
		};
		registry.registerNodeSpec({ type: 'paragraph', group: 'block', toDOM: dom('p') });
		registry.registerNodeSpec({
			type: 'list_item',
			group: 'block',
			content: {
				allow: ['text', 'paragraph', 'heading', 'code_block', 'blockquote', 'horizontal_rule'],
			},
			attrs: {
				listType: { default: 'bullet' },
				indent: { default: 0 },
				checked: { default: false },
			},
			toDOM: dom('li'),
		});
		registry.registerNodeSpec({
			type: 'blockquote',
			group: 'block',
			content: { allow: ['paragraph', 'list_item', 'blockquote', 'horizontal_rule', 'code_block'] },
			toDOM: dom('blockquote'),
		});
		registry.registerNodeSpec({
			type: 'table',
			group: 'block',
			content: { allow: ['table_row'] },
			toDOM: dom('table'),
		});
		registry.registerNodeSpec({
			type: 'table_row',
			content: { allow: ['table_cell'] },
			toDOM: dom('tr'),
		});
		registry.registerNodeSpec({
			type: 'table_cell',
			content: { allow: ['paragraph'] },
			toDOM: dom('td'),
		});
		return registry;
	}

	// Defect 5: a table indented under a list item does not fit the flat item
	// model; it is hoisted to a valid sibling instead of building list_item > table.
	it('hoists a table nested under an item out to a sibling', () => {
		const src = '- foo\n\n  | a | b |\n  | --- | --- |\n  | 1 | 2 |';
		const doc = parseMarkdownToDocument(src, createListTableRegistry());
		expect(doc.children.map((b) => b.type)).toEqual(['list_item', 'table']);
		// The item keeps its text and holds no table.
		const item0 = doc.children[0] as BlockNode;
		expect(isLeafBlock(item0)).toBe(true);
		expect(getBlockText(item0)).toBe('foo');
		expect(shape(doc.children[1] as BlockNode).children?.[0]?.type).toBe('table_row');
	});

	// Compound case: the table must bubble past a container that also forbids it
	// (blockquote), all the way to a valid ancestor (the document root).
	it('bubbles a table out of a list item nested in a blockquote to the root', () => {
		const src = '> - foo\n>\n>   | a | b |\n>   | --- | --- |\n>   | 1 | 2 |';
		const doc = parseMarkdownToDocument(src, createListTableRegistry());
		expect(doc.children.map((b) => b.type)).toEqual(['blockquote', 'table']);
		const quote = doc.children[0] as BlockNode;
		const nestedTypes = getBlockChildren(quote).flatMap((c) =>
			getBlockChildren(c).map((g) => g.type),
		);
		expect(nestedTypes).not.toContain('table');
	});
});
