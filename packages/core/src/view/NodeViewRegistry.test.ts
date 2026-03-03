import { describe, expect, it } from 'vitest';
import { NodeViewRegistry } from './NodeViewRegistry.js';

describe('NodeViewRegistry', () => {
	it('throws on duplicate NodeView registration', () => {
		const registry = new NodeViewRegistry();
		const factory = () => ({ dom: document.createElement('div'), contentDOM: null });
		registry.registerNodeView('table', factory);
		expect(() => registry.registerNodeView('table', factory)).toThrow('already registered');
	});
});
