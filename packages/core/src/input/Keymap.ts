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
