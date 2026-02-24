/**
 * Shared color validation and normalization utilities
 * for color-based mark plugins (TextColor, Highlight).
 */

const HEX_COLOR_PATTERN: RegExp = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Returns `true` when the value is a valid `#RGB` or `#RRGGBB` hex color. */
export function isValidHexColor(value: string): boolean {
	return HEX_COLOR_PATTERN.test(value);
}

/**
 * Validates, deduplicates, and normalizes a user-supplied color list.
 * Returns `fallbackPalette` when no custom colors are provided.
 *
 * @throws {Error} if any value is not a valid hex color code.
 */
export function resolveColors(
	colors: readonly string[] | undefined,
	fallbackPalette: readonly string[],
	pluginName: string,
): readonly string[] {
	if (!colors || colors.length === 0) return fallbackPalette;

	const invalid: string[] = colors.filter((c) => !isValidHexColor(c));
	if (invalid.length > 0) {
		throw new Error(
			`${pluginName}: invalid hex color(s): ${invalid.join(', ')}. Expected format: #RGB or #RRGGBB.`,
		);
	}

	const seen: Set<string> = new Set();
	const unique: string[] = [];
	for (const color of colors) {
		const normalized: string = color.toLowerCase();
		if (!seen.has(normalized)) {
			seen.add(normalized);
			unique.push(normalized);
		}
	}
	return unique;
}
