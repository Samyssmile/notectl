import { describe, expect, it } from 'vitest';
import {
	type BlockNode,
	type Document,
	type InlineNode,
	type TextNode,
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockChildren,
	getBlockText,
	getInlineChildren,
	isLeafBlock,
} from '../model/Document.js';
import { SchemaRegistry } from '../model/SchemaRegistry.js';
import { markType, nodeType } from '../model/TypeBrands.js';
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

// --- Inline parsing (Phase 3) ---

type InlineShape =
	| { text: string; marks: string[] }
	| { node: string; attrs: Record<string, unknown> };

function inlineOf(markdown: string): InlineShape[] {
	const block = parseMarkdownToDocument(markdown).children[0];
	if (!block) return [];
	return getInlineChildren(block).map((child: TextNode | InlineNode) =>
		'text' in child
			? { text: child.text, marks: child.marks.map((m) => m.type as string) }
			: { node: child.inlineType as string, attrs: child.attrs },
	);
}

describe('parseMarkdownToDocument — inline', () => {
	it('parses bold, italic, and inline code', () => {
		expect(inlineOf('**b**')).toEqual([{ text: 'b', marks: ['bold'] }]);
		expect(inlineOf('*i*')).toEqual([{ text: 'i', marks: ['italic'] }]);
		expect(inlineOf('`c`')).toEqual([{ text: 'c', marks: ['code'] }]);
	});

	it('parses nested strong+emphasis', () => {
		expect(inlineOf('***x***')).toEqual([{ text: 'x', marks: ['italic', 'bold'] }]);
	});

	it('parses emphasis amid plain text', () => {
		expect(inlineOf('a **b** c')).toEqual([
			{ text: 'a ', marks: [] },
			{ text: 'b', marks: ['bold'] },
			{ text: ' c', marks: [] },
		]);
	});

	it('parses GFM strikethrough', () => {
		expect(inlineOf('~~gone~~')).toEqual([{ text: 'gone', marks: ['strikethrough'] }]);
	});

	it('parses an inline link with title', () => {
		expect(inlineOf('[text](https://x.io "T")')).toEqual([{ text: 'text', marks: ['link'] }]);
		const block = parseMarkdownToDocument('[text](https://x.io "T")').children[0] as BlockNode;
		const link = (getInlineChildren(block)[0] as TextNode).marks[0];
		expect(link?.attrs).toEqual({ href: 'https://x.io', title: 'T' });
	});

	it('parses a backslash-escaped quote inside a link title (round-trip with the serializer)', () => {
		// The serializer escapes an embedded `"` as `\"`; the parser must honor that
		// escape so the title round-trips instead of the whole link collapsing to text.
		const block = parseMarkdownToDocument('[x](/u "a\\"b")').children[0] as BlockNode;
		const link = (getInlineChildren(block)[0] as TextNode).marks[0];
		expect(link?.type).toBe('link');
		expect(link?.attrs).toEqual({ href: '/u', title: 'a"b' });
	});

	it('resolves reference links', () => {
		const md = '[text][ref]\n\n[ref]: https://x.io "T"';
		const block = parseMarkdownToDocument(md).children[0] as BlockNode;
		const node = getInlineChildren(block)[0] as TextNode;
		expect(node.text).toBe('text');
		expect(node.marks[0]?.type).toBe('link');
		expect(node.marks[0]?.attrs).toEqual({ href: 'https://x.io', title: 'T' });
	});

	it('parses an autolink', () => {
		const block = parseMarkdownToDocument('<https://x.io>').children[0] as BlockNode;
		const node = getInlineChildren(block)[0] as TextNode;
		expect(node.marks[0]?.type).toBe('link');
		expect(node.marks[0]?.attrs).toEqual({ href: 'https://x.io' });
	});

	it('parses an inline image to an image_inline node', () => {
		expect(inlineOf('a ![alt](pic.png) b')).toEqual([
			{ text: 'a ', marks: [] },
			{ node: 'image_inline', attrs: { src: 'pic.png', alt: 'alt' } },
			{ text: ' b', marks: [] },
		]);
	});

	it('honors backslash escapes (no emphasis)', () => {
		expect(inlineOf('\\*not italic\\*')).toEqual([{ text: '*not italic*', marks: [] }]);
	});

	it('does not create emphasis across intraword underscores', () => {
		expect(inlineOf('a_b_c')).toEqual([{ text: 'a_b_c', marks: [] }]);
	});

	it('parses a hard break inside a paragraph', () => {
		const result = inlineOf('line one\\\nline two');
		expect(result[0]).toEqual({ text: 'line one', marks: [] });
		expect(result[1]).toEqual({ node: 'hard_break', attrs: {} });
		expect(result[2]).toEqual({ text: 'line two', marks: [] });
	});
});

