/**
 * KeymapRegistry: manages plugin-registered keyboard shortcuts
 * with a 3-priority system (context > navigation > default).
 */

import type { Keymap, KeymapOptions, KeymapPriority } from './Keymap.js';

export class KeymapRegistry {
	private readonly _contextKeymaps: Keymap[] = [];
	private readonly _navigationKeymaps: Keymap[] = [];
	private readonly _defaultKeymaps: Keymap[] = [];

	registerKeymap(keymap: Keymap, options?: KeymapOptions): void {
		const allKeymaps: Keymap[] = [
			...this._contextKeymaps,
			...this._navigationKeymaps,
			...this._defaultKeymaps,
		];
		for (const key of Object.keys(keymap)) {
			for (const existing of allKeymaps) {
				if (key in existing) {
					console.debug(
						`[notectl] Keymap shortcut "${key}" is already registered and will be overridden.`,
					);
					break;
				}
			}
		}
		this.keymapArrayForPriority(options?.priority ?? 'default').push(keymap);
	}

	/** Returns all keymaps in priority order: context > navigation > default. */
	getKeymaps(): readonly Keymap[] {
		return [...this._contextKeymaps, ...this._navigationKeymaps, ...this._defaultKeymaps];
	}

	/** Returns keymaps grouped by priority level (defensive copies). */
	getKeymapsByPriority(): {
		readonly context: readonly Keymap[];
		readonly navigation: readonly Keymap[];
		readonly default: readonly Keymap[];
	} {
		return {
			context: [...this._contextKeymaps],
			navigation: [...this._navigationKeymaps],
			default: [...this._defaultKeymaps],
		};
	}

	removeKeymap(keymap: Keymap): void {
		for (const arr of [this._contextKeymaps, this._navigationKeymaps, this._defaultKeymaps]) {
			const idx: number = arr.indexOf(keymap);
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

	private keymapArrayForPriority(priority: KeymapPriority): Keymap[] {
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
