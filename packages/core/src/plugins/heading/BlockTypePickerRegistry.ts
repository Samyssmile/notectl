/**
 * BlockTypePickerRegistry: manages plugin-registered block type picker entries
 * displayed in the heading/block type dropdown, sorted by priority.
 */

import type { BlockTypePickerEntry } from './BlockTypePickerEntry.js';

export class BlockTypePickerRegistry {
	private readonly _entries = new Map<string, BlockTypePickerEntry>();

	registerBlockTypePickerEntry(entry: BlockTypePickerEntry): void {
		if (this._entries.has(entry.id)) {
			throw new Error(`BlockTypePickerEntry with id "${entry.id}" is already registered.`);
		}
		this._entries.set(entry.id, entry);
	}

	getBlockTypePickerEntries(): readonly BlockTypePickerEntry[] {
		return [...this._entries.values()].sort((a, b) => a.priority - b.priority);
	}

	removeBlockTypePickerEntry(id: string): void {
		this._entries.delete(id);
	}

	clear(): void {
		this._entries.clear();
	}
}
