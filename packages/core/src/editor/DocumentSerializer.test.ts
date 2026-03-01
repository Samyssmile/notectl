import { describe, expect, it } from 'vitest';
import {
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
} from '../model/Document.js';
import type { Mark } from '../model/Document.js';
import { escapeHTML } from '../model/HTMLUtils.js';
import type { MarkSpec } from '../model/MarkSpec.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { blockId, inlineType, markType, nodeType } from '../model/TypeBrands.js';
import { isValidCSSColor } from '../plugins/shared/ColorValidation.js';
import { serializeDocumentToCSS, serializeDocumentToHTML } from './DocumentSerializer.js';

/**
 * Creates a minimal SchemaRegistry stub that provides toHTML + sanitize
 * for table, table_row, and table_cell node specs.
 */
function createTableRegistry(): SchemaRegistry {
	const nodeSpecs = new Map<string, { toHTML?: (node: unknown, content: string) => string }>([
		['paragraph', { toHTML: (_n, c) => `<p>${c || '<br>'}</p>` }],
		['table', { toHTML: (_n, c) => `<table>${c}</table>` }],
		['table_row', { toHTML: (_n, c) => `<tr>${c}</tr>` }],
		['table_cell', { toHTML: (_n, c) => `<td>${c}</td>` }],
	]);

	return {
		getNodeSpec: (type: string) => nodeSpecs.get(type) ?? undefined,
		getInlineNodeSpec: () => undefined,
		getMarkSpec: () => undefined,
		getMarkTypes: () => [],
		getAllowedTags: () => ['p', 'br', 'table', 'tbody', 'tr', 'td'],
		getAllowedAttrs: () => ['style', 'colspan', 'rowspan'],
	} as unknown as SchemaRegistry;
}

