/**
 * Keymap types for plugin-registered keyboard shortcuts.
 */

export type KeymapHandler = () => boolean;

/**
 * A mapping from key descriptors to handler functions.
 * Key descriptor format: `"Mod-B"`, `"Mod-Shift-1"`, `"Tab"`, `"Enter"`.
 * `Mod` resolves to Ctrl on Linux/Windows and Cmd on macOS.
 */
export type Keymap = Readonly<Record<string, KeymapHandler>>;

/**
 * Dispatch priority for keymaps.
 * - `context`: highest priority, for context-sensitive keymaps (table, code-block)
 * - `navigation`: middle priority, for caret-movement and cross-block navigation
 * - `default`: lowest priority, for general editing shortcuts
 */
export type KeymapPriority = 'context' | 'navigation' | 'default';

/** Options for keymap registration. */
export interface KeymapOptions {
	readonly priority?: KeymapPriority;
}
