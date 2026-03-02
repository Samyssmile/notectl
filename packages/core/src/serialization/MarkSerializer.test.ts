import { describe, expect, it } from 'vitest';
import type { Mark } from '../model/Document.js';
import type { MarkSpec } from '../model/MarkSpec.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { markType } from '../model/TypeBrands.js';
import { CSSClassCollector } from './CSSClassCollector.js';
import {
	buildMarkOrder,
	serializeMarksToClassHTML,
	serializeMarksToHTML,
} from './MarkSerializer.js';

/** Creates a registry with tag-based and style-based mark specs. */
function createRegistry(): SchemaRegistry {
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
	]);

	return {
		getNodeSpec: () => undefined,
		getInlineNodeSpec: () => undefined,
		getMarkSpec: (type: string) => markSpecs.get(type) ?? undefined,
		getMarkTypes: () => [...markSpecs.keys()],
		getAllowedTags: () => ['p', 'br', 'strong', 'em', 'span'],
		getAllowedAttrs: () => ['style'],
	} as unknown as SchemaRegistry;
}

describe('buildMarkOrder', () => {
	it('builds rank map from registry', () => {
		const registry: SchemaRegistry = createRegistry();
		const order: Map<string, number> = buildMarkOrder(registry);
		expect(order.get('bold')).toBe(1);
		expect(order.get('italic')).toBe(2);
		expect(order.get('highlight')).toBe(4);
		expect(order.get('textColor')).toBe(5);
	});
});

describe('serializeMarksToHTML', () => {
	it('returns escaped text with no marks', () => {
		const registry: SchemaRegistry = createRegistry();
		const html: string = serializeMarksToHTML('<b>hi</b>', [], registry);
		expect(html).toBe('&lt;b&gt;hi&lt;/b&gt;');
	});

	it('returns empty string for empty text', () => {
		const registry: SchemaRegistry = createRegistry();
		const html: string = serializeMarksToHTML('', [{ type: markType('bold') }], registry);
		expect(html).toBe('');
	});

	it('wraps text with tag-based marks', () => {
		const registry: SchemaRegistry = createRegistry();
		const html: string = serializeMarksToHTML('hello', [{ type: markType('bold') }], registry);
		expect(html).toBe('<strong>hello</strong>');
	});

	it('nests multiple tag-based marks in rank order', () => {
		const registry: SchemaRegistry = createRegistry();
		const html: string = serializeMarksToHTML(
			'hello',
			[{ type: markType('italic') }, { type: markType('bold') }],
			registry,
		);
		// bold (rank 1) is inner, italic (rank 2) is outer
		expect(html).toBe('<em><strong>hello</strong></em>');
	});

	it('merges style-based marks into single span', () => {
		const registry: SchemaRegistry = createRegistry();
		const html: string = serializeMarksToHTML(
			'hello',
			[
				{ type: markType('textColor'), attrs: { color: 'red' } },
				{ type: markType('highlight'), attrs: { color: 'yellow' } },
			],
			registry,
		);
		expect(html).toContain('style="background-color: yellow; color: red"');
		expect(html).not.toMatch(/<span[^>]*><span/);
	});

	it('wraps tag marks outside style span', () => {
		const registry: SchemaRegistry = createRegistry();
		const html: string = serializeMarksToHTML(
			'hello',
			[{ type: markType('bold') }, { type: markType('textColor'), attrs: { color: 'red' } }],
			registry,
		);
		expect(html).toBe('<strong><span style="color: red">hello</span></strong>');
	});

	it('handles toHTMLStyle returning null', () => {
		const registry: SchemaRegistry = createRegistry();
		const html: string = serializeMarksToHTML(
			'hello',
			[{ type: markType('textColor'), attrs: { color: '' } }],
			registry,
		);
		// toHTMLStyle returns null for empty color, so no span
		expect(html).toBe('hello');
	});

	it('accepts pre-computed markOrder', () => {
		const registry: SchemaRegistry = createRegistry();
		const markOrder: Map<string, number> = buildMarkOrder(registry);
		const html: string = serializeMarksToHTML(
			'hello',
			[{ type: markType('bold') }],
			registry,
			markOrder,
		);
		expect(html).toBe('<strong>hello</strong>');
	});
});

