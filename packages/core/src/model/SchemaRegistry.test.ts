import { describe, expect, it } from 'vitest';
import { createBlockElement } from '../view/DomUtils.js';
import type { InlineNodeSpec } from './InlineNodeSpec.js';
import type { MarkSpec } from './MarkSpec.js';
import type { NodeSpec } from './NodeSpec.js';
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

		it('applies a NodeSpec extension registered before its target spec', () => {
			const registry = new SchemaRegistry();
			registry.registerNodeSpecExtension('table_cell', (spec) => ({
				...spec,
				content: { allow: [...(spec.content?.allow ?? []), 'code_block'] },
			}));

			registry.registerNodeSpec({
				...makeNodeSpec('table_cell'),
				content: { allow: ['paragraph'] },
			});
			registry.finalize();

			expect(registry.getNodeSpec('table_cell')?.content?.allow).toEqual([
				'paragraph',
				'code_block',
			]);
		});

		it('composes NodeSpec extensions in registration order', () => {
			const registry = new SchemaRegistry();
			registry.registerNodeSpec(makeNodeSpec('paragraph'));
			registry.registerNodeSpecExtension('paragraph', (spec) => ({
				...spec,
				attrs: { first: { default: 'one' } },
			}));
			registry.registerNodeSpecExtension('paragraph', (spec) => ({
				...spec,
				attrs: { ...spec.attrs, second: { default: 'two' } },
			}));

			registry.finalize();

			expect(registry.getNodeSpec('paragraph')?.attrs).toEqual({
				first: { default: 'one' },
				second: { default: 'two' },
			});
		});

		it('removes a NodeSpec extension by identity and restores the base spec', () => {
			const registry = new SchemaRegistry();
			const base = makeNodeSpec('paragraph');
			const extension = (spec: NodeSpec): NodeSpec => ({
				...spec,
				attrs: { align: { default: 'start' } },
			});
			registry.registerNodeSpec(base);
			registry.registerNodeSpecExtension('paragraph', extension);
			expect(registry.getNodeSpec('paragraph')?.attrs?.align).toBeDefined();

			registry.removeNodeSpecExtension('paragraph', extension);

			expect(registry.getNodeSpec('paragraph')).toBe(base);
		});

		it('rejects an extension that changes the target node type during finalization', () => {
			const registry = new SchemaRegistry();
			registry.registerNodeSpec(makeNodeSpec('paragraph'));
			registry.registerNodeSpecExtension('paragraph', (spec) => ({ ...spec, type: 'heading' }));

			expect(() => registry.finalize()).toThrow('must preserve node type');
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
