import { describe, expect, it } from 'vitest';
import type { Mark } from '../model/Document.js';
import {
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockText,
	getInlineChildren,
	isInlineNode,
} from '../model/Document.js';
import type { InlineNodeSpec } from '../model/InlineNodeSpec.js';
import type { MarkSpec } from '../model/MarkSpec.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { markType, nodeType } from '../model/TypeBrands.js';
import { parseHTMLToDocument } from './DocumentParser.js';
import { serializeDocumentToCSS, serializeDocumentToHTML } from './DocumentSerializer.js';

/** Creates a registry stub with list, heading, inline (hard_break), and mark parse rules. */
function createTestRegistry(): SchemaRegistry {
	const nodeSpecs = new Map<
		string,
		{
			parseHTML?: readonly {
				tag: string;
				getAttrs?: (el: HTMLElement) => Record<string, unknown> | false;
			}[];
		}
	>([
		['paragraph', {}],
		[
			'heading',
			{
				parseHTML: [
					{
						tag: 'h1',
						getAttrs: () => ({ level: 1 }),
					},
					{
						tag: 'h2',
						getAttrs: () => ({ level: 2 }),
					},
				],
			},
		],
		[
			'list_item',
			{
				parseHTML: [{ tag: 'li' }],
			},
		],
	]);

	const inlineSpecs = new Map<string, InlineNodeSpec>([
		[
			'hard_break',
			{
				type: 'hard_break',
				toDOM: () => document.createElement('br'),
				toHTMLString: () => '<br>',
				parseHTML: [{ tag: 'br' }],
				sanitize: { tags: ['br'] },
			},
		],
	]);

	const markSpecs = new Map<
		string,
		{
			rank: number;
			parseHTML?: readonly {
				tag: string;
				getAttrs?: (el: HTMLElement) => Record<string, unknown> | false;
			}[];
		}
	>([
		[
			'bold',
			{
				rank: 1,
				parseHTML: [{ tag: 'strong' }, { tag: 'b' }],
			},
		],
	]);

	return {
		getNodeSpec: (type: string) => nodeSpecs.get(type) ?? undefined,
		getInlineNodeSpec: (type: string) => inlineSpecs.get(type) ?? undefined,
		getMarkSpec: (type: string) => markSpecs.get(type) ?? undefined,
		getMarkTypes: () => [...markSpecs.keys()],
		getBlockParseRules: () => {
			const rules: {
				rule: { tag: string; getAttrs?: (el: HTMLElement) => Record<string, unknown> | false };
				type: string;
			}[] = [];
			for (const [type, spec] of nodeSpecs) {
				if (spec.parseHTML) {
					for (const rule of spec.parseHTML) {
						rules.push({ rule, type });
					}
				}
			}
			return rules;
		},
		getMarkParseRules: () => {
			const rules: {
				rule: { tag: string; getAttrs?: (el: HTMLElement) => Record<string, unknown> | false };
				type: string;
			}[] = [];
			for (const [type, spec] of markSpecs) {
				if (spec.parseHTML) {
					for (const rule of spec.parseHTML) {
						rules.push({ rule, type });
					}
				}
			}
			return rules;
		},
		getInlineParseRules: () => {
			const rules: {
				rule: { tag: string; getAttrs?: (el: HTMLElement) => Record<string, unknown> | false };
				type: string;
			}[] = [];
			for (const [type, spec] of inlineSpecs) {
				if (spec.parseHTML) {
					for (const rule of spec.parseHTML) {
						rules.push({ rule, type });
					}
				}
			}
			return rules;
		},
		getAllowedTags: () => [
			'p',
			'br',
			'div',
			'span',
			'strong',
			'b',
			'em',
			'h1',
			'h2',
			'ul',
			'ol',
			'li',
			'input',
		],
		getAllowedAttrs: () => ['style', 'type', 'disabled', 'checked'],
	} as unknown as SchemaRegistry;
}

