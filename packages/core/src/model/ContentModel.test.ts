import { describe, expect, it } from 'vitest';
import { hoistDisallowedBlocks } from './ContentModel.js';
import {
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockChildren,
	isLeafBlock,
} from './Document.js';
import { SchemaRegistry } from './SchemaRegistry.js';

describe('hoistDisallowedBlocks', () => {
	it('does not collapse a semantic target out of a repaired hybrid container', () => {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'list_item',
			content: { allow: ['text', 'paragraph'] },
			toDOM: () => document.createElement('li'),
		});
		registry.registerNodeSpec({
			type: 'paragraph',
			toDOM: () => document.createElement('p'),
		});
		registry.registerNodeSpec({
			type: 'table',
			toDOM: () => document.createElement('table'),
		});

		const paragraph = createBlockNode(
			'paragraph',
			[createTextNode('Item')],
			'p1',
			undefined,
			'inner-target',
		);
		const table = createBlockNode('table', [createTextNode('Grid')], 't1');
		const item = createBlockNode('list_item', [paragraph, table], 'li1');

		const repaired = hoistDisallowedBlocks(createDocument([item]), registry);
		const repairedItem = repaired.children[0];

		expect(repaired.children.map((block) => block.type)).toEqual(['list_item', 'table']);
		expect(repairedItem && isLeafBlock(repairedItem)).toBe(false);
		expect(repairedItem && getBlockChildren(repairedItem)[0]?.htmlId).toBe('inner-target');
	});
});