// --- GFM tables & standalone images ---

describe('parseMarkdownToDocument — tables & images', () => {
	it('parses a GFM table into table/row/cell structure', () => {
		const doc = parseMarkdownToDocument('| H1 | H2 |\n| --- | --- |\n| a | b |');
		const table = firstBlock(doc);
		expect(table.type).toBe('table');
		const rows = getBlockChildren(table);
		expect(rows).toHaveLength(2);
		const headerCells = getBlockChildren(rows[0] as BlockNode);
		expect(headerCells).toHaveLength(2);
		expect(headerCells[0]?.type).toBe('table_cell');
		const headerText = getBlockText(getBlockChildren(headerCells[0] as BlockNode)[0] as BlockNode);
		expect(headerText).toBe('H1');
	});

	it('derives column alignment from the delimiter row', () => {
		const doc = parseMarkdownToDocument('| L | C | R |\n| :-- | :-: | --: |\n| a | b | c |');
		const cells = getBlockChildren(getBlockChildren(firstBlock(doc))[0] as BlockNode);
		const align = (cell: BlockNode): unknown =>
			(getBlockChildren(cell)[0] as BlockNode).attrs?.align;
		expect([
			align(cells[0] as BlockNode),
			align(cells[1] as BlockNode),
			align(cells[2] as BlockNode),
		]).toEqual(['start', 'center', 'end']);
	});

	it('promotes a standalone-image line to a block image', () => {
		const doc = parseMarkdownToDocument('![Alt](pic.png "Cap")');
		const block = firstBlock(doc);
		expect(block.type).toBe('image');
		expect(block.attrs).toMatchObject({ src: 'pic.png', alt: 'Alt', title: 'Cap' });
	});

	// A linked inline image `[![alt](src)](url)` must not lose its link. The image
	// stays inline inside a paragraph, carrying a `link` mark, rather than being
	// promoted to a standalone block `image` (which would silently drop the URL).
	it('keeps a linked inline image inline with a link mark (no data loss, #197)', () => {
		const block = firstBlock(parseMarkdownToDocument('[![a](p.png)](/u)'));
		expect(block.type).toBe('paragraph');
		const children = getInlineChildren(block);
		expect(children).toHaveLength(1);
		const img = children[0] as InlineNode;
		expect(img.inlineType).toBe('image_inline');
		expect(img.attrs).toMatchObject({ src: 'p.png', alt: 'a' });
		expect(img.marks.map((m) => m.type)).toEqual(['link']);
		expect(img.marks[0]?.attrs).toEqual({ href: '/u' });
	});

	it('still promotes a bare standalone image (no link) to a block image (#197)', () => {
		expect(firstBlock(parseMarkdownToDocument('![a](p.png)')).type).toBe('image');
	});

	it('round-trips a linked inline image without dropping the link (#197)', () => {
		const md = '[![a](p.png)](/u)';
		const out = serializeDocumentToMarkdown(parseMarkdownToDocument(md)).trim();
		expect(out).toBe(md);
		const img = getInlineChildren(firstBlock(parseMarkdownToDocument(out)))[0] as InlineNode;
		expect(img.marks[0]?.type).toBe('link');
		expect(img.marks[0]?.attrs).toEqual({ href: '/u' });
	});

	it('round-trips a GFM table with alignment', () => {
		const md = '| H1 | H2 |\n| :--- | ---: |\n| a | b |';
		const out = serializeDocumentToMarkdown(parseMarkdownToDocument(md)).trimEnd();
		expect(out).toBe(md);
	});

	it('normalizes ragged body rows to the header column count', () => {
		const doc = parseMarkdownToDocument('| A | B |\n| --- | --- |\n| 1 | 2 | 3 |\n| x |');
		const rows = getBlockChildren(firstBlock(doc));
		// Header plus two body rows, every row exactly two cells (overlong row
		// truncated, short row padded with an empty cell).
		expect(rows.map((r) => getBlockChildren(r as BlockNode).length)).toEqual([2, 2, 2]);
		const cellText = (row: BlockNode, col: number): string =>
			getBlockText(getBlockChildren(getBlockChildren(row)[col] as BlockNode)[0] as BlockNode);
		expect([cellText(rows[1] as BlockNode, 0), cellText(rows[1] as BlockNode, 1)]).toEqual([
			'1',
			'2',
		]);
		expect([cellText(rows[2] as BlockNode, 0), cellText(rows[2] as BlockNode, 1)]).toEqual([
			'x',
			'',
		]);
	});

	it('keeps per-column alignment when padding short rows', () => {
		const doc = parseMarkdownToDocument('| L | R |\n| :-- | --: |\n| only |');
		const shortRow = getBlockChildren(firstBlock(doc))[1] as BlockNode;
		const cells = getBlockChildren(shortRow);
		const align = (cell: BlockNode): unknown =>
			(getBlockChildren(cell)[0] as BlockNode).attrs?.align;
		expect([align(cells[0] as BlockNode), align(cells[1] as BlockNode)]).toEqual(['start', 'end']);
	});
});