describe('parseHTMLToDocument', () => {
	it('parses a simple paragraph', () => {
		const doc = parseHTMLToDocument('<p>Hello world</p>');
		expect(doc.children).toHaveLength(1);
		const block = doc.children[0];
		if (!block) return;
		expect(block.type).toBe('paragraph');
		expect(getBlockText(block)).toBe('Hello world');
	});

	it('parses multiple paragraphs', () => {
		const doc = parseHTMLToDocument('<p>First</p><p>Second</p>');
		expect(doc.children).toHaveLength(2);
		const first = doc.children[0];
		const second = doc.children[1];
		if (!first || !second) return;
		expect(getBlockText(first)).toBe('First');
		expect(getBlockText(second)).toBe('Second');
	});

	it('strips unsupported tags without registry', () => {
		const doc = parseHTMLToDocument('<ul><li>Item 1</li><li>Item 2</li></ul>');
		expect(doc.children.length).toBeGreaterThan(0);
	});

	it('returns default document for empty HTML', () => {
		const doc = parseHTMLToDocument('');
		expect(doc.children).toHaveLength(1);
		expect(doc.children[0]?.type).toBe('paragraph');
	});

	it('handles plain text nodes', () => {
		const doc = parseHTMLToDocument('Just text');
		expect(doc.children).toHaveLength(1);
		const block = doc.children[0];
		if (!block) return;
		expect(getBlockText(block)).toBe('Just text');
	});

	it('extracts text from a simple element', () => {
		const doc = parseHTMLToDocument('<p>hello</p>');
		expect(doc.children).toHaveLength(1);
		const block = doc.children[0];
		if (!block) return;
		expect(getBlockText(block)).toBe('hello');
	});

	it('produces empty text node for empty element', () => {
		const doc = parseHTMLToDocument('<p></p>');
		expect(doc.children).toHaveLength(1);
		const block = doc.children[0];
		if (!block) return;
		expect(block.children).toHaveLength(1);
		expect(block.children[0]?.text).toBe('');
	});

	it('falls back to paragraph when no block parse rules match', () => {
		const doc = parseHTMLToDocument('<div>content</div>');
		expect(doc.children.length).toBeGreaterThan(0);
		const block = doc.children[0];
		if (!block) return;
		expect(block.type).toBe('paragraph');
		expect(getBlockText(block)).toBe('content');
	});

	// --- Alignment parsing ---

	describe('alignment parsing', () => {
		it('parses text-align: center from paragraph', () => {
			const doc = parseHTMLToDocument('<p style="text-align: center">hello</p>');
			const block = doc.children[0];
			if (!block) return;
			expect(block.type).toBe('paragraph');
			expect(block.attrs?.align).toBe('center');
		});

		it('parses text-align: right as end (backward compat)', () => {
			const doc = parseHTMLToDocument('<p style="text-align: right">hello</p>');
			const block = doc.children[0];
			if (!block) return;
			expect(block.attrs?.align).toBe('end');
		});

		it('parses text-align: justify', () => {
			const doc = parseHTMLToDocument('<p style="text-align: justify">hello</p>');
			const block = doc.children[0];
			if (!block) return;
			expect(block.attrs?.align).toBe('justify');
		});

		it('parses text-align: start as start', () => {
			const doc = parseHTMLToDocument('<p style="text-align: start">hello</p>');
			const block = doc.children[0];
			if (!block) return;
			expect(block.attrs?.align).toBe('start');
		});

		it('ignores invalid alignment values', () => {
			const doc = parseHTMLToDocument('<p style="text-align: middle">hello</p>');
			const block = doc.children[0];
			if (!block) return;
			expect(block.attrs?.align).toBeUndefined();
		});
	});

	// --- Direction parsing ---

	describe('direction parsing', () => {
		it('parses dir="rtl" from paragraph', () => {
			const doc = parseHTMLToDocument('<p dir="rtl">مرحبا</p>');
			const block = doc.children[0];
			if (!block) return;
			expect(block.attrs?.dir).toBe('rtl');
		});

		it('parses dir="ltr" from paragraph', () => {
			const doc = parseHTMLToDocument('<p dir="ltr">Hello</p>');
			const block = doc.children[0];
			if (!block) return;
			expect(block.attrs?.dir).toBe('ltr');
		});

		it('omits dir for auto (default)', () => {
			const doc = parseHTMLToDocument('<p dir="auto">Hello</p>');
			const block = doc.children[0];
			if (!block) return;
			expect(block.attrs?.dir).toBeUndefined();
		});

		it('omits dir when absent', () => {
			const doc = parseHTMLToDocument('<p>Hello</p>');
			const block = doc.children[0];
			if (!block) return;
			expect(block.attrs?.dir).toBeUndefined();
		});

		it('ignores invalid dir values', () => {
			const doc = parseHTMLToDocument('<p dir="diagonal">Hello</p>');
			const block = doc.children[0];
			if (!block) return;
			expect(block.attrs?.dir).toBeUndefined();
		});

		it('parses dir on div fallback elements', () => {
			const doc = parseHTMLToDocument('<div dir="rtl">عنوان</div>');
			const block = doc.children[0];
			if (!block) return;
			expect(block.attrs?.dir).toBe('rtl');
		});

		it('parses direction from inline style (Word/Docs paste)', () => {
			const doc = parseHTMLToDocument('<p style="direction: rtl">مرحبا</p>');
			const block = doc.children[0];
			if (!block) return;
			expect(block.attrs?.dir).toBe('rtl');
		});

		it('dir attribute takes priority over inline style direction', () => {
			const doc = parseHTMLToDocument('<p dir="ltr" style="direction: rtl">Hello</p>');
			const block = doc.children[0];
			if (!block) return;
			expect(block.attrs?.dir).toBe('ltr');
		});

		it('ignores invalid inline style direction values', () => {
			const doc = parseHTMLToDocument('<p style="direction: diagonal">Hello</p>');
			const block = doc.children[0];
			if (!block) return;
			expect(block.attrs?.dir).toBeUndefined();
		});
	});

	// --- Nested list parsing ---

	describe('nested list parsing', () => {
		it('parses flat list into list items with indent 0', () => {
			const registry = createTestRegistry();
			const doc = parseHTMLToDocument('<ul><li>A</li><li>B</li></ul>', registry);

			expect(doc.children).toHaveLength(2);
			for (const block of doc.children) {
				expect(block.type).toBe('list_item');
				expect(block.attrs?.indent).toBe(0);
			}
		});

		it('parses nested list with correct indent depths', () => {
			const registry = createTestRegistry();
			const doc = parseHTMLToDocument('<ul><li>A<ul><li>B</li></ul></li></ul>', registry);

			expect(doc.children).toHaveLength(2);
			const first = doc.children[0];
			const second = doc.children[1];
			if (!first || !second) return;
			expect(getBlockText(first)).toBe('A');
			expect(first.attrs?.indent).toBe(0);
			expect(getBlockText(second)).toBe('B');
			expect(second.attrs?.indent).toBe(1);
		});

		it('parses ordered list as listType: ordered', () => {
			const registry = createTestRegistry();
			const doc = parseHTMLToDocument('<ol><li>First</li><li>Second</li></ol>', registry);

			expect(doc.children).toHaveLength(2);
			for (const block of doc.children) {
				expect(block.attrs?.listType).toBe('ordered');
			}
		});

		it('parses direct nested list without wrapping <li> with incremented indent', () => {
			const registry = createTestRegistry();
			const doc = parseHTMLToDocument('<ul><ul><li>Nested</li></ul></ul>', registry);

			expect(doc.children).toHaveLength(1);
			const block = doc.children[0];
			if (!block) return;
			expect(getBlockText(block)).toBe('Nested');
			expect(block.attrs?.indent).toBe(1);
		});

		it('roundtrips nested list (valid HTML5 format)', () => {
			const registry = createTestRegistry();
			const doc = parseHTMLToDocument('<ul><li>A<ul><li>B</li></ul></li></ul>', registry);

			expect(doc.children).toHaveLength(2);
			const first = doc.children[0];
			const second = doc.children[1];
			if (!first || !second) return;
			expect(getBlockText(first)).toBe('A');
			expect(first.attrs?.indent).toBe(0);
			expect(getBlockText(second)).toBe('B');
			expect(second.attrs?.indent).toBe(1);
		});

		it('parses checklist items from input[type=checkbox]', () => {
			const registry = createTestRegistry();
			const doc = parseHTMLToDocument(
				'<ul><li><input type="checkbox" checked>Done</li><li><input type="checkbox">Todo</li></ul>',
				registry,
			);

			expect(doc.children).toHaveLength(2);
			const done = doc.children[0];
			const todo = doc.children[1];
			if (!done || !todo) return;

			expect(done.attrs?.listType).toBe('checklist');
			expect(done.attrs?.checked).toBe(true);
			expect(todo.attrs?.listType).toBe('checklist');
			expect(todo.attrs?.checked).toBe(false);
		});
	});

	// --- InlineNode parsing ---

	describe('InlineNode parsing', () => {
		it('parses <br> inside paragraph as InlineNode hard_break', () => {
			const registry = createTestRegistry();
			const doc = parseHTMLToDocument('<p>Hello<br>World</p>', registry);

			expect(doc.children).toHaveLength(1);
			const block = doc.children[0];
			if (!block) return;

			const children = getInlineChildren(block);
			expect(children).toHaveLength(3);
			expect(children[0]?.text).toBe('Hello');
			const child1 = children[1];
			if (!child1) return;
			expect(isInlineNode(child1)).toBe(true);
			if (isInlineNode(child1)) {
				expect(child1.inlineType).toBe('hard_break');
			}
			expect(children[2]?.text).toBe('World');
		});
	});

	describe('styleMap round-trip', () => {
		it('rehydrates class-based span styles via styleMap', () => {
			const registry: SchemaRegistry = createTestRegistry();
			const styleMap = new Map<string, string>([['notectl-s-abc123', 'color: red']]);

			const doc = parseHTMLToDocument(
				'<p><span class="notectl-s-abc123">hello</span></p>',
				registry,
				{ styleMap },
			);

			expect(doc.children).toHaveLength(1);
			const block = doc.children[0];
			if (!block) return;
			expect(block.type).toBe('paragraph');
			// The span with rehydrated inline style should be parsed by mark rules
			// (if matching), or at minimum the text content should survive
			expect(getBlockText(block)).toBe('hello');
		});

		it('rehydrates alignment class names via extractAlignment', () => {
			const styleMap = new Map<string, string>([['notectl-align-center', 'text-align: center']]);

			const doc = parseHTMLToDocument('<p class="notectl-align-center">centered</p>', undefined, {
				styleMap,
			});

			expect(doc.children).toHaveLength(1);
			const block = doc.children[0];
			if (!block) return;
			expect(block.attrs?.align).toBe('center');
		});

		it('gracefully handles missing styleMap', () => {
			const doc = parseHTMLToDocument('<p><span class="notectl-s-abc123">hello</span></p>');
			expect(doc.children).toHaveLength(1);
			const block = doc.children[0];
			if (!block) return;
			expect(getBlockText(block)).toBe('hello');
		});

		it('gracefully handles empty styleMap', () => {
			const doc = parseHTMLToDocument(
				'<p><span class="notectl-s-abc123">hello</span></p>',
				undefined,
				{ styleMap: new Map() },
			);
			expect(doc.children).toHaveLength(1);
			const block = doc.children[0];
			if (!block) return;
			expect(getBlockText(block)).toBe('hello');
		});

		it('rehydrates multiple classes on the same element', () => {
			const styleMap = new Map<string, string>([
				['notectl-s-aaa111', 'color: red'],
				['notectl-s-bbb222', 'font-size: 14px'],
			]);

			const doc = parseHTMLToDocument(
				'<p><span class="notectl-s-aaa111 notectl-s-bbb222">styled</span></p>',
				undefined,
				{ styleMap },
			);

			expect(doc.children).toHaveLength(1);
			const block = doc.children[0];
			if (!block) return;
			expect(getBlockText(block)).toBe('styled');
		});
	});
});

