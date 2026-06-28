import { describe, expect, it } from 'vitest';
import {
	type BlockNode,
	type InlineNode,
	type Mark,
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
} from '../model/Document.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { inlineType, markType, nodeType } from '../model/TypeBrands.js';
import { serializeDocumentToMarkdown } from './MarkdownSerializer.js';

// --- Helpers ---

function para(text: string, marks?: Mark[]): BlockNode {
	return createBlockNode(nodeType('paragraph'), [createTextNode(text, marks ?? [])]);
}

function mark(type: string, attrs?: Record<string, string | number | boolean>): Mark {
	return attrs ? { type: markType(type), attrs } : { type: markType(type) };
}

function listItem(
	text: string,
	attrs: { listType?: string; indent?: number; checked?: boolean },
): BlockNode {
	return createBlockNode(nodeType('list_item'), [createTextNode(text)], undefined, {
		listType: attrs.listType ?? 'bullet',
		indent: attrs.indent ?? 0,
		checked: attrs.checked ?? false,
	});
}

/** Minimal registry stub providing the specs the serializer reaches for fallback/hooks. */
function createRegistry(): SchemaRegistry {
	const markSpecs = new Map<string, unknown>([
		['bold', { type: 'bold', rank: 0 }],
		['italic', { type: 'italic', rank: 1 }],
		[
			'underline',
			{ type: 'underline', rank: 2, toHTMLString: (_m: Mark, c: string) => `<u>${c}</u>` },
		],
		['highlight', { type: 'highlight', rank: 4, toHTMLStyle: () => 'background-color: yellow' }],
		[
			'strikethrough',
			{ type: 'strikethrough', rank: 3, toHTMLString: (_m: Mark, c: string) => `<s>${c}</s>` },
		],
		['code', { type: 'code', rank: 3 }],
		['link', { type: 'link', rank: 10 }],
	]);
	const inlineNodeSpecs = new Map<string, unknown>([
		['hard_break', { type: 'hard_break', toHTMLString: () => '<br>' }],
		[
			'math_inline',
			{
				type: 'math_inline',
				toMarkdown: (n: InlineNode) => `$${String(n.attrs.latex)}$`,
				toHTMLString: (n: InlineNode) => `<math>${String(n.attrs.latex)}</math>`,
			},
		],
	]);
	const nodeSpecs = new Map<string, unknown>([
		[
			'image',
			{ type: 'image', toHTML: (n: BlockNode) => `<figure><img src="${n.attrs?.src}"></figure>` },
		],
		['video', { type: 'video', toHTML: () => '<figure><iframe src="x"></iframe></figure>' }],
		[
			'math_display',
			{ type: 'math_display', toMarkdown: (n: BlockNode) => `$$\n${String(n.attrs?.latex)}\n$$` },
		],
	]);
	return {
		getMarkSpec: (t: string) => markSpecs.get(t),
		getMarkTypes: () => [...markSpecs.keys()],
		getInlineNodeSpec: (t: string) => inlineNodeSpecs.get(t),
		getNodeSpec: (t: string) => nodeSpecs.get(t),
	} as unknown as SchemaRegistry;
}

function md(
	doc: ReturnType<typeof createDocument>,
	registry?: SchemaRegistry,
	options?: object,
): string {
	return serializeDocumentToMarkdown(doc, registry, options).trimEnd();
}

// --- Tests ---

