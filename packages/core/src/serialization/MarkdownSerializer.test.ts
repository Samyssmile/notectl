import { describe, expect, it } from 'vitest';
import {
	type BlockNode,
	type InlineNode,
	type Mark,
	type TextNode,
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
	getBlockChildren,
	getBlockText,
	getInlineChildren,
} from '../model/Document.js';
import { SchemaRegistry } from '../model/SchemaRegistry.js';
import { inlineType, markType, nodeType } from '../model/TypeBrands.js';
import { parseHTMLToDocument } from './DocumentParser.js';
import { serializeDocumentToCSS } from './DocumentSerializer.js';
import { parseMarkdownToDocument } from './MarkdownParser.js';
import { serializeDocumentToMarkdown } from './MarkdownSerializer.js';
import { resolveMarkdownHTMLRegistry } from './markdown/MarkdownHTMLRegistry.js';

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

	it('uses raw HTML to preserve a semantic block ID', () => {
		const anchored = createBlockNode(
			nodeType('paragraph'),
			[createTextNode('Destination')],
			undefined,
			undefined,
			'chapter-1',
		);
		const doc = createDocument([anchored]);

		expect(md(doc)).toBe('<p id="chapter-1">Destination</p>');
		expect(parseMarkdownToDocument(md(doc)).children[0]?.htmlId).toBe('chapter-1');
	});

	it('preserves an anchored heading and its essential inline semantics without a registry', () => {
		const anchored = createBlockNode(
			nodeType('heading'),
			[
				createTextNode('Bold', [mark('bold')]),
				createTextNode(' and '),
				createTextNode('link', [mark('link', { href: '/guide', title: 'Guide' })]),
				createInlineNode(inlineType('hard_break')),
				createTextNode('tail'),
				createInlineNode(inlineType('image_inline'), {
					src: 'icon.png',
					alt: 'Icon',
					title: 'Inline icon',
				}),
			],
			undefined,
			{ level: 2 },
			'chapter-2',
		);

		const markdown: string = md(createDocument([anchored]));
		expect(markdown).toBe(
			'<h2 id="chapter-2"><strong>Bold</strong> and <a href="/guide" title="Guide">link</a><br>tail<img src="icon.png" alt="Icon" title="Inline icon"></h2>',
		);

		const reparsed = parseMarkdownToDocument(markdown).children[0] as BlockNode;
		expect(reparsed).toMatchObject({ type: 'heading', attrs: { level: 2 }, htmlId: 'chapter-2' });
		const inline = getInlineChildren(reparsed);
		expect(inline.map((child) => ('text' in child ? child.text : child.inlineType))).toEqual([
			'Bold',
			' and ',
			'link',
			'hard_break',
			'tail',
			'image_inline',
		]);
		expect(inline[0]?.marks.map((item) => item.type)).toEqual(['bold']);
		expect(inline[2]?.marks).toEqual([
			{ type: markType('link'), attrs: { href: '/guide', title: 'Guide' } },
		]);
		expect((inline[5] as InlineNode).attrs).toEqual({
			src: 'icon.png',
			alt: 'Icon',
			title: 'Inline icon',
		});
	});

	it('preserves every portable anchored block type without a registry', () => {
		const quote = createBlockNode(
			nodeType('blockquote'),
			[para('Quoted')],
			undefined,
			undefined,
			'quote-target',
		);
		const code = createBlockNode(
			nodeType('code_block'),
			[createTextNode('const answer = 42;')],
			undefined,
			{ language: 'ts' },
			'code-target',
		);
		const rule = createBlockNode(
			nodeType('horizontal_rule'),
			[],
			undefined,
			undefined,
			'rule-target',
		);
		const image = createBlockNode(
			nodeType('image'),
			[],
			undefined,
			{ src: 'diagram.png', alt: 'Diagram', title: 'Overview', width: 320 },
			'image-target',
		);

		const markdown: string = md(createDocument([quote, code, rule, image]));
		const reparsed = parseMarkdownToDocument(markdown);

		expect(reparsed.children.map((block) => block.type)).toEqual([
			'blockquote',
			'code_block',
			'horizontal_rule',
			'image',
		]);
		expect(reparsed.children.map((block) => block.htmlId)).toEqual([
			'quote-target',
			'code-target',
			'rule-target',
			'image-target',
		]);
		expect(reparsed.children[1]).toMatchObject({
			attrs: { language: 'ts' },
		});
		expect(getBlockText(reparsed.children[1] as BlockNode)).toBe('const answer = 42;');
		expect(reparsed.children[3]).toMatchObject({
			attrs: { src: 'diagram.png', alt: 'Diagram', title: 'Overview', width: 320 },
		});
	});

	it('keeps an explicitly supplied registry authoritative for HTML fallback', () => {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'heading',
			group: 'block',
			toDOM: () => document.createElement('section'),
			toHTML: (_node, content) => `<section>${content}</section>`,
			sanitize: { tags: ['section'] },
		});
		const heading = createBlockNode(
			nodeType('heading'),
			[createTextNode('Custom', [mark('bold')])],
			undefined,
			{ level: 4 },
			'custom-heading',
		);

		expect(md(createDocument([heading]), registry)).toBe(
			'<section id="custom-heading">Custom</section>',
		);
	});

	it('degrades to native Markdown when HTML fallback is disabled', () => {
		const anchored = createBlockNode(
			nodeType('paragraph'),
			[createTextNode('Destination')],
			undefined,
			undefined,
			'chapter-1',
		);

		expect(md(createDocument([anchored]), undefined, { htmlFallback: false })).toBe('Destination');
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
	it('preserves list semantics and item HTML IDs without a registry', () => {
		const first = createBlockNode(
			nodeType('list_item'),
			[createTextNode('first')],
			undefined,
			{ listType: 'bullet', indent: 0, checked: false },
			'first-item',
		);
		const second = listItem('second', { listType: 'bullet', indent: 0 });

		const markdown: string = md(createDocument([first, second]));
		expect(markdown).toBe('<ul><li id="first-item">first</li><li>second</li></ul>');

		const reparsed = parseMarkdownToDocument(markdown);
		expect(reparsed.children.map((block) => block.type)).toEqual(['list_item', 'list_item']);
		expect(reparsed.children[0]?.htmlId).toBe('first-item');
		expect(reparsed.children.map(getBlockText)).toEqual(['first', 'second']);
	});

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

describe('serializeDocumentToMarkdown — emphasis whitespace expulsion (#192)', () => {
	function bolded(text: string, after = ''): ReturnType<typeof createBlockNode> {
		const kids = [createTextNode(text, [mark('bold')])];
		if (after) kids.push(createTextNode(after, []));
		return createBlockNode(nodeType('paragraph'), kids);
	}

	it('moves trailing whitespace outside the closing delimiter', () => {
		// `**end **next` is not right-flanking and parses literally; the space must
		// land after the closing `**`.
		expect(md(createDocument([bolded('end ', 'next')]))).toBe('**end** next');
	});

	it('moves leading whitespace outside the opening delimiter', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [
				createTextNode('a', []),
				createTextNode(' b', [mark('bold')]),
			]),
		]);
		expect(md(doc)).toBe('a **b**');
	});

	it('keeps whitespace interior to a bold span', () => {
		expect(md(createDocument([bolded('a b')]))).toBe('**a b**');
	});

	it('round-trips a trailing-space bold run through serialize → parse', () => {
		const serialized: string = md(createDocument([bolded('end ', 'next')]));
		const block = parseMarkdownToDocument(serialized).children[0];
		if (!block) throw new Error('expected a block');
		const [first, second] = getInlineChildren(block);
		expect(first && 'text' in first ? first.text : '').toBe('end');
		expect(first && 'text' in first ? first.marks.map((m) => m.type) : []).toEqual(['bold']);
		expect(second && 'text' in second ? second.text : '').toBe(' next');
		expect(second && 'text' in second ? second.marks : []).toEqual([]);
	});
});

