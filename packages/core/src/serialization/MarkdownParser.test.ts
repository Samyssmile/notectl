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

// --- Helpers ---

/** Structural shape of a block, ignoring auto-generated IDs, for comparison. */
type Shape = { type: string; attrs: Record<string, unknown>; text?: string; children?: Shape[] };

function shape(block: BlockNode): Shape {
	const base: Shape = { type: block.type, attrs: { ...(block.attrs ?? {}) } };
	if (isLeafBlock(block)) return { ...base, text: getBlockText(block) };
	return { ...base, children: getBlockChildren(block).map(shape) };
}

function shapeDoc(doc: Document): Shape[] {
	return doc.children.map(shape);
}

function firstBlock(doc: Document): BlockNode {
	const block = doc.children[0];
	if (!block) throw new Error('expected at least one block');
	return block;
}

// --- Block parsing ---

describe('parseMarkdownToDocument — blocks', () => {
	it('parses ATX headings with levels', () => {
		const doc = parseMarkdownToDocument('# One\n\n### Three');
		expect(shapeDoc(doc)).toEqual([
			{ type: 'heading', attrs: { level: 1 }, text: 'One' },
			{ type: 'heading', attrs: { level: 3 }, text: 'Three' },
		]);
	});

	it('parses setext headings', () => {
		const doc = parseMarkdownToDocument('Title\n=====\n\nSub\n---');
		expect(shapeDoc(doc)).toEqual([
			{ type: 'heading', attrs: { level: 1 }, text: 'Title' },
			{ type: 'heading', attrs: { level: 2 }, text: 'Sub' },
		]);
	});

	it('parses paragraphs and collapses soft breaks to spaces', () => {
		const doc = parseMarkdownToDocument('one\ntwo\n\nthree');
		expect(shapeDoc(doc)).toEqual([
			{ type: 'paragraph', attrs: {}, text: 'one two' },
			{ type: 'paragraph', attrs: {}, text: 'three' },
		]);
	});

	it('parses a fenced code block with a language', () => {
		const doc = parseMarkdownToDocument('```ts\nconst x = 1;\n```');
		expect(shapeDoc(doc)).toEqual([
			{ type: 'code_block', attrs: { language: 'ts' }, text: 'const x = 1;' },
		]);
	});

	it('parses a thematic break', () => {
		const doc = parseMarkdownToDocument('a\n\n---\n\nb');
		expect(shapeDoc(doc).map((s) => s.type)).toEqual(['paragraph', 'horizontal_rule', 'paragraph']);
	});

	it('parses bullet, ordered, and checklist list items', () => {
		const doc = parseMarkdownToDocument('- a\n- b\n\n1. one\n2. two\n\n- [x] done\n- [ ] todo');
		const items = doc.children.map((b) => ({
			type: b.type,
			listType: b.attrs?.listType,
			checked: b.attrs?.checked,
		}));
		expect(items).toEqual([
			{ type: 'list_item', listType: 'bullet', checked: false },
			{ type: 'list_item', listType: 'bullet', checked: false },
			{ type: 'list_item', listType: 'ordered', checked: false },
			{ type: 'list_item', listType: 'ordered', checked: false },
			{ type: 'list_item', listType: 'checklist', checked: true },
			{ type: 'list_item', listType: 'checklist', checked: false },
		]);
	});

	it('derives nesting indent from leading spaces', () => {
		const doc = parseMarkdownToDocument('- top\n  - nested\n    - deeper');
		expect(doc.children.map((b) => b.attrs?.indent)).toEqual([0, 1, 2]);
	});

	it('parses nested blockquotes', () => {
		const doc = parseMarkdownToDocument('> outer\n>\n> > inner');
		const quote = firstBlock(doc);
		expect(quote.type).toBe('blockquote');
		const children = getBlockChildren(quote);
		expect(children[0]?.type).toBe('paragraph');
		expect(getBlockText(children[0] as BlockNode)).toBe('outer');
		expect(children[1]?.type).toBe('blockquote');
	});

	it('applies backslash escapes and decodes entities', () => {
		const doc = parseMarkdownToDocument('\\# not a heading and \\* and &amp;');
		expect(shapeDoc(doc)).toEqual([
			{ type: 'paragraph', attrs: {}, text: '# not a heading and * and &' },
		]);
	});

	it('strips link reference definitions from the output', () => {
		const doc = parseMarkdownToDocument('text\n\n[ref]: https://x.io "Title"');
		expect(shapeDoc(doc)).toEqual([{ type: 'paragraph', attrs: {}, text: 'text' }]);
	});

	it('delegates block-level HTML to the HTML parser', () => {
		const doc = parseMarkdownToDocument('<div>raw html</div>');
		expect(firstBlock(doc).type).toBe('paragraph');
		expect(getBlockText(firstBlock(doc))).toBe('raw html');
	});

	it('treats inline-tag lines as paragraphs, not HTML blocks', () => {
		const doc = parseMarkdownToDocument('<u>underline</u> stays inline');
		// Phase 2 inline parser keeps raw text; the point is it is one paragraph, not an HTML block.
		expect(firstBlock(doc).type).toBe('paragraph');
	});

	it('returns the canonical empty document (one empty paragraph) for empty input', () => {
		const doc = parseMarkdownToDocument('');
		expect(doc.children.length).toBe(1);
		expect(firstBlock(doc).type).toBe('paragraph');
		expect(getBlockText(firstBlock(doc))).toBe('');
	});
});

// --- Block-only round-trip (inline marks/links/tables/images are Phase 3) ---

describe('doc → md → doc round-trip (block-only)', () => {
	function roundTrip(blocks: BlockNode[]): Shape[] {
		const doc = createDocument(blocks);
		const md = serializeDocumentToMarkdown(doc);
		return shapeDoc(parseMarkdownToDocument(md));
	}

	it('preserves headings, paragraphs, code, and hr', () => {
		const blocks = [
			createBlockNode(nodeType('heading'), [createTextNode('Title')], undefined, { level: 1 }),
			createBlockNode(nodeType('paragraph'), [createTextNode('a paragraph')]),
			createBlockNode(nodeType('code_block'), [createTextNode('code()')], undefined, {
				language: 'js',
			}),
			createBlockNode(nodeType('horizontal_rule'), [createTextNode('')]),
		];
		expect(roundTrip(blocks)).toEqual(shapeDoc(createDocument(blocks)));
	});

	it('preserves lists incl. nesting and checklists', () => {
		const item = (text: string, listType: string, indent: number, checked: boolean): BlockNode =>
			createBlockNode(nodeType('list_item'), [createTextNode(text)], undefined, {
				listType,
				indent,
				checked,
			});
		const blocks = [
			item('top', 'bullet', 0, false),
			item('nested', 'bullet', 1, false),
			item('done', 'checklist', 0, true),
		];
		expect(roundTrip(blocks)).toEqual(shapeDoc(createDocument(blocks)));
	});

	it('preserves nested blockquotes', () => {
		const inner = createBlockNode(nodeType('blockquote'), [
			createBlockNode(nodeType('paragraph'), [createTextNode('deep')]),
		]);
		const blocks = [
			createBlockNode(nodeType('blockquote'), [
				createBlockNode(nodeType('paragraph'), [createTextNode('outer')]),
				inner,
			]),
		];
		expect(roundTrip(blocks)).toEqual(shapeDoc(createDocument(blocks)));
	});
});
