/**
 * Tests for extensible HTML serialization, parsing, and sanitization.
 * Covers SchemaRegistry aggregation methods, spec-based toHTML/parseHTML/sanitize,
 * and DOMPurify config derived from specs.
 */

import { describe, expect, it } from 'vitest';
import { registerBuiltinSpecs } from './BuiltinSpecs.js';
import type { ParseRule } from './ParseRule.js';
import { SchemaRegistry } from './SchemaRegistry.js';

// --- SchemaRegistry Aggregation Methods ---

describe('SchemaRegistry aggregation', () => {
	describe('getBlockParseRules', () => {
		it('returns empty array when no specs have parseHTML', () => {
			const registry = new SchemaRegistry();
			registry.registerNodeSpec({
				type: 'paragraph',
				toDOM() {
					return document.createElement('p');
				},
			});
			expect(registry.getBlockParseRules()).toEqual([]);
		});

		it('collects parse rules from all node specs', () => {
			const registry = new SchemaRegistry();
			registry.registerNodeSpec({
				type: 'paragraph',
				toDOM() {
					return document.createElement('p');
				},
				parseHTML: [{ tag: 'p' }, { tag: 'div', priority: 10 }],
			});
			registry.registerNodeSpec({
				type: 'heading',
				toDOM() {
					return document.createElement('h1');
				},
				parseHTML: [{ tag: 'h1' }],
			});

			const rules = registry.getBlockParseRules();
			expect(rules).toHaveLength(3);
			expect(rules[0]?.type).toBe('paragraph');
			expect(rules[0]?.rule.tag).toBe('p');
		});

		it('sorts rules by priority descending', () => {
			const registry = new SchemaRegistry();
			registry.registerNodeSpec({
				type: 'paragraph',
				toDOM() {
					return document.createElement('p');
				},
				parseHTML: [{ tag: 'p', priority: 30 }],
			});
			registry.registerNodeSpec({
				type: 'heading',
				toDOM() {
					return document.createElement('h1');
				},
				parseHTML: [{ tag: 'h1', priority: 80 }],
			});

			const rules = registry.getBlockParseRules();
			expect(rules[0]?.rule.tag).toBe('h1');
			expect(rules[1]?.rule.tag).toBe('p');
		});

		it('uses default priority 50 when not specified', () => {
			const registry = new SchemaRegistry();
			registry.registerNodeSpec({
				type: 'a',
				toDOM() {
					return document.createElement('p');
				},
				parseHTML: [{ tag: 'div', priority: 51 }],
			});
			registry.registerNodeSpec({
				type: 'b',
				toDOM() {
					return document.createElement('p');
				},
				parseHTML: [{ tag: 'p' }],
			});

			const rules = registry.getBlockParseRules();
			expect(rules[0]?.rule.tag).toBe('div');
			expect(rules[1]?.rule.tag).toBe('p');
		});
	});

	describe('getMarkParseRules', () => {
		it('collects parse rules from all mark specs', () => {
			const registry = new SchemaRegistry();
			registry.registerMarkSpec({
				type: 'bold',
				toDOM() {
					return document.createElement('strong');
				},
				parseHTML: [{ tag: 'strong' }, { tag: 'b' }],
			});
			registry.registerMarkSpec({
				type: 'italic',
				toDOM() {
					return document.createElement('em');
				},
				parseHTML: [{ tag: 'em' }],
			});

			const rules = registry.getMarkParseRules();
			expect(rules).toHaveLength(3);
			expect(rules.some((r) => r.type === 'bold' && r.rule.tag === 'strong')).toBe(true);
			expect(rules.some((r) => r.type === 'bold' && r.rule.tag === 'b')).toBe(true);
			expect(rules.some((r) => r.type === 'italic' && r.rule.tag === 'em')).toBe(true);
		});
	});

	describe('getInlineParseRules', () => {
		it('returns empty array when no inline node specs have parseHTML', () => {
			const registry = new SchemaRegistry();
			expect(registry.getInlineParseRules()).toEqual([]);
		});

		it('collects parse rules from inline node specs', () => {
			const registry = new SchemaRegistry();
			registry.registerInlineNodeSpec({
				type: 'image',
				toDOM() {
					return document.createElement('img');
				},
				parseHTML: [{ tag: 'img' }],
			});

			const rules = registry.getInlineParseRules();
			expect(rules).toHaveLength(1);
			expect(rules[0]?.type).toBe('image');
		});
	});

	describe('getAllowedTags', () => {
		it('includes base defaults', () => {
			const registry = new SchemaRegistry();
			const tags = registry.getAllowedTags();
			expect(tags).toContain('p');
			expect(tags).toContain('br');
			expect(tags).toContain('div');
			expect(tags).toContain('span');
		});

		it('includes tags from node spec sanitize configs', () => {
			const registry = new SchemaRegistry();
			registry.registerNodeSpec({
				type: 'heading',
				toDOM() {
					return document.createElement('h1');
				},
				sanitize: { tags: ['h1', 'h2', 'h3'] },
			});

			const tags = registry.getAllowedTags();
			expect(tags).toContain('h1');
			expect(tags).toContain('h2');
			expect(tags).toContain('h3');
		});

		it('includes tags from mark spec sanitize configs', () => {
			const registry = new SchemaRegistry();
			registry.registerMarkSpec({
				type: 'bold',
				toDOM() {
					return document.createElement('strong');
				},
				sanitize: { tags: ['strong', 'b'] },
			});

			const tags = registry.getAllowedTags();
			expect(tags).toContain('strong');
			expect(tags).toContain('b');
		});

		it('deduplicates tags', () => {
			const registry = new SchemaRegistry();
			registry.registerNodeSpec({
				type: 'a',
				toDOM() {
					return document.createElement('p');
				},
				sanitize: { tags: ['span'] },
			});
			registry.registerMarkSpec({
				type: 'b',
				toDOM() {
					return document.createElement('span');
				},
				sanitize: { tags: ['span'] },
			});

			const tags = registry.getAllowedTags();
			const spanCount = tags.filter((t) => t === 'span').length;
			expect(spanCount).toBe(1);
		});
	});

	describe('getAllowedAttrs', () => {
		it('includes base default (style)', () => {
			const registry = new SchemaRegistry();
			const attrs = registry.getAllowedAttrs();
			expect(attrs).toContain('style');
		});

		it('includes attrs from mark spec sanitize configs', () => {
			const registry = new SchemaRegistry();
			registry.registerMarkSpec({
				type: 'link',
				toDOM() {
					return document.createElement('a');
				},
				sanitize: { tags: ['a'], attrs: ['href', 'target', 'rel'] },
			});

			const attrs = registry.getAllowedAttrs();
			expect(attrs).toContain('href');
			expect(attrs).toContain('target');
			expect(attrs).toContain('rel');
		});
	});
});

