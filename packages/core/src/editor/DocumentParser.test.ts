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
import { serializeDocumentToCSS } from './DocumentSerializer.js';

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

		it('parses text-align: right', () => {
			const doc = parseHTMLToDocument('<p style="text-align: right">hello</p>');
			const block = doc.children[0];
			if (!block) return;
			expect(block.attrs?.align).toBe('right');
		});

		it('parses text-align: justify', () => {
			const doc = parseHTMLToDocument('<p style="text-align: justify">hello</p>');
			const block = doc.children[0];
			if (!block) return;
			expect(block.attrs?.align).toBe('justify');
		});

		it('ignores invalid alignment values', () => {
			const doc = parseHTMLToDocument('<p style="text-align: start">hello</p>');
			const block = doc.children[0];
			if (!block) return;
			expect(block.attrs?.align).toBeUndefined();
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
});
