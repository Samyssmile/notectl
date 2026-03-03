import { isMac } from '../../platform/Platform.js';

/**
 * Formats a keymap binding string into a human-readable shortcut,
 * using platform-appropriate modifier symbols (⌘ on Mac, Ctrl on others).
 *
 * @example formatShortcut('Mod-B') → "Ctrl+B" or "⌘B"
 * @example formatShortcut('Mod-Shift-X') → "Ctrl+Shift+X" or "⌘⇧X"
 */
export function formatShortcut(binding: string): string {
	if (isMac()) {
		return binding
			.replace(/Mod/g, '⌘')
			.replace(/Shift/g, '⇧')
			.replace(/Alt/g, '⌥')
			.replace(/-/g, '');
	}
	return binding.replace(/Mod/g, 'Ctrl').replace(/-/g, '+');
}
