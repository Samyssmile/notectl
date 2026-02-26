import { describe, expect, it } from 'vitest';
import type { InlineNodeSpec } from './InlineNodeSpec.js';
import type { MarkSpec } from './MarkSpec.js';
import type { NodeSpec } from './NodeSpec.js';
import { createBlockElement } from './NodeSpec.js';
import { SchemaRegistry } from './SchemaRegistry.js';

function makeNodeSpec(type: string): NodeSpec {
	return {
		type,
		toDOM(node) {
			return createBlockElement('div', node.id);
		},
	};
}

function makeMarkSpec(type: string, rank = 0): MarkSpec {
	return {
		type,
		rank,
		toDOM() {
			return document.createElement('span');
		},
	};
}

describe('SchemaRegistry', () => {
	describe('NodeSpec', () => {
		it('registers and retrieves a NodeSpec', () => {
			const registry = new SchemaRegistry();
			const spec = makeNodeSpec('heading');
			registry.registerNodeSpec(spec);
			expect(registry.getNodeSpec('heading')).toBe(spec);
		});

		it('throws on duplicate NodeSpec registration', () => {
			const registry = new SchemaRegistry();
			registry.registerNodeSpec(makeNodeSpec('heading'));
			expect(() => registry.registerNodeSpec(makeNodeSpec('heading'))).toThrow(
				'already registered',
			);
		});

		it('removes a NodeSpec', () => {
			const registry = new SchemaRegistry();
			registry.registerNodeSpec(makeNodeSpec('heading'));
			registry.removeNodeSpec('heading');
			expect(registry.getNodeSpec('heading')).toBeUndefined();
		});

		it('returns all node types', () => {
			const registry = new SchemaRegistry();
			registry.registerNodeSpec(makeNodeSpec('paragraph'));
			registry.registerNodeSpec(makeNodeSpec('heading'));
			expect(registry.getNodeTypes()).toEqual(['paragraph', 'heading']);
		});
	});

	describe('MarkSpec', () => {
		it('registers and retrieves a MarkSpec', () => {
			const registry = new SchemaRegistry();
			const spec = makeMarkSpec('bold', 0);
			registry.registerMarkSpec(spec);
			expect(registry.getMarkSpec('bold')).toBe(spec);
		});

		it('throws on duplicate MarkSpec registration', () => {
			const registry = new SchemaRegistry();
			registry.registerMarkSpec(makeMarkSpec('bold'));
			expect(() => registry.registerMarkSpec(makeMarkSpec('bold'))).toThrow('already registered');
		});

		it('removes a MarkSpec', () => {
			const registry = new SchemaRegistry();
			registry.registerMarkSpec(makeMarkSpec('bold'));
			registry.removeMarkSpec('bold');
			expect(registry.getMarkSpec('bold')).toBeUndefined();
		});

		it('returns all mark types', () => {
			const registry = new SchemaRegistry();
			registry.registerMarkSpec(makeMarkSpec('bold'));
			registry.registerMarkSpec(makeMarkSpec('italic'));
			expect(registry.getMarkTypes()).toEqual(['bold', 'italic']);
		});
	});

	describe('InlineNodeSpec', () => {
		function makeInlineNodeSpec(type: string): InlineNodeSpec {
			return {
				type,
				toDOM() {
					return document.createElement('span');
				},
			};
		}

		it('registers and retrieves an InlineNodeSpec', () => {
			const registry = new SchemaRegistry();
			const spec: InlineNodeSpec = makeInlineNodeSpec('image');
			registry.registerInlineNodeSpec(spec);
			expect(registry.getInlineNodeSpec('image')).toBe(spec);
		});

		it('throws on duplicate InlineNodeSpec registration', () => {
			const registry = new SchemaRegistry();
			registry.registerInlineNodeSpec(makeInlineNodeSpec('image'));
			expect(() => registry.registerInlineNodeSpec(makeInlineNodeSpec('image'))).toThrow(
				'already registered',
			);
		});

		it('removes an InlineNodeSpec', () => {
			const registry = new SchemaRegistry();
			registry.registerInlineNodeSpec(makeInlineNodeSpec('image'));
			registry.removeInlineNodeSpec('image');
			expect(registry.getInlineNodeSpec('image')).toBeUndefined();
		});

		it('returns all inline node types', () => {
			const registry = new SchemaRegistry();
			registry.registerInlineNodeSpec(makeInlineNodeSpec('image'));
			registry.registerInlineNodeSpec(makeInlineNodeSpec('mention'));
			expect(registry.getInlineNodeTypes()).toEqual(['image', 'mention']);
		});
	});

	describe('clear', () => {
		it('clears all spec registrations', () => {
			const registry = new SchemaRegistry();
			registry.registerNodeSpec(makeNodeSpec('heading'));
			registry.registerMarkSpec(makeMarkSpec('bold'));

			registry.clear();

			expect(registry.getNodeTypes()).toEqual([]);
			expect(registry.getMarkTypes()).toEqual([]);
			expect(registry.getInlineNodeTypes()).toEqual([]);
		});
	});
});
