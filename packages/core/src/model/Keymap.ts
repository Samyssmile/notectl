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
 * - `default`: for general editing shortcuts
 * - `fallback`: lowest priority, for last-resort bindings that only claim a key
 *   when no other plugin wanted it (e.g. Shift-Tab moving focus to the toolbar,
 *   which must never win over list outdent or table cell navigation)
 */
export type KeymapPriority = 'context' | 'navigation' | 'default' | 'fallback';

/** Options for keymap registration. */
export interface KeymapOptions {
	readonly priority?: KeymapPriority;
}