describe('serializeDocumentToHTML', () => {
	it('serializes simple paragraphs', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello')]),
			createBlockNode(nodeType('paragraph'), [createTextNode('world')]),
		]);

		const html: string = serializeDocumentToHTML(doc);
		expect(html).toContain('<p>hello</p>');
		expect(html).toContain('<p>world</p>');
	});

	it('returns empty paragraph for default document', () => {
		const doc = createDocument();
		const html: string = serializeDocumentToHTML(doc);
		expect(html).toBe('<p><br></p>');
	});

	// Coverage for serializeBlock (via public API)

	it('wraps in <p> by default', () => {
		const doc = createDocument([createBlockNode(nodeType('paragraph'), [createTextNode('hello')])]);
		expect(serializeDocumentToHTML(doc)).toBe('<p>hello</p>');
	});

	it('uses <br> for empty content', () => {
		const doc = createDocument([createBlockNode(nodeType('paragraph'), [createTextNode('')])]);
		expect(serializeDocumentToHTML(doc)).toBe('<p><br></p>');
	});

	// Coverage for serializeInlineContent (via public API)

	it('joins text nodes', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello '), createTextNode('world')]),
		]);
		expect(serializeDocumentToHTML(doc)).toBe('<p>hello world</p>');
	});

	// Coverage for serializeTextNode (via public API)

	it('returns empty string for empty text', () => {
		const doc = createDocument([createBlockNode(nodeType('paragraph'), [createTextNode('')])]);
		expect(serializeDocumentToHTML(doc)).toBe('<p><br></p>');
	});

	it('escapes HTML entities', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('<b>bold</b>')]),
		]);
		const html: string = serializeDocumentToHTML(doc);
		expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
	});

	it('returns plain text when no marks', () => {
		const doc = createDocument([createBlockNode(nodeType('paragraph'), [createTextNode('hello')])]);
		expect(serializeDocumentToHTML(doc)).toBe('<p>hello</p>');
	});

	// Coverage for alignment validation in serializeBlock

	it('injects text-align style for center alignment', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello')], undefined, {
				align: 'center',
			}),
		]);
		const html: string = serializeDocumentToHTML(doc);
		expect(html).toBe('<p style="text-align: center">hello</p>');
	});

	it('injects text-align style for right alignment', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello')], undefined, {
				align: 'right',
			}),
		]);
		const html: string = serializeDocumentToHTML(doc);
		expect(html).toBe('<p style="text-align: right">hello</p>');
	});

	it('injects text-align style for justify alignment', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello')], undefined, {
				align: 'justify',
			}),
		]);
		const html: string = serializeDocumentToHTML(doc);
		expect(html).toBe('<p style="text-align: justify">hello</p>');
	});

	it('does not inject style for left alignment (default)', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello')], undefined, {
				align: 'left',
			}),
		]);
		const html: string = serializeDocumentToHTML(doc);
		expect(html).toBe('<p>hello</p>');
	});

	it('ignores invalid alignment values', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello')], undefined, {
				align: '"><script>alert(1)</script>',
			}),
		]);
		const html: string = serializeDocumentToHTML(doc);
		expect(html).not.toContain('script');
		expect(html).not.toContain('text-align');
		expect(html).toBe('<p>hello</p>');
	});

	it('ignores unknown alignment values', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello')], undefined, {
				align: 'start',
			}),
		]);
		const html: string = serializeDocumentToHTML(doc);
		expect(html).not.toContain('text-align');
		expect(html).toBe('<p>hello</p>');
	});

	it('does not double-inject text-align when toHTML already emits it', () => {
		const registry: SchemaRegistry = {
			getNodeSpec: (type: string) => {
				if (type === 'image') {
					return {
						toHTML: () => '<figure style="text-align: left"><img src="x"></figure>',
					};
				}
				return undefined;
			},
			getInlineNodeSpec: () => undefined,
			getMarkSpec: () => undefined,
			getMarkTypes: () => [],
			getAllowedTags: () => ['figure', 'img'],
			getAllowedAttrs: () => ['style', 'src'],
		} as unknown as SchemaRegistry;

		const doc = createDocument([
			createBlockNode(nodeType('image'), [], undefined, { align: 'center' }),
		]);
		const html: string = serializeDocumentToHTML(doc, registry);
		// Should NOT inject a second text-align style
		const matches: RegExpMatchArray | null = html.match(/text-align/g);
		expect(matches).toHaveLength(1);
	});

	// Coverage for compound block serialization (nested BlockNode children)

	it('serializes a table with nested rows, cells, and paragraph content', () => {
		const registry: SchemaRegistry = createTableRegistry();
		const cell = (text: string): ReturnType<typeof createBlockNode> =>
			createBlockNode(
				nodeType('table_cell'),
				[createBlockNode(nodeType('paragraph'), [createTextNode(text)], blockId('p1'))],
				blockId('c1'),
			);

		const doc = createDocument([
			createBlockNode(
				nodeType('table'),
				[createBlockNode(nodeType('table_row'), [cell('AB'), cell('CD')], blockId('r1'))],
				blockId('t1'),
			),
		]);

		const html: string = serializeDocumentToHTML(doc, registry);
		// DOMPurify auto-inserts <tbody> per the HTML spec
		expect(html).toBe(
			'<table><tbody><tr><td><p>AB</p></td><td><p>CD</p></td></tr></tbody></table>',
		);
	});

	it('serializes a table alongside regular paragraphs', () => {
		const registry: SchemaRegistry = createTableRegistry();
		const cell = (text: string): ReturnType<typeof createBlockNode> =>
			createBlockNode(nodeType('table_cell'), [
				createBlockNode(nodeType('paragraph'), [createTextNode(text)]),
			]);

		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('Before')]),
			createBlockNode(nodeType('table'), [createBlockNode(nodeType('table_row'), [cell('X')])]),
			createBlockNode(nodeType('paragraph'), [createTextNode('After')]),
		]);

		const html: string = serializeDocumentToHTML(doc, registry);
		expect(html).toBe(
			'<p>Before</p><table><tbody><tr><td><p>X</p></td></tr></tbody></table><p>After</p>',
		);
	});

	it('serializes empty table cells with <br>', () => {
		const registry: SchemaRegistry = createTableRegistry();
		const emptyCell: ReturnType<typeof createBlockNode> = createBlockNode(nodeType('table_cell'), [
			createBlockNode(nodeType('paragraph'), [createTextNode('')]),
		]);

		const doc = createDocument([
			createBlockNode(nodeType('table'), [createBlockNode(nodeType('table_row'), [emptyCell])]),
		]);

		const html: string = serializeDocumentToHTML(doc, registry);
		expect(html).toBe('<table><tbody><tr><td><p><br></p></td></tr></tbody></table>');
	});

	// --- Color mark serialization (defense-in-depth validation) ---

	describe('color mark serialization', () => {
		function createColorMarkRegistry(): SchemaRegistry {
			const nodeSpecs = new Map<string, { toHTML?: (node: unknown, content: string) => string }>([
				['paragraph', { toHTML: (_n, c) => `<p>${c || '<br>'}</p>` }],
			]);

			const markSpecs = new Map<
				string,
				{
					rank: number;
					toHTMLString?: (mark: Mark, content: string) => string;
				}
			>([
				[
					'textColor',
					{
						rank: 5,
						toHTMLString: (mark: Mark, content: string) => {
							const color: string = String((mark.attrs as Record<string, unknown>)?.color ?? '');
							if (!color || !isValidCSSColor(color)) return content;
							return `<span style="color: ${escapeHTML(color)}">${content}</span>`;
						},
					},
				],
				[
					'highlight',
					{
						rank: 4,
						toHTMLString: (mark: Mark, content: string) => {
							const color: string = String((mark.attrs as Record<string, unknown>)?.color ?? '');
							if (!color || !isValidCSSColor(color)) return content;
							return `<span style="background-color: ${escapeHTML(color)}">${content}</span>`;
						},
					},
				],
			]);

			return {
				getNodeSpec: (type: string) => nodeSpecs.get(type) ?? undefined,
				getInlineNodeSpec: () => undefined,
				getMarkSpec: (type: string) => markSpecs.get(type) ?? undefined,
				getMarkTypes: () => [...markSpecs.keys()],
				getAllowedTags: () => ['p', 'br', 'span'],
				getAllowedAttrs: () => ['style'],
			} as unknown as SchemaRegistry;
		}

		it('serializes valid text color', () => {
			const registry: SchemaRegistry = createColorMarkRegistry();
			const doc = createDocument([
				createBlockNode(nodeType('paragraph'), [
					createTextNode('hello', [{ type: markType('textColor'), attrs: { color: '#ff0000' } }]),
				]),
			]);

			const html: string = serializeDocumentToHTML(doc, registry);
			expect(html).toContain('style="color: #ff0000"');
			expect(html).toContain('hello');
		});

		it('serializes valid highlight color', () => {
			const registry: SchemaRegistry = createColorMarkRegistry();
			const doc = createDocument([
				createBlockNode(nodeType('paragraph'), [
					createTextNode('hello', [{ type: markType('highlight'), attrs: { color: '#fff176' } }]),
				]),
			]);

			const html: string = serializeDocumentToHTML(doc, registry);
			expect(html).toContain('style="background-color: #fff176"');
			expect(html).toContain('hello');
		});

		it('strips text color span for invalid color value', () => {
			const registry: SchemaRegistry = createColorMarkRegistry();
			const doc = createDocument([
				createBlockNode(nodeType('paragraph'), [
					createTextNode('hello', [
						{
							type: markType('textColor'),
							attrs: { color: 'red; background: url(evil)' },
						},
					]),
				]),
			]);

			const html: string = serializeDocumentToHTML(doc, registry);
			expect(html).not.toContain('url(evil)');
			expect(html).not.toContain('style');
			expect(html).toContain('hello');
		});

		it('strips highlight span for invalid color value', () => {
			const registry: SchemaRegistry = createColorMarkRegistry();
			const doc = createDocument([
				createBlockNode(nodeType('paragraph'), [
					createTextNode('hello', [
						{
							type: markType('highlight'),
							attrs: { color: 'expression(alert(1))' },
						},
					]),
				]),
			]);

			const html: string = serializeDocumentToHTML(doc, registry);
			expect(html).not.toContain('expression');
			expect(html).not.toContain('style');
			expect(html).toContain('hello');
		});

		it('serializes rgb() color from paste', () => {
			const registry: SchemaRegistry = createColorMarkRegistry();
			const doc = createDocument([
				createBlockNode(nodeType('paragraph'), [
					createTextNode('hello', [
						{ type: markType('textColor'), attrs: { color: 'rgb(255, 0, 0)' } },
					]),
				]),
			]);

			const html: string = serializeDocumentToHTML(doc, registry);
			expect(html).toContain('color: rgb(255, 0, 0)');
		});
	});

	// --- Adjacent TextNode merging ---

	describe('adjacent TextNode merging', () => {
		function createBoldRegistry(): SchemaRegistry {
			const markSpecs = new Map<string, MarkSpec>([
				[
					'bold',
					{
						type: 'bold',
						rank: 1,
						toDOM: () => document.createElement('strong'),
						toHTMLString: (_mark: Mark, content: string) => `<strong>${content}</strong>`,
					},
				],
				[
					'italic',
					{
						type: 'italic',
						rank: 2,
						toDOM: () => document.createElement('em'),
						toHTMLString: (_mark: Mark, content: string) => `<em>${content}</em>`,
					},
				],
			]);

			return {
				getNodeSpec: () => undefined,
				getInlineNodeSpec: () => undefined,
				getMarkSpec: (type: string) => markSpecs.get(type) ?? undefined,
				getMarkTypes: () => [...markSpecs.keys()],
				getAllowedTags: () => ['p', 'br', 'strong', 'em'],
				getAllowedAttrs: () => ['style'],
			} as unknown as SchemaRegistry;
		}

		it('merges adjacent bold TextNodes into a single <strong> wrapper', () => {
			const registry: SchemaRegistry = createBoldRegistry();
			const boldMark: Mark = { type: markType('bold') };
			const doc = createDocument([
				createBlockNode(nodeType('paragraph'), [
					createTextNode('Hello ', [boldMark]),
					createTextNode('World', [boldMark]),
				]),
			]);

			const html: string = serializeDocumentToHTML(doc, registry);
			expect(html).toBe('<p><strong>Hello World</strong></p>');
		});

		it('does not merge TextNodes with different marks', () => {
			const registry: SchemaRegistry = createBoldRegistry();
			const doc = createDocument([
				createBlockNode(nodeType('paragraph'), [
					createTextNode('Hello ', [{ type: markType('bold') }]),
					createTextNode('World', [{ type: markType('italic') }]),
				]),
			]);

			const html: string = serializeDocumentToHTML(doc, registry);
			expect(html).toBe('<p><strong>Hello </strong><em>World</em></p>');
		});

		it('InlineNode between same-mark TextNodes prevents merging', () => {
			const registry: SchemaRegistry = createBoldRegistry();
			const inlineSpec = {
				type: 'hard_break',
				toHTMLString: () => '<br>',
			};
			const regWithInline = {
				...registry,
				getInlineNodeSpec: (type: string) => (type === 'hard_break' ? inlineSpec : undefined),
				getAllowedTags: () => ['p', 'br', 'strong', 'em'],
			} as unknown as SchemaRegistry;

			const boldMark: Mark = { type: markType('bold') };
			const doc = createDocument([
				createBlockNode(nodeType('paragraph'), [
					createTextNode('A', [boldMark]),
					createInlineNode(inlineType('hard_break')),
					createTextNode('B', [boldMark]),
				]),
			]);

			const html: string = serializeDocumentToHTML(doc, regWithInline);
			expect(html).toBe('<p><strong>A</strong><br><strong>B</strong></p>');
		});
	});

	// --- Style mark consolidation (toHTMLStyle) ---

	describe('style mark consolidation', () => {
		function createStyleMarkRegistry(): SchemaRegistry {
			const markSpecs = new Map<string, MarkSpec>([
				[
					'textColor',
					{
						type: 'textColor',
						rank: 5,
						toDOM: () => document.createElement('span'),
						toHTMLStyle: (mark: Mark) => {
							const color: string = String((mark.attrs as Record<string, unknown>)?.color ?? '');
							return color ? `color: ${color}` : null;
						},
					},
				],
				[
					'highlight',
					{
						type: 'highlight',
						rank: 4,
						toDOM: () => document.createElement('span'),
						toHTMLStyle: (mark: Mark) => {
							const color: string = String((mark.attrs as Record<string, unknown>)?.color ?? '');
							return color ? `background-color: ${color}` : null;
						},
					},
				],
				[
					'bold',
					{
						type: 'bold',
						rank: 1,
						toDOM: () => document.createElement('strong'),
						toHTMLString: (_mark: Mark, content: string) => `<strong>${content}</strong>`,
					},
				],
			]);

			return {
				getNodeSpec: () => undefined,
				getInlineNodeSpec: () => undefined,
				getMarkSpec: (type: string) => markSpecs.get(type) ?? undefined,
				getMarkTypes: () => [...markSpecs.keys()],
				getAllowedTags: () => ['p', 'br', 'span', 'strong'],
				getAllowedAttrs: () => ['style'],
			} as unknown as SchemaRegistry;
		}

		it('merges textColor + highlight into a single <span style="...">', () => {
			const registry: SchemaRegistry = createStyleMarkRegistry();
			const doc = createDocument([
				createBlockNode(nodeType('paragraph'), [
					createTextNode('hello', [
						{ type: markType('textColor'), attrs: { color: 'red' } },
						{ type: markType('highlight'), attrs: { color: 'yellow' } },
					]),
				]),
			]);

			const html: string = serializeDocumentToHTML(doc, registry);
			expect(html).toContain('style="background-color: yellow; color: red"');
			// Should be a single span, not nested
			expect(html).not.toMatch(/<span[^>]*><span/);
		});

		it('wraps tag-based marks outside the merged style span', () => {
			const registry: SchemaRegistry = createStyleMarkRegistry();
			const doc = createDocument([
				createBlockNode(nodeType('paragraph'), [
					createTextNode('hello', [
						{ type: markType('bold') },
						{ type: markType('textColor'), attrs: { color: 'red' } },
					]),
				]),
			]);

			const html: string = serializeDocumentToHTML(doc, registry);
			// Bold should wrap the style span
			expect(html).toBe('<p><strong><span style="color: red">hello</span></strong></p>');
		});
	});

	// --- Nested list serialization ---

	describe('nested list serialization', () => {
		function createListRegistry(): SchemaRegistry {
			const nodeSpecs = new Map<string, { toHTML?: (node: unknown, content: string) => string }>([
				['paragraph', { toHTML: (_n, c) => `<p>${c || '<br>'}</p>` }],
				[
					'list_item',
					{
						toHTML: (node: unknown, content: string) => {
							const n = node as { attrs?: Record<string, unknown> };
							const listType: string = (n.attrs?.listType as string) ?? 'bullet';
							const checked: boolean = (n.attrs?.checked as boolean) ?? false;

							if (listType === 'checklist') {
								const checkedAttr: string = checked ? ' checked' : '';
								return (
									`<li role="checkbox" aria-checked="${String(checked)}">` +
									`<input type="checkbox" disabled${checkedAttr}>` +
									`${content || '<br>'}</li>`
								);
							}
							return `<li>${content || '<br>'}</li>`;
						},
					},
				],
			]);

			return {
				getNodeSpec: (type: string) => nodeSpecs.get(type) ?? undefined,
				getInlineNodeSpec: () => undefined,
				getMarkSpec: () => undefined,
				getMarkTypes: () => [],
				getAllowedTags: () => ['p', 'br', 'ul', 'ol', 'li', 'input'],
				getAllowedAttrs: () => ['style', 'role', 'aria-checked', 'type', 'disabled', 'checked'],
			} as unknown as SchemaRegistry;
		}

		function listItem(
			text: string,
			listType: string,
			indent: number,
			checked = false,
		): ReturnType<typeof createBlockNode> {
			return createBlockNode(nodeType('list_item'), [createTextNode(text)], undefined, {
				listType,
				indent,
				checked,
			});
		}

		it('serializes flat bullet list', () => {
			const registry: SchemaRegistry = createListRegistry();
			const doc = createDocument([listItem('A', 'bullet', 0), listItem('B', 'bullet', 0)]);

			const html: string = serializeDocumentToHTML(doc, registry);
			expect(html).toBe('<ul><li>A</li><li>B</li></ul>');
		});

		it('serializes nested list (indent 0→1) with valid HTML5 nesting', () => {
			const registry: SchemaRegistry = createListRegistry();
			const doc = createDocument([listItem('A', 'bullet', 0), listItem('B', 'bullet', 1)]);

			const html: string = serializeDocumentToHTML(doc, registry);
			expect(html).toBe('<ul><li>A<ul><li>B</li></ul></li></ul>');
		});

		it('serializes deep nesting (0→1→2→1) with valid HTML5 nesting', () => {
			const registry: SchemaRegistry = createListRegistry();
			const doc = createDocument([
				listItem('A', 'bullet', 0),
				listItem('B', 'bullet', 1),
				listItem('C', 'bullet', 2),
				listItem('D', 'bullet', 1),
			]);

			const html: string = serializeDocumentToHTML(doc, registry);
			expect(html).toBe('<ul><li>A<ul><li>B<ul><li>C</li></ul></li><li>D</li></ul></li></ul>');
		});

		it('serializes checklist items with accessible markup', () => {
			const registry: SchemaRegistry = createListRegistry();
			const doc = createDocument([
				listItem('Done', 'checklist', 0, true),
				listItem('Todo', 'checklist', 0, false),
			]);

			const html: string = serializeDocumentToHTML(doc, registry);
			expect(html).toContain('role="checkbox"');
			expect(html).toContain('aria-checked="true"');
			expect(html).toContain('aria-checked="false"');
			// DOMPurify normalizes boolean attrs to `attr=""`
			expect(html).toContain('type="checkbox"');
			expect(html).toContain('disabled');
			expect(html).toContain('checked');
			expect(html).toContain('Done');
			expect(html).toContain('Todo');
		});

		it('serializes mixed ordered/bullet list types', () => {
			const registry: SchemaRegistry = createListRegistry();
			const doc = createDocument([
				listItem('Bullet', 'bullet', 0),
				listItem('Ordered', 'ordered', 0),
			]);

			const html: string = serializeDocumentToHTML(doc, registry);
			expect(html).toContain('<ul>');
			expect(html).toContain('<ol>');
		});
	});
});