// --- Block-only round-trip (tables/images via registry are exercised in e2e) ---

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

// --- Regressions (#192 markdown support) ---

/** Inline content with marks sorted, so assertions don't depend on nesting order. */
function inlineSorted(markdown: string): InlineShape[] {
	return inlineOf(markdown).map((c) =>
		'text' in c ? { text: c.text, marks: [...c.marks].sort() } : c,
	);
}

describe('emphasis: openers_bottom bucketing (#192)', () => {
	it('keeps bold around a partially-italic run', () => {
		// `**a*b*c**` must yield bold over a/b/c with italic only on b. A char-only
		// openers_bottom key (vs. the CommonMark `(char, canOpen, len%3)` bucket)
		// would drop every emphasis here, leaving literal asterisks.
		expect(inlineSorted('**a*b*c**')).toEqual([
			{ text: 'a', marks: ['bold'] },
			{ text: 'b', marks: ['bold', 'italic'] },
			{ text: 'c', marks: ['bold'] },
		]);
	});

	it('round-trips bold-with-italic-middle through serialize → parse', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [
				createTextNode('a', [{ type: markType('bold') }]),
				createTextNode('b', [{ type: markType('bold') }, { type: markType('italic') }]),
				createTextNode('c', [{ type: markType('bold') }]),
			]),
		]);
		const md: string = serializeDocumentToMarkdown(doc);
		expect(inlineSorted(md)).toEqual([
			{ text: 'a', marks: ['bold'] },
			{ text: 'b', marks: ['bold', 'italic'] },
			{ text: 'c', marks: ['bold'] },
		]);
	});
});