describe('serializeDocumentToMarkdown — blocks', () => {
	it('serializes paragraphs separated by blank lines', () => {
		const doc = createDocument([para('Hello'), para('World')]);
		expect(md(doc)).toBe('Hello\n\nWorld');
	});

	it('serializes ATX headings by level', () => {
		const doc = createDocument([
			createBlockNode(nodeType('heading'), [createTextNode('Title')], undefined, { level: 1 }),
			createBlockNode(nodeType('heading'), [createTextNode('Sub')], undefined, { level: 3 }),
		]);
		expect(md(doc)).toBe('# Title\n\n### Sub');
	});

	it('serializes setext headings when requested', () => {
		const doc = createDocument([
			createBlockNode(nodeType('heading'), [createTextNode('Title')], undefined, { level: 1 }),
		]);
		expect(md(doc, undefined, { headingStyle: 'setext' })).toBe('Title\n=====');
	});

	it('serializes a fenced code block with language', () => {
		const doc = createDocument([
			createBlockNode(nodeType('code_block'), [createTextNode('const x = 1;')], undefined, {
				language: 'ts',
			}),
		]);
		expect(md(doc)).toBe('```ts\nconst x = 1;\n```');
	});

	it('grows the code fence to exceed inner backticks', () => {
		const doc = createDocument([
			createBlockNode(nodeType('code_block'), [createTextNode('a ``` b')], undefined, {}),
		]);
		expect(md(doc)).toBe('````\na ``` b\n````');
	});

	it('serializes a horizontal rule', () => {
		const doc = createDocument([
			para('a'),
			createBlockNode(nodeType('horizontal_rule'), [], undefined, {}),
			para('b'),
		]);
		expect(md(doc)).toBe('a\n\n---\n\nb');
	});

	it('serializes a blockquote container with line prefixes', () => {
		const doc = createDocument([
			createBlockNode(nodeType('blockquote'), [para('first'), para('second')], undefined, {}),
		]);
		expect(md(doc)).toBe('> first\n>\n> second');
	});

	it('serializes nested blockquotes', () => {
		const inner = createBlockNode(nodeType('blockquote'), [para('deep')], undefined, {});
		const doc = createDocument([createBlockNode(nodeType('blockquote'), [inner], undefined, {})]);
		expect(md(doc)).toBe('> > deep');
	});
});

describe('serializeDocumentToMarkdown — lists', () => {
	it('serializes bullet, ordered, and checklist items', () => {
		const doc = createDocument([
			listItem('a', { listType: 'bullet' }),
			listItem('b', { listType: 'bullet' }),
		]);
		expect(md(doc)).toBe('- a\n- b');
	});

	it('numbers ordered list items sequentially', () => {
		const doc = createDocument([
			listItem('one', { listType: 'ordered' }),
			listItem('two', { listType: 'ordered' }),
		]);
		expect(md(doc)).toBe('1. one\n2. two');
	});

	it('serializes checklist items with checkbox state', () => {
		const doc = createDocument([
			listItem('done', { listType: 'checklist', checked: true }),
			listItem('todo', { listType: 'checklist', checked: false }),
		]);
		expect(md(doc)).toBe('- [x] done\n- [ ] todo');
	});

	it('indents nested list items', () => {
		const doc = createDocument([
			listItem('top', { listType: 'bullet', indent: 0 }),
			listItem('nested', { listType: 'bullet', indent: 1 }),
		]);
		expect(md(doc)).toBe('- top\n  - nested');
	});
});

describe('serializeDocumentToMarkdown — inline marks', () => {
	it('serializes bold and italic', () => {
		const doc = createDocument([para('bold', [mark('bold')]), para('italic', [mark('italic')])]);
		expect(md(doc)).toBe('**bold**\n\n*italic*');
	});

	it('nests emphasis without ambiguous delimiters across runs', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [
				createTextNode('a', [mark('bold')]),
				createTextNode('b', [mark('bold'), mark('italic')]),
			]),
		]);
		// bold stays open across both runs; italic opens only for the second run.
		expect(md(doc)).toBe('**a*b***');
	});

	it('serializes strikethrough under gfm and HTML-falls-back under commonmark', () => {
		const doc = createDocument([para('gone', [mark('strikethrough')])]);
		const reg = createRegistry();
		expect(md(doc, reg, { flavor: 'gfm' })).toBe('~~gone~~');
		expect(md(doc, reg, { flavor: 'commonmark' })).toBe('<s>gone</s>');
	});

	it('serializes a link with href and title', () => {
		const doc = createDocument([
			para('text', [mark('link', { href: 'https://x.io', title: 'T' })]),
		]);
		expect(md(doc)).toBe('[text](https://x.io "T")');
	});

	it('serializes an inline code span with raw content', () => {
		const doc = createDocument([para('a*b', [mark('code')])]);
		expect(md(doc)).toBe('`a*b`');
	});

	it('escapes inline specials in plain text', () => {
		const doc = createDocument([para('use * and [x] and `c`')]);
		expect(md(doc)).toBe('use \\* and \\[x\\] and \\`c\\`');
	});

	it('escapes leading block markers in paragraph text', () => {
		const doc = createDocument([para('# not a heading'), para('- not a list')]);
		expect(md(doc)).toBe('\\# not a heading\n\n\\- not a list');
	});

	it('serializes a hard break as a backslash line break', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [
				createTextNode('line one'),
				createInlineNode(inlineType('hard_break'), {}),
				createTextNode('line two'),
			]),
		]);
		expect(md(doc)).toBe('line one\\\nline two');
	});
});