describe('full round-trip: serializeDocumentToCSS → parseHTMLToDocument', () => {
	/**
	 * Creates a registry that supports style-mark round-trip:
	 * - `toHTMLStyle` for CSS class-based export
	 * - `parseHTML` for re-import via rehydrated inline styles
	 */
	function createRoundTripRegistry(): SchemaRegistry {
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
					parseHTML: [
						{
							tag: 'span',
							getAttrs: (el: HTMLElement) => {
								const color: string = el.style.color;
								if (!color) return false;
								return { color };
							},
						},
					],
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
					parseHTML: [
						{
							tag: 'span',
							getAttrs: (el: HTMLElement) => {
								const bg: string = el.style.backgroundColor;
								if (!bg) return false;
								return { color: bg };
							},
						},
					],
				},
			],
			[
				'bold',
				{
					type: 'bold',
					rank: 1,
					toDOM: () => document.createElement('strong'),
					toHTMLString: (_mark: Mark, content: string) => `<strong>${content}</strong>`,
					parseHTML: [{ tag: 'strong' }],
				},
			],
		]);

		return {
			getNodeSpec: () => undefined,
			getInlineNodeSpec: () => undefined,
			getMarkSpec: (type: string) => markSpecs.get(type) ?? undefined,
			getMarkTypes: () => [...markSpecs.keys()],
			getBlockParseRules: () => [],
			getMarkParseRules: () => {
				const rules: {
					rule: { tag: string; getAttrs?: (el: HTMLElement) => Record<string, unknown> | false };
					type: string;
				}[] = [];
				for (const [type, spec] of markSpecs) {
					if (spec.parseHTML) {
						for (const rule of spec.parseHTML) {
							rules.push({ rule, type });
						}
					}
				}
				return rules;
			},
			getInlineParseRules: () => [],
			getAllowedTags: () => ['p', 'br', 'span', 'strong'],
			getAllowedAttrs: () => ['style', 'class'],
		} as unknown as SchemaRegistry;
	}

	it('round-trips text color through class-based export and re-import', () => {
		const registry: SchemaRegistry = createRoundTripRegistry();
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [
				createTextNode('hello', [{ type: markType('textColor'), attrs: { color: 'red' } }]),
			]),
		]);

		// Export with class mode
		const result = serializeDocumentToCSS(doc, registry);
		expect(result.html).not.toContain('style=');
		expect(result.styleMap.size).toBeGreaterThan(0);

		// Re-import with styleMap
		const imported = parseHTMLToDocument(result.html, registry, { styleMap: result.styleMap });
		expect(imported.children).toHaveLength(1);
		const block = imported.children[0];
		if (!block) return;
		expect(getBlockText(block)).toBe('hello');

		// Verify the textColor mark survived round-trip
		const children = getInlineChildren(block);
		expect(children).toHaveLength(1);
		const textNode = children[0];
		if (!textNode || !('marks' in textNode)) return;
		const colorMark = textNode.marks.find((m) => m.type === 'textColor');
		expect(colorMark).toBeDefined();
		expect((colorMark?.attrs as Record<string, unknown>)?.color).toBe('red');
	});

	it('round-trips alignment through class-based export and re-import', () => {
		const registry: SchemaRegistry = createRoundTripRegistry();
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('centered')], undefined, {
				align: 'center',
			}),
		]);

		// Export with class mode
		const result = serializeDocumentToCSS(doc, registry);
		expect(result.html).toContain('notectl-align-center');
		expect(result.html).not.toContain('style=');

		// Re-import with styleMap
		const imported = parseHTMLToDocument(result.html, registry, { styleMap: result.styleMap });
		expect(imported.children).toHaveLength(1);
		const block = imported.children[0];
		if (!block) return;
		expect(block.attrs?.align).toBe('center');
	});

	it('round-trips bold + text color through class-based export and re-import', () => {
		const registry: SchemaRegistry = createRoundTripRegistry();
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [
				createTextNode('styled', [
					{ type: markType('bold') },
					{ type: markType('textColor'), attrs: { color: 'blue' } },
				]),
			]),
		]);

		// Export with class mode
		const result = serializeDocumentToCSS(doc, registry);
		expect(result.html).not.toContain('style=');

		// Re-import with styleMap
		const imported = parseHTMLToDocument(result.html, registry, { styleMap: result.styleMap });
		expect(imported.children).toHaveLength(1);
		const block = imported.children[0];
		if (!block) return;
		expect(getBlockText(block)).toBe('styled');

		// Verify both marks survived
		const children = getInlineChildren(block);
		expect(children).toHaveLength(1);
		const textNode = children[0];
		if (!textNode || !('marks' in textNode)) return;
		const boldMark = textNode.marks.find((m) => m.type === 'bold');
		const colorMark = textNode.marks.find((m) => m.type === 'textColor');
		expect(boldMark).toBeDefined();
		expect(colorMark).toBeDefined();
		expect((colorMark?.attrs as Record<string, unknown>)?.color).toBe('blue');
	});

	// --- List dir attribute parsing ---

	describe('list dir parsing', () => {
		it('parses dir from li elements onto list items', () => {
			const html = '<ul><li dir="rtl">مرحبا</li><li dir="ltr">Hello</li></ul>';
			const doc = parseHTMLToDocument(html, createListParseRegistry());

			expect(doc.children).toHaveLength(2);
			expect(doc.children[0]?.attrs?.dir).toBe('rtl');
			expect(doc.children[1]?.attrs?.dir).toBe('ltr');
		});

		it('parses dir from ul element onto list items', () => {
			const html = '<ul dir="rtl"><li>مرحبا</li><li>عالم</li></ul>';
			const doc = parseHTMLToDocument(html, createListParseRegistry());

			expect(doc.children).toHaveLength(2);
			expect(doc.children[0]?.attrs?.dir).toBe('rtl');
			expect(doc.children[1]?.attrs?.dir).toBe('rtl');
		});

		it('roundtrips list dir through serialize and parse', () => {
			const registry = createListParseRegistry();
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
			const parsed = parseHTMLToDocument(html, registry);

			expect(parsed.children).toHaveLength(2);
			expect(parsed.children[0]?.attrs?.dir).toBe('rtl');
			expect(parsed.children[1]?.attrs?.dir).toBe('ltr');
		});
	});
});

