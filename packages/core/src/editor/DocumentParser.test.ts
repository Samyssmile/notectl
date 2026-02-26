import { describe, expect, it } from 'vitest';
import { getBlockText, getInlineChildren, isInlineNode } from '../model/Document.js';
import type { InlineNodeSpec } from '../model/InlineNodeSpec.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { parseHTMLToDocument } from './DocumentParser.js';

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
			expect(isInlineNode(children[1]!)).toBe(true);
			if (isInlineNode(children[1]!)) {
				expect(children[1]!.inlineType).toBe('hard_break');
			}
			expect(children[2]?.text).toBe('World');
		});
	});
});