describe('serializeDocumentToMarkdown — superset / fallback', () => {
	it('HTML-falls-back unrepresentable marks by default', () => {
		const doc = createDocument([para('underlined', [mark('underline')])]);
		expect(md(doc, createRegistry())).toBe('<u>underlined</u>');
	});

	it('drops styling-only marks but keeps text when htmlFallback is off', () => {
		const doc = createDocument([para('underlined', [mark('underline')])]);
		expect(md(doc, createRegistry(), { htmlFallback: false })).toBe('underlined');
	});

	it('HTML-falls-back unknown block nodes (video)', () => {
		const doc = createDocument([createBlockNode(nodeType('video'), [], undefined, {})]);
		expect(md(doc, createRegistry())).toBe('<figure><iframe src="x"></iframe></figure>');
	});

	it('uses the per-spec toMarkdown hook for inline math', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [
				createTextNode('E='),
				createInlineNode(inlineType('math_inline'), {
					latex: 'mc^2',
					mathml: '',
					alt: '',
					fontSize: '',
				}),
			]),
		]);
		expect(md(doc, createRegistry())).toBe('E=$mc^2$');
	});

	it('uses the per-spec toMarkdown hook for display math', () => {
		const doc = createDocument([
			createBlockNode(nodeType('math_display'), [], undefined, { latex: 'a^2+b^2' }),
		]);
		expect(md(doc, createRegistry())).toBe('$$\na^2+b^2\n$$');
	});
});

describe('serializeDocumentToMarkdown — images & tables', () => {
	it('serializes a plain image on its own line', () => {
		const doc = createDocument([
			createBlockNode(nodeType('image'), [], undefined, { src: 'a.png', alt: 'Alt', title: 'Cap' }),
		]);
		expect(md(doc, createRegistry())).toBe('![Alt](a.png "Cap")');
	});

	it('HTML-falls-back an image with width to preserve styling', () => {
		const doc = createDocument([
			createBlockNode(nodeType('image'), [], undefined, { src: 'a.png', alt: 'A', width: 100 }),
		]);
		expect(md(doc, createRegistry())).toBe('<figure><img src="a.png"></figure>');
	});

	it('serializes a GFM table', () => {
		const cell = (text: string): BlockNode =>
			createBlockNode(nodeType('table_cell'), [para(text)], undefined, {});
		const row = (...cells: BlockNode[]): BlockNode =>
			createBlockNode(nodeType('table_row'), cells, undefined, {});
		const doc = createDocument([
			createBlockNode(
				nodeType('table'),
				[row(cell('H1'), cell('H2')), row(cell('a'), cell('b'))],
				undefined,
				{},
			),
		]);
		expect(md(doc, createRegistry())).toBe('| H1 | H2 |\n| --- | --- |\n| a | b |');
	});
});

describe('serializeDocumentToMarkdown — options', () => {
	it('honors bullet, emphasis, and codeFence style knobs', () => {
		const doc = createDocument([
			listItem('x', { listType: 'bullet' }),
			para('y', [mark('italic')]),
		]);
		expect(md(doc, undefined, { bullet: '*', emphasis: '_' })).toBe('* x\n\n_y_');
	});

	it('returns an empty string for an empty document', () => {
		expect(serializeDocumentToMarkdown(createDocument())).toBe('');
	});
});