describe('emphasis composes with links and images (#198)', () => {
	it('does not duplicate text when a link sits inside emphasis', () => {
		// `**[t](/u)**` previously emitted `t` twice (the wrapper was appended a second
		// time, corrupting its sibling pointers). It must be a single linked, bold `t`.
		expect(inlineSorted('**[t](/u)**')).toEqual([{ text: 't', marks: ['bold', 'link'] }]);
	});

	it('keeps emphasis inside link text', () => {
		// `[**t**](/u)` previously dropped the bold (emphasis was resolved after the
		// bracket contents were detached). The bold must survive alongside the link.
		expect(inlineSorted('[**t**](/u)')).toEqual([{ text: 't', marks: ['bold', 'link'] }]);
	});

	it('resolves emphasis that spans a link boundary', () => {
		expect(inlineSorted('*a [b](/u) c*')).toEqual([
			{ text: 'a ', marks: ['italic'] },
			{ text: 'b', marks: ['italic', 'link'] },
			{ text: ' c', marks: ['italic'] },
		]);
	});

	it('flattens emphasis inside an image alt to plain text', () => {
		expect(inlineOf('a ![**b**](p.png) c')).toEqual([
			{ text: 'a ', marks: [] },
			{ node: 'image_inline', attrs: { src: 'p.png', alt: 'b' } },
			{ text: ' c', marks: [] },
		]);
	});
});

describe('reference links: undefined ref preserves text (#192)', () => {
	it('keeps the bracketed text literally when the reference is undefined', () => {
		// No `[missing]: ...` definition: the whole thing is not a link and must
		// survive as literal text — `parseLinkTarget` must not consume `[missing]`.
		expect(inlineOf('[text][missing]')).toEqual([{ text: '[text][missing]', marks: [] }]);
	});

	it('still resolves a defined collapsed/shortcut reference', () => {
		const block = parseMarkdownToDocument('[text][ref]\n\n[ref]: https://x.io')
			.children[0] as BlockNode;
		const node = getInlineChildren(block)[0] as TextNode;
		expect(node.text).toBe('text');
		expect(node.marks[0]?.type).toBe('link');
	});
});

describe('link reference definitions inside fenced code (#192)', () => {
	it('keeps a definition-shaped line inside a code fence as code', () => {
		const md = '```\n[a]: https://x.io\n```';
		const block = parseMarkdownToDocument(md).children[0] as BlockNode;
		expect(block.type).toBe('code_block');
		expect(getBlockText(block)).toBe('[a]: https://x.io');
	});

	it('still extracts a real definition outside any fence', () => {
		const md = '[a]\n\n[a]: https://x.io';
		const block = parseMarkdownToDocument(md).children[0] as BlockNode;
		const node = getInlineChildren(block)[0] as TextNode;
		expect(node.marks[0]?.type).toBe('link');
		expect(node.marks[0]?.attrs).toEqual({ href: 'https://x.io' });
	});
});

describe('link reference definitions do not interrupt a paragraph (#192)', () => {
	const hasLinkMark = (block: BlockNode): boolean =>
		getInlineChildren(block).some(
			(child) => 'marks' in child && child.marks.some((m) => m.type === markType('link')),
		);

	it('keeps a def-shaped line as paragraph text when it follows paragraph text', () => {
		// CommonMark: a link reference definition cannot interrupt a paragraph, so the
		// second line is a soft continuation of the paragraph, not a definition.
		const doc = parseMarkdownToDocument('foo\n[bar]: /url');
		expect(shapeDoc(doc)).toEqual([{ type: 'paragraph', attrs: {}, text: 'foo [bar]: /url' }]);
	});

	it('does not register a soft-continued def, so a later reference stays literal', () => {
		const doc = parseMarkdownToDocument('foo\n[bar]: /url\n\nsee [bar]');
		expect(shapeDoc(doc)).toEqual([
			{ type: 'paragraph', attrs: {}, text: 'foo [bar]: /url' },
			{ type: 'paragraph', attrs: {}, text: 'see [bar]' },
		]);
		// The continuation was never a definition: `[bar]` must carry no link mark.
		const second = doc.children[1] as BlockNode;
		expect(hasLinkMark(second)).toBe(false);
	});

	it('preserves a def-shaped line directly under a list item', () => {
		const doc = parseMarkdownToDocument('- item\n[bar]: /url');
		expect(shapeDoc(doc)).toEqual([
			{
				type: 'list_item',
				attrs: { listType: 'bullet', indent: 0, checked: false },
				text: 'item',
			},
			{ type: 'paragraph', attrs: {}, text: '[bar]: /url' },
		]);
	});

	it('still resolves a real definition that begins at a block boundary', () => {
		const block = parseMarkdownToDocument('[bar]: /url\n\nsee [bar]').children[0] as BlockNode;
		const link = getInlineChildren(block).find(
			(child): child is TextNode =>
				'marks' in child && child.marks.some((m) => m.type === markType('link')),
		);
		expect(link?.text).toBe('bar');
		expect(link?.marks[0]?.attrs).toEqual({ href: '/url' });
	});

	it('registers consecutive definitions at the document start', () => {
		const block = parseMarkdownToDocument('[a]: /u1\n[b]: /u2\n\n[a] and [b]')
			.children[0] as BlockNode;
		const hrefs = getInlineChildren(block)
			.filter((child): child is TextNode => 'marks' in child)
			.flatMap((child) => child.marks)
			.filter((m) => m.type === markType('link'))
			.map((m) => m.attrs);
		expect(hrefs).toEqual([{ href: '/u1' }, { href: '/u2' }]);
	});
});