describe('serializeDocumentToCSS', () => {
	function createStyleMarkRegistry(): SchemaRegistry {
		const markSpecs = new Map<string, MarkSpec>([
			[
				'textColor',
				{
					type: 'textColor',
					rank: 5,
					toDOM: () => document.createElement('span'),
					toHTMLStyle: (mark: Mark) => {
						const color: string = String((mark.attrs as Record<string, unknown>)?.color ?? '');
						return color ? `color: ${color}` : null;
					},
				},
			],
			[
				'highlight',
				{
					type: 'highlight',
					rank: 4,
					toDOM: () => document.createElement('span'),
					toHTMLStyle: (mark: Mark) => {
						const color: string = String((mark.attrs as Record<string, unknown>)?.color ?? '');
						return color ? `background-color: ${color}` : null;
					},
				},
			],
			[
				'bold',
				{
					type: 'bold',
					rank: 1,
					toDOM: () => document.createElement('strong'),
					toHTMLString: (_mark: Mark, content: string) => `<strong>${content}</strong>`,
				},
			],
		]);

		return {
			getNodeSpec: () => undefined,
			getInlineNodeSpec: () => undefined,
			getMarkSpec: (type: string) => markSpecs.get(type) ?? undefined,
			getMarkTypes: () => [...markSpecs.keys()],
			getAllowedTags: () => ['p', 'br', 'span', 'strong'],
			getAllowedAttrs: () => ['style'],
		} as unknown as SchemaRegistry;
	}

	it('returns html and css fields', () => {
		const registry: SchemaRegistry = createStyleMarkRegistry();
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [
				createTextNode('hello', [{ type: markType('textColor'), attrs: { color: 'red' } }]),
			]),
		]);

		const result = serializeDocumentToCSS(doc, registry);
		expect(result).toHaveProperty('html');
		expect(result).toHaveProperty('css');
	});

	it('uses class instead of inline style for style marks', () => {
		const registry: SchemaRegistry = createStyleMarkRegistry();
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [
				createTextNode('hello', [{ type: markType('textColor'), attrs: { color: 'red' } }]),
			]),
		]);

		const result = serializeDocumentToCSS(doc, registry);
		expect(result.html).toContain('class="notectl-s0"');
		expect(result.html).not.toContain('style=');
		expect(result.css).toContain('.notectl-s0');
		expect(result.css).toContain('color: red');
	});

	it('returns empty css when no style marks in document', () => {
		const registry: SchemaRegistry = createStyleMarkRegistry();
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('plain text')]),
		]);

		const result = serializeDocumentToCSS(doc, registry);
		expect(result.html).toBe('<p>plain text</p>');
		expect(result.css).toBe('');
	});

	it('deduplicates identical styles across nodes', () => {
		const registry: SchemaRegistry = createStyleMarkRegistry();
		const marks: Mark[] = [{ type: markType('textColor'), attrs: { color: 'red' } }];
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello', marks)]),
			createBlockNode(nodeType('paragraph'), [createTextNode('world', marks)]),
		]);

		const result = serializeDocumentToCSS(doc, registry);
		// Both paragraphs should use the same class
		const classMatches = result.html.match(/notectl-s0/g);
		expect(classMatches).toHaveLength(2);
		// Only one CSS rule
		expect(result.css.split('\n')).toHaveLength(1);
	});

	it('generates alignment classes instead of inline styles', () => {
		const registry: SchemaRegistry = createStyleMarkRegistry();
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('centered')], undefined, {
				align: 'center',
			}),
		]);

		const result = serializeDocumentToCSS(doc, registry);
		expect(result.html).toContain('class="notectl-align-center"');
		expect(result.html).not.toContain('style=');
		expect(result.css).toContain('.notectl-align-center');
		expect(result.css).toContain('text-align: center');
	});

	it('handles mixed tag + style marks', () => {
		const registry: SchemaRegistry = createStyleMarkRegistry();
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [
				createTextNode('hello', [
					{ type: markType('bold') },
					{ type: markType('textColor'), attrs: { color: 'red' } },
				]),
			]),
		]);

		const result = serializeDocumentToCSS(doc, registry);
		// Bold wraps the class span
		expect(result.html).toBe('<p><strong><span class="notectl-s0">hello</span></strong></p>');
		expect(result.css).toContain('color: red');
	});

	it('handles alignment + style marks independently', () => {
		const registry: SchemaRegistry = createStyleMarkRegistry();
		const doc = createDocument([
			createBlockNode(
				nodeType('paragraph'),
				[createTextNode('hello', [{ type: markType('textColor'), attrs: { color: 'blue' } }])],
				undefined,
				{ align: 'right' },
			),
		]);

		const result = serializeDocumentToCSS(doc, registry);
		// Block has alignment class, inline has style class
		expect(result.html).toContain('class="notectl-align-right"');
		expect(result.html).toContain('class="notectl-s0"');
		expect(result.css).toContain('.notectl-align-right');
		expect(result.css).toContain('.notectl-s0');
	});

	it('merges multiple style marks into a single class', () => {
		const registry: SchemaRegistry = createStyleMarkRegistry();
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [
				createTextNode('hello', [
					{ type: markType('textColor'), attrs: { color: 'red' } },
					{ type: markType('highlight'), attrs: { color: 'yellow' } },
				]),
			]),
		]);

		const result = serializeDocumentToCSS(doc, registry);
		expect(result.html).toContain('class="notectl-s0"');
		// Should not have nested spans
		expect(result.html).not.toMatch(/<span[^>]*><span/);
		expect(result.css).toContain('background-color: yellow');
		expect(result.css).toContain('color: red');
	});

	it('allows class attribute through DOMPurify', () => {
		const registry: SchemaRegistry = createStyleMarkRegistry();
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [
				createTextNode('hello', [{ type: markType('textColor'), attrs: { color: 'red' } }]),
			]),
		]);

		const result = serializeDocumentToCSS(doc, registry);
		// class attribute should survive DOMPurify
		expect(result.html).toContain('class=');
	});

	it('works without registry', () => {
		const doc = createDocument([createBlockNode(nodeType('paragraph'), [createTextNode('hello')])]);

		const result = serializeDocumentToCSS(doc);
		expect(result.html).toBe('<p>hello</p>');
		expect(result.css).toBe('');
	});
});
