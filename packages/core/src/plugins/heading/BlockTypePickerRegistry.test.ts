import { describe, expect, it } from 'vitest';
import type { BlockTypePickerEntry } from './BlockTypePickerEntry.js';
import { BlockTypePickerRegistry } from './BlockTypePickerRegistry.js';

function makeEntry(id: string, priority: number): BlockTypePickerEntry {
	return {
		id,
		label: id,
		command: `set${id}`,
		priority,
		isActive: () => false,
	};
}

describe('BlockTypePickerRegistry', () => {
	it('registers and retrieves entries sorted by priority', () => {
		const registry = new BlockTypePickerRegistry();
		registry.registerBlockTypePickerEntry(makeEntry('heading-2', 20));
		registry.registerBlockTypePickerEntry(makeEntry('heading-1', 10));

		const entries = registry.getBlockTypePickerEntries();
		expect(entries).toHaveLength(2);
		expect(entries[0]?.id).toBe('heading-1');
		expect(entries[1]?.id).toBe('heading-2');
	});

	it('throws on duplicate entry', () => {
		const registry = new BlockTypePickerRegistry();
		registry.registerBlockTypePickerEntry(makeEntry('heading-1', 10));
		expect(() => registry.registerBlockTypePickerEntry(makeEntry('heading-1', 10))).toThrow(
			'already registered',
		);
	});

	it('removes an entry', () => {
		const registry = new BlockTypePickerRegistry();
		registry.registerBlockTypePickerEntry(makeEntry('heading-1', 10));
		registry.removeBlockTypePickerEntry('heading-1');
		expect(registry.getBlockTypePickerEntries()).toEqual([]);
	});

	it('clear removes all entries', () => {
		const registry = new BlockTypePickerRegistry();
		registry.registerBlockTypePickerEntry(makeEntry('heading-1', 10));
		registry.registerBlockTypePickerEntry(makeEntry('heading-2', 20));
		registry.clear();
		expect(registry.getBlockTypePickerEntries()).toEqual([]);
	});
});
