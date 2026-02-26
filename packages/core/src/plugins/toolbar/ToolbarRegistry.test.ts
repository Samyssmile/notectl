import { describe, expect, it } from 'vitest';
import type { ToolbarItem } from './ToolbarItem.js';
import { ToolbarRegistry } from './ToolbarRegistry.js';

function makeItem(id: string): ToolbarItem {
	return { id, group: 'block', icon: 'H', label: id, command: id };
}

describe('ToolbarRegistry', () => {
	it('registers and retrieves toolbar items', () => {
		const registry = new ToolbarRegistry();
		const item = makeItem('heading');
		registry.registerToolbarItem(item);
		expect(registry.getToolbarItem('heading')).toBe(item);
		expect(registry.getToolbarItems()).toEqual([item]);
	});

	it('throws on duplicate ToolbarItem', () => {
		const registry = new ToolbarRegistry();
		registry.registerToolbarItem(makeItem('heading'));
		expect(() => registry.registerToolbarItem(makeItem('heading'))).toThrow('already registered');
	});

	it('removes a toolbar item', () => {
		const registry = new ToolbarRegistry();
		registry.registerToolbarItem(makeItem('heading'));
		registry.removeToolbarItem('heading');
		expect(registry.getToolbarItem('heading')).toBeUndefined();
	});

	it('tracks items by plugin', () => {
		const registry = new ToolbarRegistry();
		const item = makeItem('bold');
		registry.registerToolbarItem(item, 'text-formatting');
		expect(registry.getToolbarItemsByPlugin('text-formatting')).toEqual([item]);
	});

	it('removeToolbarItem cleans up plugin map', () => {
		const registry = new ToolbarRegistry();
		registry.registerToolbarItem(makeItem('bold'), 'text-formatting');
		registry.removeToolbarItem('bold');
		expect(registry.getToolbarItemsByPlugin('text-formatting')).toEqual([]);
	});

	it('clear removes all items and plugin maps', () => {
		const registry = new ToolbarRegistry();
		registry.registerToolbarItem(makeItem('bold'), 'text-formatting');
		registry.registerToolbarItem(makeItem('italic'), 'text-formatting');
		registry.clear();
		expect(registry.getToolbarItems()).toEqual([]);
		expect(registry.getToolbarItemsByPlugin('text-formatting')).toEqual([]);
	});
});
