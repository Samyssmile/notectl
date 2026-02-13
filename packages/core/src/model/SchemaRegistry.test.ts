import { type MockInstance, describe, expect, it, vi } from 'vitest';
import type { InputRule } from '../input/InputRule.js';
import type { Keymap } from '../input/Keymap.js';
import type { ToolbarItem } from '../plugins/toolbar/ToolbarItem.js';
import type { InlineNodeSpec } from './InlineNodeSpec.js';
import type { MarkSpec } from './MarkSpec.js';
import type { NodeSpec } from './NodeSpec.js';
import { createBlockElement } from './NodeSpec.js';
import type { FileHandler } from './SchemaRegistry.js';
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

	describe('NodeView', () => {
		it('registers and retrieves a NodeView factory', () => {
			const registry = new SchemaRegistry();
			const factory = () => ({
				dom: document.createElement('div'),
				contentDOM: null,
			});
			registry.registerNodeView('table', factory);
			expect(registry.getNodeViewFactory('table')).toBe(factory);
		});

		it('throws on duplicate NodeView registration', () => {
			const registry = new SchemaRegistry();
			const factory = () => ({ dom: document.createElement('div'), contentDOM: null });
			registry.registerNodeView('table', factory);
			expect(() => registry.registerNodeView('table', factory)).toThrow('already registered');
		});

		it('removes a NodeView', () => {
			const registry = new SchemaRegistry();
			const factory = () => ({ dom: document.createElement('div'), contentDOM: null });
			registry.registerNodeView('table', factory);
			registry.removeNodeView('table');
			expect(registry.getNodeViewFactory('table')).toBeUndefined();
		});
	});

	describe('Keymap', () => {
		it('registers and retrieves keymaps', () => {
			const registry = new SchemaRegistry();
			const keymap: Keymap = { 'Mod-B': () => true };
			registry.registerKeymap(keymap);
			expect(registry.getKeymaps()).toEqual([keymap]);
		});

		it('removes a keymap', () => {
			const registry = new SchemaRegistry();
			const keymap: Keymap = { 'Mod-B': () => true };
			registry.registerKeymap(keymap);
			registry.removeKeymap(keymap);
			expect(registry.getKeymaps()).toEqual([]);
		});

		it('warns when a keymap shortcut collides with an existing one', () => {
			const registry = new SchemaRegistry();
			const spy: MockInstance = vi.spyOn(console, 'warn').mockImplementation(() => {});

			registry.registerKeymap({ 'Mod-B': () => true });
			registry.registerKeymap({ 'Mod-B': () => false });

			expect(spy).toHaveBeenCalledOnce();
			expect(spy).toHaveBeenCalledWith(
				'[notectl] Keymap shortcut "Mod-B" is already registered and will be overridden.',
			);

			spy.mockRestore();
		});

		it('does not warn for non-overlapping keymaps', () => {
			const registry = new SchemaRegistry();
			const spy: MockInstance = vi.spyOn(console, 'warn').mockImplementation(() => {});

			registry.registerKeymap({ 'Mod-B': () => true });
			registry.registerKeymap({ 'Mod-I': () => true });

			expect(spy).not.toHaveBeenCalled();

			spy.mockRestore();
		});

		it('warning includes the colliding key descriptor', () => {
			const registry = new SchemaRegistry();
			const spy: MockInstance = vi.spyOn(console, 'warn').mockImplementation(() => {});

			registry.registerKeymap({ 'Mod-Shift-1': () => true });
			registry.registerKeymap({ 'Mod-Shift-1': () => false, 'Mod-Shift-2': () => true });

			expect(spy).toHaveBeenCalledOnce();
			expect(String(spy.mock.calls[0]?.[0])).toContain('Mod-Shift-1');

			spy.mockRestore();
		});
	});

	describe('InputRule', () => {
		it('registers and retrieves input rules', () => {
			const registry = new SchemaRegistry();
			const rule: InputRule = { pattern: /^#\s$/, handler: () => null };
			registry.registerInputRule(rule);
			expect(registry.getInputRules()).toEqual([rule]);
		});

		it('removes an input rule', () => {
			const registry = new SchemaRegistry();
			const rule: InputRule = { pattern: /^#\s$/, handler: () => null };
			registry.registerInputRule(rule);
			registry.removeInputRule(rule);
			expect(registry.getInputRules()).toEqual([]);
		});
	});

	describe('ToolbarItem', () => {
		it('registers and retrieves toolbar items', () => {
			const registry = new SchemaRegistry();
			const item: ToolbarItem = {
				id: 'heading',
				group: 'block',
				icon: 'H',
				label: 'Heading',
				command: 'setHeading',
			};
			registry.registerToolbarItem(item);
			expect(registry.getToolbarItem('heading')).toBe(item);
			expect(registry.getToolbarItems()).toEqual([item]);
		});

		it('throws on duplicate ToolbarItem', () => {
			const registry = new SchemaRegistry();
			const item: ToolbarItem = {
				id: 'heading',
				group: 'block',
				icon: 'H',
				label: 'Heading',
				command: 'setHeading',
			};
			registry.registerToolbarItem(item);
			expect(() => registry.registerToolbarItem(item)).toThrow('already registered');
		});

		it('removes a toolbar item', () => {
			const registry = new SchemaRegistry();
			const item: ToolbarItem = {
				id: 'heading',
				group: 'block',
				icon: 'H',
				label: 'Heading',
				command: 'setHeading',
			};
			registry.registerToolbarItem(item);
			registry.removeToolbarItem('heading');
			expect(registry.getToolbarItem('heading')).toBeUndefined();
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

	describe('FileHandler', () => {
		it('registers and retrieves file handlers', () => {
			const registry = new SchemaRegistry();
			const handler: FileHandler = vi.fn();
			registry.registerFileHandler('image/png', handler);

			const entries = registry.getFileHandlers();
			expect(entries).toHaveLength(1);
			expect(entries[0]?.pattern).toBe('image/png');
			expect(entries[0]?.handler).toBe(handler);
		});

		it('matches handlers by exact MIME type', () => {
			const registry = new SchemaRegistry();
			const handler: FileHandler = vi.fn();
			registry.registerFileHandler('image/png', handler);

			const matched = registry.matchFileHandlers('image/png');
			expect(matched).toEqual([handler]);
		});

		it('matches handlers by wildcard pattern image/*', () => {
			const registry = new SchemaRegistry();
			const handler: FileHandler = vi.fn();
			registry.registerFileHandler('image/*', handler);

			expect(registry.matchFileHandlers('image/png')).toEqual([handler]);
			expect(registry.matchFileHandlers('image/jpeg')).toEqual([handler]);
		});

		it('matches handlers by universal wildcard */*', () => {
			const registry = new SchemaRegistry();
			const handler: FileHandler = vi.fn();
			registry.registerFileHandler('*/*', handler);

			expect(registry.matchFileHandlers('image/png')).toEqual([handler]);
			expect(registry.matchFileHandlers('application/pdf')).toEqual([handler]);
		});

		it('returns empty array for unmatched MIME type', () => {
			const registry = new SchemaRegistry();
			const handler: FileHandler = vi.fn();
			registry.registerFileHandler('image/png', handler);

			expect(registry.matchFileHandlers('text/plain')).toEqual([]);
		});

		it('removes a file handler', () => {
			const registry = new SchemaRegistry();
			const handler: FileHandler = vi.fn();
			registry.registerFileHandler('image/png', handler);
			registry.removeFileHandler(handler);

			expect(registry.getFileHandlers()).toHaveLength(0);
			expect(registry.matchFileHandlers('image/png')).toEqual([]);
		});
	});

	describe('clear', () => {
		it('clears all registrations', () => {
			const registry = new SchemaRegistry();
			registry.registerNodeSpec(makeNodeSpec('heading'));
			registry.registerMarkSpec(makeMarkSpec('bold'));
			registry.registerNodeView('table', () => ({
				dom: document.createElement('div'),
				contentDOM: null,
			}));
			registry.registerKeymap({ 'Mod-B': () => true });
			registry.registerInputRule({ pattern: /^#\s$/, handler: () => null });
			registry.registerToolbarItem({
				id: 'h',
				group: 'block',
				icon: 'H',
				label: 'H',
				command: 'h',
			});
			registry.registerFileHandler('image/*', vi.fn());

			registry.clear();

			expect(registry.getNodeTypes()).toEqual([]);
			expect(registry.getMarkTypes()).toEqual([]);
			expect(registry.getInlineNodeTypes()).toEqual([]);
			expect(registry.getKeymaps()).toEqual([]);
			expect(registry.getInputRules()).toEqual([]);
			expect(registry.getToolbarItems()).toEqual([]);
			expect(registry.getFileHandlers()).toEqual([]);
		});
	});
});