describe('serializeMarksToClassHTML', () => {
	it('returns escaped text with no marks', () => {
		const registry: SchemaRegistry = createRegistry();
		const collector = new CSSClassCollector();
		const html: string = serializeMarksToClassHTML('<b>hi</b>', [], registry, collector);
		expect(html).toBe('&lt;b&gt;hi&lt;/b&gt;');
	});

	it('returns empty string for empty text', () => {
		const registry: SchemaRegistry = createRegistry();
		const collector = new CSSClassCollector();
		const html: string = serializeMarksToClassHTML(
			'',
			[{ type: markType('bold') }],
			registry,
			collector,
		);
		expect(html).toBe('');
	});

	it('wraps text with tag-based marks unchanged', () => {
		const registry: SchemaRegistry = createRegistry();
		const collector = new CSSClassCollector();
		const html: string = serializeMarksToClassHTML(
			'hello',
			[{ type: markType('bold') }],
			registry,
			collector,
		);
		expect(html).toBe('<strong>hello</strong>');
	});

	it('uses class name instead of inline style for style marks', () => {
		const registry: SchemaRegistry = createRegistry();
		const collector = new CSSClassCollector();
		const html: string = serializeMarksToClassHTML(
			'hello',
			[{ type: markType('textColor'), attrs: { color: 'red' } }],
			registry,
			collector,
		);
		expect(html).toMatch(/class="notectl-s-[a-z0-9]+"/);
		expect(html).not.toContain('style=');
		expect(collector.toCSS()).toMatch(/\.notectl-s-[a-z0-9]+ \{ color: red; \}/);
	});

	it('merges multiple style marks into single class', () => {
		const registry: SchemaRegistry = createRegistry();
		const collector = new CSSClassCollector();
		const html: string = serializeMarksToClassHTML(
			'hello',
			[
				{ type: markType('textColor'), attrs: { color: 'red' } },
				{ type: markType('highlight'), attrs: { color: 'yellow' } },
			],
			registry,
			collector,
		);
		expect(html).toMatch(/class="notectl-s-[a-z0-9]+"/);
		expect(html).not.toContain('style=');
		expect(collector.toCSS()).toContain('background-color: yellow');
		expect(collector.toCSS()).toContain('color: red');
	});

	it('wraps tag marks outside class span', () => {
		const registry: SchemaRegistry = createRegistry();
		const collector = new CSSClassCollector();
		const html: string = serializeMarksToClassHTML(
			'hello',
			[{ type: markType('bold') }, { type: markType('textColor'), attrs: { color: 'red' } }],
			registry,
			collector,
		);
		expect(html).toMatch(/^<strong><span class="notectl-s-[a-z0-9]+">hello<\/span><\/strong>$/);
	});

	it('deduplicates identical style declarations', () => {
		const registry: SchemaRegistry = createRegistry();
		const collector = new CSSClassCollector();
		const marks: readonly Mark[] = [{ type: markType('textColor'), attrs: { color: 'red' } }];
		const html1: string = serializeMarksToClassHTML('hello', marks, registry, collector);
		const html2: string = serializeMarksToClassHTML('world', marks, registry, collector);
		// Both should use the same hashed class name
		const classMatch: RegExpMatchArray | null = html1.match(/notectl-s-[a-z0-9]+/);
		expect(classMatch).not.toBeNull();
		const matched: string | undefined = classMatch?.[0];
		if (!matched) return;
		expect(html2).toContain(matched);
		// Only one CSS rule
		expect(collector.toCSS().split('\n')).toHaveLength(1);
	});

	it('handles toHTMLStyle returning null', () => {
		const registry: SchemaRegistry = createRegistry();
		const collector = new CSSClassCollector();
		const html: string = serializeMarksToClassHTML(
			'hello',
			[{ type: markType('textColor'), attrs: { color: '' } }],
			registry,
			collector,
		);
		expect(html).toBe('hello');
		expect(collector.toCSS()).toBe('');
	});
});
