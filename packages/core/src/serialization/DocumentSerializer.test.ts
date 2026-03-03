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

	it('injects text-align style for end alignment', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello')], undefined, {
				align: 'end',
			}),
		]);
		const html: string = serializeDocumentToHTML(doc);
		expect(html).toBe('<p style="text-align: end">hello</p>');
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

	it('does not inject style for start alignment (default)', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello')], undefined, {
				align: 'start',
			}),
		]);
		const html: string = serializeDocumentToHTML(doc);
		expect(html).toBe('<p>hello</p>');
	});

	it('normalizes legacy align: right to end', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello')], undefined, {
				align: 'right',
			}),
		]);
		const html: string = serializeDocumentToHTML(doc);
		expect(html).toBe('<p style="text-align: end">hello</p>');
	});

	it('normalizes legacy align: left to start (no style injected)', () => {
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
				align: 'middle',
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

	// --- Table HTML serialization (migrated from e2e/table-html-serialization.spec.ts) ---

	describe('table HTML serialization with inline styles', () => {
		/**
		 * Creates a SchemaRegistry that mirrors the real TablePlugin toHTML logic,
		 * including border-collapse, width, cell padding/border CSS, and border color.
		 */
		function createRealTableRegistry(): SchemaRegistry {
			const DEFAULT_BORDER_COLOR = '#d0d0d0';
			const TABLE_BASE_STYLE = 'border-collapse: collapse; width: 100%; table-layout: fixed';
			const CELL_STYLE = `border: 1px solid var(--ntbl-bc, ${DEFAULT_BORDER_COLOR}); padding: 8px 12px; vertical-align: top`;

			function buildTableStyleLocal(borderColor: string | undefined): string {
				if (!borderColor) return TABLE_BASE_STYLE;
				if (borderColor === 'none') {
					return `${TABLE_BASE_STYLE}; --ntbl-bc: transparent`;
				}
				if (/^#(?:[0-9a-fA-F]{3,4}){1,2}$/.test(borderColor)) {
					return `${TABLE_BASE_STYLE}; --ntbl-bc: ${borderColor}`;
				}
				return TABLE_BASE_STYLE;
			}

			const nodeSpecs = new Map<
				string,
				{
					toHTML?: (
						node: unknown,
						content: string,
						ctx?: { styleAttr: (d: string) => string },
					) => string;
				}
			>([
				['paragraph', { toHTML: (_n, c) => `<p>${c || '<br>'}</p>` }],
				[
					'table',
					{
						toHTML: (node: unknown, content: string, ctx?) => {
							const n = node as { attrs?: Record<string, unknown> };
							const borderColor: string | undefined = n.attrs?.borderColor as string | undefined;
							const style: string = buildTableStyleLocal(borderColor);
							const attr: string = ctx?.styleAttr(style) ?? ` style="${style}"`;
							return `<table${attr}>${content}</table>`;
						},
					},
				],
				['table_row', { toHTML: (_n, c) => `<tr>${c}</tr>` }],
				[
					'table_cell',
					{
						toHTML: (node: unknown, content: string, ctx?) => {
							const n = node as { attrs?: Record<string, unknown> };
							const colspan: number = (n.attrs?.colspan as number) ?? 1;
							const rowspan: number = (n.attrs?.rowspan as number) ?? 1;
							const styleAttr: string = ctx?.styleAttr(CELL_STYLE) ?? ` style="${CELL_STYLE}"`;
							const attrs: string[] = [styleAttr];
							if (colspan > 1) attrs.push(` colspan="${colspan}"`);
							if (rowspan > 1) attrs.push(` rowspan="${rowspan}"`);
							return `<td${attrs.join('')}>${content}</td>`;
						},
					},
				],
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

		function cell(text: string): ReturnType<typeof createBlockNode> {
			return createBlockNode(nodeType('table_cell'), [
				createBlockNode(nodeType('paragraph'), [createTextNode(text)]),
			]);
		}

		function makeTable(
			cells: ReturnType<typeof createBlockNode>[][],
			attrs?: Record<string, unknown>,
		): ReturnType<typeof createDocument> {
			const rows: ReturnType<typeof createBlockNode>[] = cells.map((rowCells) =>
				createBlockNode(nodeType('table_row'), rowCells),
			);
			return createDocument([createBlockNode(nodeType('table'), rows, undefined, attrs)]);
		}

		it('produces table HTML with border-collapse, padding, and border CSS', () => {
			const registry: SchemaRegistry = createRealTableRegistry();
			const doc = makeTable([[cell('AB')]]);

			const html: string = serializeDocumentToHTML(doc, registry);

			expect(html).toContain('<table');
			expect(html).toContain('border-collapse: collapse');
			expect(html).toContain('<tr>');
			expect(html).toContain('<td');
			expect(html).toContain('border: 1px solid');
			expect(html).toContain('padding: 8px 12px');
			expect(html).toContain('AB');
		});

		it('includes width and vertical-align styles', () => {
			const registry: SchemaRegistry = createRealTableRegistry();
			const doc = makeTable([[cell('Cell content')]]);

			const html: string = serializeDocumentToHTML(doc, registry);

			expect(html).toContain('border-collapse: collapse');
			expect(html).toContain('width: 100%');
			expect(html).toContain('border: 1px solid');
			expect(html).toContain('padding: 8px 12px');
			expect(html).toContain('vertical-align: top');
			expect(html).toContain('Cell content');
		});

		it('preserves text before and after a table', () => {
			const registry: SchemaRegistry = createRealTableRegistry();
			const doc = createDocument([
				createBlockNode(nodeType('paragraph'), [createTextNode('Before table')]),
				createBlockNode(nodeType('table'), [createBlockNode(nodeType('table_row'), [cell('X')])]),
			]);

			const html: string = serializeDocumentToHTML(doc, registry);

			expect(html).toContain('Before table');
			expect(html).toContain('<table');
		});

		it('reflects custom border color via --ntbl-bc custom property', () => {
			const registry: SchemaRegistry = createRealTableRegistry();
			const doc = makeTable([[cell('A')]], { borderColor: '#e69138' });

			const html: string = serializeDocumentToHTML(doc, registry);

			expect(html).toContain('--ntbl-bc: #e69138');
			expect(html).toContain('var(--ntbl-bc');
		});

		it('renders borderless table with transparent borders', () => {
			const registry: SchemaRegistry = createRealTableRegistry();
			const doc = makeTable([[cell('A')]], { borderColor: 'none' });

			const html: string = serializeDocumentToHTML(doc, registry);

			expect(html).toContain('--ntbl-bc: transparent');
		});

		it('ignores invalid border color values', () => {
			const registry: SchemaRegistry = createRealTableRegistry();
			const doc = makeTable([[cell('A')]], {
				borderColor: 'red; background: url(evil)',
			});

			const html: string = serializeDocumentToHTML(doc, registry);

			expect(html).not.toContain('url(evil)');
			// Table element must NOT set --ntbl-bc for invalid colors
			expect(html).not.toContain('--ntbl-bc:');
			expect(html).toContain('border-collapse: collapse');
		});

		it('uses default border color fallback in cell CSS var', () => {
			const registry: SchemaRegistry = createRealTableRegistry();
			const doc = makeTable([[cell('A')]]);

			const html: string = serializeDocumentToHTML(doc, registry);

			expect(html).toContain('var(--ntbl-bc, #d0d0d0)');
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

		it('emits dir on li element for RTL list items', () => {
			const registry: SchemaRegistry = createListDirRegistry();
			const doc = createDocument([
				createBlockNode(nodeType('list_item'), [createTextNode('مرحبا')], undefined, {
					listType: 'bullet',
					indent: 0,
					checked: false,
					dir: 'rtl',
				}),
			]);

			const html: string = serializeDocumentToHTML(doc, registry);
			expect(html).toContain('<li dir="rtl">');
			expect(html).not.toContain('<ul dir=');
		});

		it('emits dir on li element for LTR ordered list items', () => {
			const registry: SchemaRegistry = createListDirRegistry();
			const doc = createDocument([
				createBlockNode(nodeType('list_item'), [createTextNode('Hello')], undefined, {
					listType: 'ordered',
					indent: 0,
					checked: false,
					dir: 'ltr',
				}),
			]);

			const html: string = serializeDocumentToHTML(doc, registry);
			expect(html).toContain('<li dir="ltr">');
			expect(html).not.toContain('<ol dir=');
		});

		it('omits dir on wrapper for auto direction', () => {
			const registry: SchemaRegistry = createListDirRegistry();
			const doc = createDocument([listItem('Hello', 'bullet', 0)]);

			const html: string = serializeDocumentToHTML(doc, registry);
			expect(html).not.toContain('dir=');
		});

		it('keeps mixed-direction items in a single wrapper with per-li dir', () => {
			const registry: SchemaRegistry = createListDirRegistry();
			const doc = createDocument([
				createBlockNode(nodeType('list_item'), [createTextNode('مرحبا')], undefined, {
					listType: 'bullet',
					indent: 0,
					checked: false,
					dir: 'rtl',
				}),
				createBlockNode(nodeType('list_item'), [createTextNode('Hello')], undefined, {
					listType: 'bullet',
					indent: 0,
					checked: false,
					dir: 'ltr',
				}),
			]);

			const html: string = serializeDocumentToHTML(doc, registry);
			expect(html).toBe('<ul><li dir="rtl">مرحبا</li><li dir="ltr">Hello</li></ul>');
		});
	});
});

/** List registry that allows dir attribute through DOMPurify. */
function createListDirRegistry(): SchemaRegistry {
	const nodeSpecs = new Map<string, { toHTML?: (node: unknown, content: string) => string }>([
		['paragraph', { toHTML: (_n, c) => `<p>${c || '<br>'}</p>` }],
		[
			'list_item',
			{
				toHTML: (_node: unknown, content: string) => {
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
		getAllowedTags: () => ['p', 'br', 'ul', 'ol', 'li'],
		getAllowedAttrs: () => ['style', 'dir'],
	} as unknown as SchemaRegistry;
}

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
		expect(result.html).toMatch(/class="notectl-s-[a-z0-9]+"/);
		expect(result.html).not.toContain('style=');
		expect(result.css).toMatch(/\.notectl-s-[a-z0-9]+/);
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
		// Extract the generated class name from the first match
		const classMatch: RegExpMatchArray | null = result.html.match(/class="(notectl-s-[a-z0-9]+)"/);
		expect(classMatch).not.toBeNull();
		const className: string | undefined = classMatch?.[1];
		if (!className) return;
		// Both paragraphs should use the same class
		const allMatches = result.html.match(new RegExp(className, 'g'));
		expect(allMatches).toHaveLength(2);
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

	it('normalizes legacy align: right to end in CSS class mode', () => {
		const registry: SchemaRegistry = createStyleMarkRegistry();
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello')], undefined, {
				align: 'right',
			}),
		]);

		const result = serializeDocumentToCSS(doc, registry);
		expect(result.html).toContain('class="notectl-align-end"');
		expect(result.html).not.toContain('notectl-align-right');
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
		expect(result.html).toMatch(
			/<p><strong><span class="notectl-s-[a-z0-9]+">hello<\/span><\/strong><\/p>/,
		);
		expect(result.css).toContain('color: red');
	});

	it('handles alignment + style marks independently', () => {
		const registry: SchemaRegistry = createStyleMarkRegistry();
		const doc = createDocument([
			createBlockNode(
				nodeType('paragraph'),
				[createTextNode('hello', [{ type: markType('textColor'), attrs: { color: 'blue' } }])],
				undefined,
				{ align: 'end' },
			),
		]);

		const result = serializeDocumentToCSS(doc, registry);
		// Block has alignment class, inline has style class
		expect(result.html).toContain('class="notectl-align-end"');
		expect(result.html).toMatch(/class="notectl-s-[a-z0-9]+"/);
		expect(result.css).toContain('.notectl-align-end');
		expect(result.css).toMatch(/\.notectl-s-[a-z0-9]+/);
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
		expect(result.html).toMatch(/class="notectl-s-[a-z0-9]+"/);
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

	// --- HTMLExportContext: plugin ctx.styleAttr() usage ---

	describe('HTMLExportContext for plugins', () => {
		function createTableClassRegistry(): SchemaRegistry {
			const nodeSpecs = new Map<
				string,
				{
					toHTML?: (
						node: unknown,
						content: string,
						ctx?: { styleAttr: (d: string) => string },
					) => string;
				}
			>([
				['paragraph', { toHTML: (_n, c) => `<p>${c || '<br>'}</p>` }],
				[
					'table',
					{
						toHTML: (_n, c, ctx) => {
							const style = 'border-collapse: collapse; width: 100%';
							const attr: string = ctx?.styleAttr(style) ?? ` style="${style}"`;
							return `<table${attr}>${c}</table>`;
						},
					},
				],
				['table_row', { toHTML: (_n, c) => `<tr>${c}</tr>` }],
				[
					'table_cell',
					{
						toHTML: (_n, c, ctx) => {
							const style = 'border: 1px solid #d0d0d0; padding: 8px';
							const attr: string = ctx?.styleAttr(style) ?? ` style="${style}"`;
							return `<td${attr}>${c}</td>`;
						},
					},
				],
			]);

			return {
				getNodeSpec: (type: string) => nodeSpecs.get(type) ?? undefined,
				getInlineNodeSpec: () => undefined,
				getMarkSpec: () => undefined,
				getMarkTypes: () => [],
				getAllowedTags: () => ['p', 'br', 'table', 'tbody', 'tr', 'td'],
				getAllowedAttrs: () => ['style', 'class', 'colspan', 'rowspan'],
			} as unknown as SchemaRegistry;
		}

		it('table uses class instead of inline style in class mode', () => {
			const registry: SchemaRegistry = createTableClassRegistry();
			const cell = (text: string): ReturnType<typeof createBlockNode> =>
				createBlockNode(nodeType('table_cell'), [
					createBlockNode(nodeType('paragraph'), [createTextNode(text)]),
				]);

			const doc = createDocument([
				createBlockNode(nodeType('table'), [
					createBlockNode(nodeType('table_row'), [cell('A'), cell('B')]),
				]),
			]);

			const result = serializeDocumentToCSS(doc, registry);
			expect(result.html).not.toContain('style=');
			expect(result.html).toContain('class="notectl-s');
			expect(result.css).toContain('border-collapse: collapse');
		});

		it('table cell uses class in CSS output', () => {
			const registry: SchemaRegistry = createTableClassRegistry();
			const cell = (text: string): ReturnType<typeof createBlockNode> =>
				createBlockNode(nodeType('table_cell'), [
					createBlockNode(nodeType('paragraph'), [createTextNode(text)]),
				]);

			const doc = createDocument([
				createBlockNode(nodeType('table'), [createBlockNode(nodeType('table_row'), [cell('X')])]),
			]);

			const result = serializeDocumentToCSS(doc, registry);
			expect(result.css).toContain('border: 1px solid #d0d0d0');
			expect(result.css).toContain('padding: 8px');
		});

		it('code block backgroundColor uses class instead of inline style', () => {
			const nodeSpecs = new Map<
				string,
				{
					toHTML?: (
						node: unknown,
						content: string,
						ctx?: { styleAttr: (d: string) => string },
					) => string;
				}
			>([
				[
					'code_block',
					{
						toHTML: (node: unknown, content: string, ctx) => {
							const n = node as { attrs?: Record<string, unknown> };
							const bg: string = (n.attrs?.backgroundColor as string) ?? '';
							const bgAttr: string = bg
								? (ctx?.styleAttr(`background-color: ${bg}`) ?? ` style="background-color: ${bg}"`)
								: '';
							return `<pre${bgAttr}><code>${content || ''}</code></pre>`;
						},
					},
				],
			]);

			const registry: SchemaRegistry = {
				getNodeSpec: (type: string) => nodeSpecs.get(type) ?? undefined,
				getInlineNodeSpec: () => undefined,
				getMarkSpec: () => undefined,
				getMarkTypes: () => [],
				getAllowedTags: () => ['pre', 'code'],
				getAllowedAttrs: () => ['style', 'class'],
			} as unknown as SchemaRegistry;

			const doc = createDocument([
				createBlockNode(nodeType('code_block'), [createTextNode('const x = 1;')], undefined, {
					backgroundColor: '#1e1e1e',
				}),
			]);

			const result = serializeDocumentToCSS(doc, registry);
			expect(result.html).not.toContain('style=');
			expect(result.html).toContain('class="notectl-s');
			expect(result.css).toContain('background-color: #1e1e1e');
		});

		it('merges alignment class into existing class from ctx.styleAttr()', () => {
			const nodeSpecs = new Map<
				string,
				{
					toHTML?: (
						node: unknown,
						content: string,
						ctx?: { styleAttr: (d: string) => string },
					) => string;
				}
			>([
				[
					'custom',
					{
						toHTML: (_n, c, ctx) => {
							const attr: string = ctx?.styleAttr('padding: 10px') ?? '';
							return `<div${attr}>${c}</div>`;
						},
					},
				],
			]);

			const registry: SchemaRegistry = {
				getNodeSpec: (type: string) => nodeSpecs.get(type) ?? undefined,
				getInlineNodeSpec: () => undefined,
				getMarkSpec: () => undefined,
				getMarkTypes: () => [],
				getAllowedTags: () => ['div'],
				getAllowedAttrs: () => ['style', 'class'],
			} as unknown as SchemaRegistry;

			const doc = createDocument([
				createBlockNode(nodeType('custom' as never), [createTextNode('hello')], undefined, {
					align: 'center',
				}),
			]);

			const result = serializeDocumentToCSS(doc, registry);
			// Both the style class and alignment class should be on the same element
			expect(result.html).toMatch(/class="notectl-s[^ ]+ notectl-align-center"/);
			expect(result.css).toContain('padding: 10px');
			expect(result.css).toContain('text-align: center');
		});

		it('defense-in-depth: strips rogue inline style in class mode', () => {
			const nodeSpecs = new Map<string, { toHTML?: (node: unknown, content: string) => string }>([
				[
					'rogue',
					{
						// Plugin that forgot to use ctx.styleAttr()
						toHTML: (_n, c) => `<div style="color: red">${c}</div>`,
					},
				],
			]);

			const registry: SchemaRegistry = {
				getNodeSpec: (type: string) => nodeSpecs.get(type) ?? undefined,
				getInlineNodeSpec: () => undefined,
				getMarkSpec: () => undefined,
				getMarkTypes: () => [],
				getAllowedTags: () => ['div'],
				getAllowedAttrs: () => ['style', 'class'],
			} as unknown as SchemaRegistry;

			const doc = createDocument([
				createBlockNode(nodeType('rogue' as never), [createTextNode('hello')]),
			]);

			const result = serializeDocumentToCSS(doc, registry);
			// DOMPurify strips the style attribute in class mode
			expect(result.html).not.toContain('style=');
		});

		it('image alignment via serializer produces class in class mode', () => {
			const nodeSpecs = new Map<string, { toHTML?: (node: unknown, content: string) => string }>([
				[
					'image',
					{
						toHTML: (node: unknown) => {
							const n = node as { attrs?: Record<string, unknown> };
							const src: string = (n.attrs?.src as string) ?? '';
							return `<figure><img src="${src}" alt=""></figure>`;
						},
					},
				],
			]);

			const registry: SchemaRegistry = {
				getNodeSpec: (type: string) => nodeSpecs.get(type) ?? undefined,
				getInlineNodeSpec: () => undefined,
				getMarkSpec: () => undefined,
				getMarkTypes: () => [],
				getAllowedTags: () => ['figure', 'img'],
				getAllowedAttrs: () => ['style', 'class', 'src', 'alt'],
			} as unknown as SchemaRegistry;

			const doc = createDocument([
				createBlockNode(nodeType('image'), [], undefined, {
					src: 'photo.jpg',
					align: 'center',
				}),
			]);

			const result = serializeDocumentToCSS(doc, registry);
			expect(result.html).toContain('class="notectl-align-center"');
			expect(result.html).not.toContain('style=');
			expect(result.css).toContain('text-align: center');
		});
	});
});