describe('serializeDocumentToMarkdown — superset / fallback', () => {
	it('HTML-falls-back a baseline unrepresentable mark without a registry', () => {
		const doc = createDocument([para('underlined', [mark('underline')])]);
		const markdown: string = md(doc);
		expect(markdown).toBe('<u>underlined</u>');
		expect(
			getInlineChildren(parseMarkdownToDocument(markdown).children[0] as BlockNode)[0]?.marks,
		).toEqual([{ type: markType('underline') }]);
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

	it('HTML-falls-back dimensions and round-trips the canonical sizing wire form', () => {
		const cell = (value: string): BlockNode =>
			createBlockNode(nodeType('table_cell'), [para(value)]);
		const rows = [
			createBlockNode(nodeType('table_row'), [cell('H1'), cell('H2'), cell('H3')], undefined, {
				minHeightPx: 48,
			}),
			createBlockNode(nodeType('table_row'), [cell('a'), cell('b'), cell('c')]),
		];
		const table = createBlockNode(nodeType('table'), rows, undefined, {
			columnWidthsPx: [120, null, 240.5],
		});

		const markdown: string = md(createDocument([table]));
		expect(markdown).toContain('<colgroup>');
		expect(markdown).toContain('data-notectl-width-px="120" style="width: 120px"');
		expect(markdown).toContain('<col>');
		expect(markdown).toContain('data-notectl-width-px="240.5" style="width: 240.5px"');
		expect(markdown).toContain('<tr data-notectl-min-height-px="48" style="height: 48px">');

		const reparsed = parseMarkdownToDocument(markdown).children[0] as BlockNode;
		expect(reparsed.attrs?.columnWidthsPx).toEqual([120, null, 240.5]);
		expect(getBlockChildren(reparsed)[0]?.attrs?.minHeightPx).toBe(48);
	});

	it('emits a dimensionless GFM table when HTML fallback is disabled', () => {
		const cell = (value: string): BlockNode =>
			createBlockNode(nodeType('table_cell'), [para(value)]);
		const table = createBlockNode(
			nodeType('table'),
			[
				createBlockNode(nodeType('table_row'), [cell('H1'), cell('H2')], undefined, {
					minHeightPx: 48,
				}),
				createBlockNode(nodeType('table_row'), [cell('a'), cell('b')]),
			],
			undefined,
			{ columnWidthsPx: [120, null] },
		);

		expect(md(createDocument([table]), undefined, { htmlFallback: false })).toBe(
			'| H1 | H2 |\n| --- | --- |\n| a | b |',
		);
	});

	it('HTML-falls-back a row minimum height even when every column is automatic', () => {
		const cell = createBlockNode(nodeType('table_cell'), [para('A')]);
		const row = createBlockNode(nodeType('table_row'), [cell], undefined, { minHeightPx: 36 });
		const table = createBlockNode(nodeType('table'), [row]);

		const markdown: string = md(createDocument([table]));
		expect(markdown).toContain('<table>');
		expect(markdown).toContain('data-notectl-min-height-px="36"');
		expect(markdown).not.toContain('<colgroup>');
	});

	it('keeps dimension CSS on the collector path in class-mode HTML', () => {
		const cell = createBlockNode(nodeType('table_cell'), [para('A')]);
		const row = createBlockNode(nodeType('table_row'), [cell], undefined, { minHeightPx: 44 });
		const table = createBlockNode(nodeType('table'), [row], undefined, {
			columnWidthsPx: [140],
		});
		const registry = resolveMarkdownHTMLRegistry();

		const result = serializeDocumentToCSS(createDocument([table]), registry, {
			includeBlockIds: false,
		});
		expect(result.html).not.toContain('style=');
		expect(result.html).toContain('data-notectl-width-px="140"');
		expect(result.html).toContain('data-notectl-min-height-px="44"');
		expect(result.css).toContain('width: 140px');
		expect(result.css).toContain('height: 44px');

		const reparsed = parseHTMLToDocument(result.html, registry, { styleMap: result.styleMap });
		expect(reparsed.children[0]?.attrs?.columnWidthsPx).toEqual([140]);
		expect(getBlockChildren(reparsed.children[0] as BlockNode)[0]?.attrs?.minHeightPx).toBe(44);
	});

	it('preserves an anchored table hierarchy and cell spans without a registry', () => {
		const cell = createBlockNode(
			nodeType('table_cell'),
			[para('wide')],
			undefined,
			{ colspan: 2 },
			'wide-cell',
		);
		const row = createBlockNode(nodeType('table_row'), [cell]);
		const table = createBlockNode(nodeType('table'), [row], undefined, undefined, 'results');

		const markdown: string = md(createDocument([table]));
		expect(markdown).toContain('<table id="results">');
		expect(markdown).toContain('<td colspan="2" id="wide-cell"><p>wide</p></td>');

		const reparsed = parseMarkdownToDocument(markdown).children[0] as BlockNode;
		expect(reparsed).toMatchObject({ type: 'table', htmlId: 'results' });
		const reparsedCell = getBlockChildren(getBlockChildren(reparsed)[0] as BlockNode)[0];
		expect(reparsedCell).toMatchObject({
			type: 'table_cell',
			htmlId: 'wide-cell',
			attrs: { colspan: 2 },
		});
	});
});

describe('serializeDocumentToMarkdown — code block content fidelity (#192 bug #2)', () => {
	it('preserves blank lines and trailing spaces inside a code block byte-exactly', () => {
		const doc = createDocument([
			createBlockNode(nodeType('code_block'), [createTextNode('a\n\n\nb  ')], undefined, {
				language: '',
			}),
		]);
		// Global output normalization must not reach into code bodies: the two
		// blank lines and the trailing spaces are significant and stay verbatim.
		expect(serializeDocumentToMarkdown(doc)).toBe('```\na\n\n\nb  \n```\n');
	});

	it('round-trips code block content through serialize → parse without loss', () => {
		const doc = createDocument([
			createBlockNode(nodeType('code_block'), [createTextNode('a\n\n\nb  ')], undefined, {
				language: 'ts',
			}),
		]);
		const reparsed = parseMarkdownToDocument(serializeDocumentToMarkdown(doc));
		const block = reparsed.children[0];
		if (!block) throw new Error('expected a block');
		expect(getBlockText(block)).toBe('a\n\n\nb  ');
	});

	it('preserves code content when nested inside a blockquote', () => {
		const code = createBlockNode(
			nodeType('code_block'),
			[createTextNode('x\n\n\ny  ')],
			undefined,
			{
				language: '',
			},
		);
		const doc = createDocument([createBlockNode(nodeType('blockquote'), [code], undefined, {})]);
		// Line prefixing puts `> ` ahead of each fence/body line; the body bytes
		// (blank lines, trailing spaces) survive at this nesting depth too.
		expect(serializeDocumentToMarkdown(doc)).toBe('> ```\n> x\n>\n>\n> y  \n> ```\n');
	});
});

describe('serializeDocumentToMarkdown — whole-line block constructs (#192 bug #3)', () => {
	const firstBlockType = (markdown: string): string => {
		const block = parseMarkdownToDocument(markdown).children[0];
		if (!block) throw new Error('expected a block');
		return block.type;
	};

	const roundTripTypes = (doc: ReturnType<typeof createDocument>, options?: object): string[] =>
		parseMarkdownToDocument(serializeDocumentToMarkdown(doc, undefined, options)).children.map(
			(b) => b.type,
		);

	// --- Real regressions: red before the fix (paragraph re-parsed as a block) ---

	it('escapes a lone `---` so it round-trips as a paragraph, not a thematic break', () => {
		const doc = createDocument([para('---')]);
		expect(md(doc)).toBe('\\---');
		expect(roundTripTypes(doc)).toEqual(['paragraph']);
		const block = parseMarkdownToDocument(md(doc)).children[0];
		expect(block && getBlockText(block)).toBe('---');
	});

	it('escapes a `---` continuation line so a multi-line paragraph is not a setext h2', () => {
		const doc = createDocument([para('foo\n---')]);
		expect(roundTripTypes(doc)).toEqual(['paragraph']);
		// The dashes survive as literal text (soft-break whitespace is a separate concern).
		const block = parseMarkdownToDocument(md(doc)).children[0];
		expect(block && getBlockText(block)).toContain('---');
	});

	it('escapes a `===` continuation line so a multi-line paragraph is not a setext h1', () => {
		const doc = createDocument([para('foo\n===')]);
		expect(roundTripTypes(doc)).toEqual(['paragraph']);
		const block = parseMarkdownToDocument(md(doc)).children[0];
		expect(block && getBlockText(block)).toContain('===');
	});

	it('round-trips a link title containing a double quote without losing the link', () => {
		// Before the fix the serializer emitted `\"` but the parser stopped at the
		// escaped quote, so the whole link degraded to literal text (silent loss).
		const doc = createDocument([para('x', [mark('link', { href: '/u', title: 'a"b' })])]);
		const block = parseMarkdownToDocument(md(doc)).children[0];
		if (!block) throw new Error('expected a block');
		const link = (getInlineChildren(block)[0] as TextNode).marks[0];
		expect(link?.type).toBe('link');
		expect(link?.attrs).toEqual({ href: '/u', title: 'a"b' });
	});

	it('escapes a lone `~~~` under commonmark so it is not a code fence', () => {
		const doc = createDocument([para('~~~')]);
		const opts = { flavor: 'commonmark' };
		expect(md(doc, undefined, opts)).toBe('\\~~~');
		expect(roundTripTypes(doc, opts)).toEqual(['paragraph']);
	});

	// --- Guards: already safe via inline escaping, asserted so they stay safe ---

	it('keeps `***` and `___` paragraphs intact (inline-escape guard)', () => {
		expect(firstBlockType(md(createDocument([para('***')])))).toBe('paragraph');
		expect(firstBlockType(md(createDocument([para('___')])))).toBe('paragraph');
	});

	it('keeps a single-line `===` paragraph intact (no preceding line, guard)', () => {
		expect(firstBlockType(md(createDocument([para('===')])))).toBe('paragraph');
	});

	it('keeps a `~~~` paragraph intact under gfm (inline-escape guard)', () => {
		expect(firstBlockType(md(createDocument([para('~~~')]), undefined, { flavor: 'gfm' }))).toBe(
			'paragraph',
		);
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
