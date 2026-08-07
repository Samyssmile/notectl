/**
 * KeymapRegistry: manages plugin-registered keyboard shortcuts
 * with a 3-priority system (context > navigation > default).
 */

import type { Keymap, KeymapOptions, KeymapPriority } from './Keymap.js';
import type { PluginCallbackRegistration } from './PluginCallbackExecutor.js';

export interface KeymapEntry {
	readonly keymap: Keymap;
	readonly pluginId: string;
	readonly name: string;
}

export interface KeymapEntryGroups {
	readonly context: readonly KeymapEntry[];
	readonly navigation: readonly KeymapEntry[];
	readonly default: readonly KeymapEntry[];
}

export class KeymapRegistry {
	private readonly _contextKeymaps: KeymapEntry[] = [];
	private readonly _navigationKeymaps: KeymapEntry[] = [];
	private readonly _defaultKeymaps: KeymapEntry[] = [];

	registerKeymap(
		keymap: Keymap,
		options?: KeymapOptions,
		registration?: PluginCallbackRegistration,
	): void {
		const priority: KeymapPriority = options?.priority ?? 'default';
		const samePriorityKeymaps: KeymapEntry[] = this.keymapArrayForPriority(priority);
		samePriorityKeymaps.push({
			keymap,
			pluginId: registration?.pluginId ?? 'unattributed',
			name: registration?.name ?? (Object.keys(keymap).join(', ') || 'anonymous-keymap'),
		});
	}

	/** Returns all keymaps in priority order: context > navigation > default. */
	getKeymaps(): readonly Keymap[] {
		return [...this._contextKeymaps, ...this._navigationKeymaps, ...this._defaultKeymaps].map(
			(entry) => entry.keymap,
		);
	}

	/** Returns keymaps grouped by priority level (defensive copies). */
	getKeymapsByPriority(): {
		readonly context: readonly Keymap[];
		readonly navigation: readonly Keymap[];
		readonly default: readonly Keymap[];
	} {
		return {
			context: this._contextKeymaps.map((entry) => entry.keymap),
			navigation: this._navigationKeymaps.map((entry) => entry.keymap),
			default: this._defaultKeymaps.map((entry) => entry.keymap),
		};
	}

	/** Returns grouped keymaps with plugin ownership retained for runtime attribution. */
	getKeymapEntriesByPriority(): KeymapEntryGroups {
		return {
			context: [...this._contextKeymaps],
			navigation: [...this._navigationKeymaps],
			default: [...this._defaultKeymaps],
		};
	}

	removeKeymap(keymap: Keymap): void {
		for (const arr of [this._contextKeymaps, this._navigationKeymaps, this._defaultKeymaps]) {
			const idx: number = arr.findIndex((entry) => entry.keymap === keymap);
			if (idx !== -1) {
				arr.splice(idx, 1);
				return;
			}
		}
	}

	clear(): void {
		this._contextKeymaps.length = 0;
		this._navigationKeymaps.length = 0;
		this._defaultKeymaps.length = 0;
	}

	private keymapArrayForPriority(priority: KeymapPriority): KeymapEntry[] {
		switch (priority) {
			case 'context':
				return this._contextKeymaps;
			case 'navigation':
				return this._navigationKeymaps;
			case 'default':
				return this._defaultKeymaps;
		}
	}
}
