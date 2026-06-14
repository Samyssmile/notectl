/**
 * Key descriptor utilities: convert KeyboardEvents into stable descriptor
 * strings for keymap lookup.
 *
 * Two kinds of descriptor are produced:
 * - A layout-aware descriptor from `event.key` (primary, unchanged behavior).
 * - A physical, layout-independent descriptor from `event.code` (fallback,
 *   only for command shortcuts) so Ctrl/Cmd shortcuts resolve by physical key
 *   position regardless of keyboard layout (e.g. Cyrillic JCUKEN, where the
 *   physical `A` key reports `event.key = 'ф'`).
 */

/** Physical punctuation `KeyboardEvent.code` values mapped to their US-QWERTY base character. */
const CODE_PUNCTUATION: Readonly<Record<string, string>> = {
	Period: '.',
	Comma: ',',
	Slash: '/',
	Semicolon: ';',
	Quote: "'",
	BracketLeft: '[',
	BracketRight: ']',
	Backslash: '\\',
	Minus: '-',
	Equal: '=',
	Backquote: '`',
};

/**
 * Builds the physical `KeyboardEvent.code` to US-QWERTY base-character map:
 * the 26 letters, the 10 digit keys (main row and numpad), and common
 * punctuation. Named keys (Enter, Tab, Arrow*, Home, End) are intentionally
 * absent so the physical fallback never affects them.
 */
function buildCodeToKey(): ReadonlyMap<string, string> {
	const map: Map<string, string> = new Map<string, string>();
	for (let i = 0; i < 26; i++) {
		const letter: string = String.fromCharCode(65 + i);
		map.set(`Key${letter}`, letter);
	}
	for (let digit = 0; digit <= 9; digit++) {
		map.set(`Digit${digit}`, String(digit));
		map.set(`Numpad${digit}`, String(digit));
	}
	for (const [code, char] of Object.entries(CODE_PUNCTUATION)) {
		map.set(code, char);
	}
	return map;
}

/** Physical `KeyboardEvent.code` to US-QWERTY base character. Layout-independent. */
const CODE_TO_KEY: ReadonlyMap<string, string> = buildCodeToKey();

/** Builds the shared `Mod-Shift-Alt` modifier prefix segments for a key event. */
function modifierPrefix(e: KeyboardEvent): string[] {
	const parts: string[] = [];
	if (e.metaKey || e.ctrlKey) parts.push('Mod');
	if (e.shiftKey) parts.push('Shift');
	if (e.altKey) parts.push('Alt');
	return parts;
}

/**
 * Normalizes a KeyboardEvent into a consistent, layout-aware key descriptor.
 * Format: `"Mod-Shift-Alt-Key"` where Mod = Ctrl/Cmd. Single-character keys are
 * uppercased, Space is named explicitly, and special keys (Enter, Tab, ...)
 * keep their event name.
 */
export function normalizeKeyDescriptor(e: KeyboardEvent): string {
	const parts: string[] = modifierPrefix(e);

	let key: string = e.key;
	if (key === ' ') key = 'Space';
	else if (key.length === 1) key = key.toUpperCase();
	// For special keys like Enter, Tab, Backspace, keep as-is

	parts.push(key);
	return parts.join('-');
}

/**
 * Resolves the unmodified US-QWERTY base character for the physical key, or
 * `null` when a physical fallback must not apply.
 *
 * Gated to command shortcuts: only when Ctrl or Cmd is held, and never for
 * AltGr combinations (Ctrl+Alt without Cmd) which compose characters on many
 * non-Latin layouts and must not be hijacked.
 */
export function physicalBaseKey(e: KeyboardEvent): string | null {
	if (!(e.ctrlKey || e.metaKey)) return null; // shortcuts only
	if (e.ctrlKey && e.altKey && !e.metaKey) return null; // AltGr composes characters
	return CODE_TO_KEY.get(e.code) ?? null;
}

/**
 * Physical-position key descriptor for command shortcuts, or `null` when not
 * applicable (no command modifier, AltGr, or a named key absent from the base
 * map). Same `"Mod-Shift-Alt-Key"` format as {@link normalizeKeyDescriptor}.
 */
export function physicalKeyDescriptor(e: KeyboardEvent): string | null {
	const base: string | null = physicalBaseKey(e);
	if (base === null) return null;
	return [...modifierPrefix(e), base].join('-');
}