describe('table HTML parsing', () => {
	/** Creates a registry that allows table-related tags. */
	function createTableRegistry(): SchemaRegistry {
		return {
			getNodeSpec: () => undefined,
			getInlineNodeSpec: () => undefined,
			getMarkSpec: () => undefined,
			getMarkTypes: () => [],
			getBlockParseRules: () => [],
			getMarkParseRules: () => [],
			getInlineParseRules: () => [],
			getAllowedTags: () => ['p', 'br', 'table', 'tbody', 'thead', 'tr', 'td', 'th'],
			getAllowedAttrs: () => ['style', 'dir'],
		} as unknown as SchemaRegistry;
	}

	it('parses a simple 2x2 table', () => {
		const registry = createTableRegistry();
		const html = '<table><tr><td>A1</td><td>B1</td></tr><tr><td>A2</td><td>B2</td></tr></table>';
		const doc = parseHTMLToDocument(html, registry);

		expect(doc.children).toHaveLength(1);
		const table = doc.children[0];
		if (!table) return;
		expect(table.type).toBe('table');
		expect(table.children).toHaveLength(2);

		// First row
		const row0 = table.children[0];
		if (!row0 || !('type' in row0)) return;
		expect(row0.type).toBe('table_row');
		expect(row0.children).toHaveLength(2);

		// Cell A1
		const cell00 = row0.children[0];
		if (!cell00 || !('type' in cell00)) return;
		expect(cell00.type).toBe('table_cell');
		expect(cell00.children).toHaveLength(1);
		const para00 = cell00.children[0];
		if (!para00 || !('type' in para00)) return;
		expect(para00.type).toBe('paragraph');
		expect(getBlockText(para00)).toBe('A1');

		// Cell B1
		const cell01 = row0.children[1];
		if (!cell01 || !('type' in cell01)) return;
		expect(getBlockText(cell01.children[0] as never)).toBe('B1');
	});

	it('parses table with tbody wrapper', () => {
		const registry = createTableRegistry();
		const html = '<table><tbody><tr><td>cell</td></tr></tbody></table>';
		const doc = parseHTMLToDocument(html, registry);

		expect(doc.children).toHaveLength(1);
		const table = doc.children[0];
		if (!table) return;
		expect(table.type).toBe('table');
		expect(table.children).toHaveLength(1);
		expect(table.children[0]?.type).toBe('table_row');
	});

	it('parses table alongside paragraphs', () => {
		const registry = createTableRegistry();
		const html = '<p>Before</p><table><tr><td>Cell</td></tr></table><p>After</p>';
		const doc = parseHTMLToDocument(html, registry);

		expect(doc.children).toHaveLength(3);
		const first = doc.children[0];
		const third = doc.children[2];
		if (!first || !third) {
			expect.unreachable('should have 3 children');
			return;
		}
		expect(first.type).toBe('paragraph');
		expect(getBlockText(first)).toBe('Before');
		expect(doc.children[1]?.type).toBe('table');
		expect(third.type).toBe('paragraph');
		expect(getBlockText(third)).toBe('After');
	});

	it('produces empty paragraph for empty cells', () => {
		const registry = createTableRegistry();
		const html = '<table><tr><td></td></tr></table>';
		const doc = parseHTMLToDocument(html, registry);

		const table = doc.children[0];
		if (!table) return;
		const row = table.children[0];
		if (!row || !('children' in row)) return;
		const cell = row.children[0];
		if (!cell || !('children' in cell)) return;
		expect(cell.children).toHaveLength(1);
		expect(cell.children[0]?.type).toBe('paragraph');
	});

	it('preserves borderColor from --ntbl-bc CSS variable', () => {
		const registry = createTableRegistry();
		const html =
			'<table style="border-collapse: collapse; width: 100%; --ntbl-bc: #f1c232">' +
			'<tr><td>A</td></tr></table>';
		const doc = parseHTMLToDocument(html, registry);

		const table = doc.children[0];
		if (!table) return;
		expect(table.attrs?.borderColor).toBe('#f1c232');
	});

	it('converts transparent --ntbl-bc to borderColor "none"', () => {
		const registry = createTableRegistry();
		const html = '<table style="--ntbl-bc: transparent"><tr><td>A</td></tr></table>';
		const doc = parseHTMLToDocument(html, registry);

		const table = doc.children[0];
		if (!table) return;
		expect(table.attrs?.borderColor).toBe('none');
	});

	it('does not set borderColor when --ntbl-bc is absent', () => {
		const registry = createTableRegistry();
		const html = '<table style="border-collapse: collapse"><tr><td>A</td></tr></table>';
		const doc = parseHTMLToDocument(html, registry);

		const table = doc.children[0];
		if (!table) return;
		expect(table.attrs).toBeUndefined();
	});

	it('preserves colspan and rowspan on table cells', () => {
		const registry = {
			...createTableRegistry(),
			getAllowedAttrs: () => ['style', 'dir', 'colspan', 'rowspan'],
		} as unknown as SchemaRegistry;
		const html = '<table><tr><td colspan="2" rowspan="3">Wide</td><td>B</td></tr></table>';
		const doc = parseHTMLToDocument(html, registry);

		const table = doc.children[0];
		if (!table) return;
		const row = table.children[0];
		if (!row || !('children' in row)) return;
		const cell0 = row.children[0];
		if (!cell0 || !('type' in cell0)) return;
		expect(cell0.attrs?.colspan).toBe(2);
		expect(cell0.attrs?.rowspan).toBe(3);

		const cell1 = row.children[1];
		if (!cell1 || !('type' in cell1)) return;
		expect(cell1.attrs).toBeUndefined();
	});
});

/** Creates a registry for list direction parsing tests. */
function createListParseRegistry(): SchemaRegistry {
	const nodeSpecs = new Map<
		string,
		{
			toHTML?: (node: unknown, content: string) => string;
			parseHTML?: readonly { tag: string; getAttrs?: (el: HTMLElement) => unknown }[];
		}
	>([
		['paragraph', { toHTML: (_n, c) => `<p>${c || '<br>'}</p>` }],
		[
			'list_item',
			{
				toHTML: (_node: unknown, content: string) => `<li>${content || '<br>'}</li>`,
				parseHTML: [{ tag: 'li' }],
			},
		],
	]);

	return {
		getNodeSpec: (type: string) => nodeSpecs.get(type) ?? undefined,
		getInlineNodeSpec: () => undefined,
		getMarkSpec: () => undefined,
		getMarkTypes: () => [],
		getBlockParseRules: () => [],
		getMarkParseRules: () => [],
		getInlineParseRules: () => [],
		getAllowedTags: () => ['p', 'br', 'ul', 'ol', 'li'],
		getAllowedAttrs: () => ['style', 'dir'],
	} as unknown as SchemaRegistry;
}
