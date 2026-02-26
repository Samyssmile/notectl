import { describe, expect, it } from 'vitest';
import { NodeViewRegistry } from './NodeViewRegistry.js';

describe('NodeViewRegistry', () => {
	it('registers and retrieves a NodeView factory', () => {
		const registry = new NodeViewRegistry();
		const factory = () => ({
			dom: document.createElement('div'),
			contentDOM: null,
		});
		registry.registerNodeView('table', factory);
		expect(registry.getNodeViewFactory('table')).toBe(factory);
	});

	it('throws on duplicate NodeView registration', () => {
		const registry = new NodeViewRegistry();
		const factory = () => ({ dom: document.createElement('div'), contentDOM: null });
		registry.registerNodeView('table', factory);
		expect(() => registry.registerNodeView('table', factory)).toThrow('already registered');
	});

	it('removes a NodeView', () => {
		const registry = new NodeViewRegistry();
		const factory = () => ({ dom: document.createElement('div'), contentDOM: null });
		registry.registerNodeView('table', factory);
		registry.removeNodeView('table');
		expect(registry.getNodeViewFactory('table')).toBeUndefined();
	});

	it('clear removes all node views', () => {
		const registry = new NodeViewRegistry();
		registry.registerNodeView('table', () => ({
			dom: document.createElement('div'),
			contentDOM: null,
		}));
		registry.clear();
		expect(registry.getNodeViewFactory('table')).toBeUndefined();
	});
});