// --- Builtin Specs ---

describe('BuiltinSpecs', () => {
	it('paragraph spec has toHTML, parseHTML, and sanitize', () => {
		const registry = new SchemaRegistry();
		registerBuiltinSpecs(registry);

		const spec = registry.getNodeSpec('paragraph');
		expect(spec?.toHTML).toBeDefined();
		expect(spec?.parseHTML).toBeDefined();
		expect(spec?.sanitize).toBeDefined();
	});

	it('paragraph toHTML serializes content', () => {
		const registry = new SchemaRegistry();
		registerBuiltinSpecs(registry);

		const spec = registry.getNodeSpec('paragraph');
		const block = {
			id: 'b1' as import('./TypeBrands.js').BlockId,
			type: 'paragraph' as import('./TypeBrands.js').NodeTypeName,
			children: [],
		};
		expect(spec?.toHTML?.(block, 'hello')).toBe('<p>hello</p>');
		expect(spec?.toHTML?.(block, '')).toBe('<p><br></p>');
	});

	it('paragraph parseHTML includes p and div rules', () => {
		const registry = new SchemaRegistry();
		registerBuiltinSpecs(registry);

		const spec = registry.getNodeSpec('paragraph');
		const rules: readonly ParseRule[] = spec?.parseHTML ?? [];
		expect(rules.some((r) => r.tag === 'p')).toBe(true);
		expect(rules.some((r) => r.tag === 'div')).toBe(true);
	});
});

// --- Schema-derived DOMPurify Config ---

describe('Schema-derived DOMPurify config', () => {
	it('getAllowedTags includes all spec-registered tags', () => {
		const registry = new SchemaRegistry();
		registerBuiltinSpecs(registry);

		// Simulate heading plugin
		registry.registerNodeSpec({
			type: 'heading',
			toDOM() {
				return document.createElement('h1');
			},
			sanitize: { tags: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] },
		});

		// Simulate bold mark
		registry.registerMarkSpec({
			type: 'bold',
			toDOM() {
				return document.createElement('strong');
			},
			sanitize: { tags: ['strong', 'b'] },
		});

		const tags = registry.getAllowedTags();
		expect(tags).toContain('p');
		expect(tags).toContain('h1');
		expect(tags).toContain('h6');
		expect(tags).toContain('strong');
		expect(tags).toContain('b');
	});
});