describe('htmlFallback round-trip — raw-HTML seam (#192)', () => {
	// The default export mode is `htmlFallback: true`: a superset block the
	// Markdown grammar cannot express is emitted as raw HTML. This pins the seam
	// where the Markdown parser recognizes that embedded raw-HTML block and
	// delegates to `parseHTMLToDocument`, reconstructing the original block.
	// A regression here would silently drop superset content on the default path.
	function createFallbackRegistry(): SchemaRegistry {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'paragraph',
			group: 'block',
			toDOM(node) {
				const el = document.createElement('p');
				el.setAttribute('data-block-id', node.id);
				return el;
			},
		});
		// A superset leaf block with no Markdown representation, so the serializer
		// falls through to its raw-HTML fallback. `div` is both a base-allowed tag
		// and a recognized block-HTML tag, so the parser re-tokenizes it as an HTML
		// block; `sanitize.attrs` keeps `class` alive through sanitization so the
		// parse rule can re-identify the block.
		registry.registerNodeSpec({
			type: 'callout',
			group: 'block',
			sanitize: { attrs: ['class'] },
			toDOM(node) {
				const el = document.createElement('div');
				el.className = 'callout';
				el.setAttribute('data-block-id', node.id);
				return el;
			},
			toHTML: (_node, content) => `<div class="callout">${content}</div>`,
			parseHTML: [
				{
					tag: 'div',
					getAttrs: (el) => (el.classList.contains('callout') ? {} : false),
				},
			],
		});
		return registry;
	}

	it('round-trips a superset block through markdown via the raw-HTML fallback', () => {
		const registry = createFallbackRegistry();
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('before')]),
			createBlockNode(nodeType('callout'), [createTextNode('Heads up')]),
			createBlockNode(nodeType('paragraph'), [createTextNode('after')]),
		]);

		// Default options => htmlFallback is on.
		const markdown: string = serializeDocumentToMarkdown(doc, registry);
		expect(markdown).toContain('<div class="callout">Heads up</div>');

		const reparsed: Document = parseMarkdownToDocument(markdown, registry);

		// Non-vacuous: the middle block must come back as a `callout` (not degrade
		// to a paragraph) with its text intact, and the surrounding paragraphs
		// must survive unchanged.
		expect(shapeDoc(reparsed)).toEqual([
			{ type: 'paragraph', attrs: {}, text: 'before' },
			{ type: 'callout', attrs: {}, text: 'Heads up' },
			{ type: 'paragraph', attrs: {}, text: 'after' },
		]);
	});
});

describe('blockquote depth guard (#192)', () => {
	it('does not overflow the stack on thousands of `>` and preserves content', () => {
		const md = `${'>'.repeat(5000)} x`;
		let doc: Document | undefined;
		expect(() => {
			doc = parseMarkdownToDocument(md);
		}).not.toThrow();
		// Content is preserved: the deep `>` run degrades to literal text, so both
		// the trailing `x` and the `>` characters themselves survive (never dropped).
		const serialized: string = JSON.stringify(doc);
		expect(serialized).toContain('x');
		expect(serialized).toContain('>');
	});
});
