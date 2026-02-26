/**
 * Shared CSS validation and normalization utilities
 * for style-based mark plugins (TextColor, Highlight, Font, FontSize).
 */

const HEX_COLOR_PATTERN: RegExp = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Returns `true` when the value is a valid `#RGB` or `#RRGGBB` hex color. */
export function isValidHexColor(value: string): boolean {
	return HEX_COLOR_PATTERN.test(value);
}

// --- CSS Color Validation (broad format support for paste / API input) ---

/** Matches `rgb(r, g, b)` and `rgba(r, g, b, a)` with integer or percentage values. */
const RGB_PATTERN: RegExp =
	/^rgba?\(\s*(\d{1,3}%?\s*,\s*){2}\d{1,3}%?(\s*,\s*(0|1|0?\.\d+))?\s*\)$/;

/** Matches `hsl(h, s%, l%)` and `hsla(h, s%, l%, a)`. */
const HSL_PATTERN: RegExp =
	/^hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(\s*,\s*(0|1|0?\.\d+))?\s*\)$/;

/**
 * Complete set of CSS Level 4 named colors (including `transparent`).
 * Used as an allowlist — unknown names are rejected.
 */
const CSS_NAMED_COLORS: ReadonlySet<string> = new Set([
	'aliceblue',
	'antiquewhite',
	'aqua',
	'aquamarine',
	'azure',
	'beige',
	'bisque',
	'black',
	'blanchedalmond',
	'blue',
	'blueviolet',
	'brown',
	'burlywood',
	'cadetblue',
	'chartreuse',
	'chocolate',
	'coral',
	'cornflowerblue',
	'cornsilk',
	'crimson',
	'cyan',
	'darkblue',
	'darkcyan',
	'darkgoldenrod',
	'darkgray',
	'darkgreen',
	'darkgrey',
	'darkkhaki',
	'darkmagenta',
	'darkolivegreen',
	'darkorange',
	'darkorchid',
	'darkred',
	'darksalmon',
	'darkseagreen',
	'darkslateblue',
	'darkslategray',
	'darkslategrey',
	'darkturquoise',
	'darkviolet',
	'deeppink',
	'deepskyblue',
	'dimgray',
	'dimgrey',
	'dodgerblue',
	'firebrick',
	'floralwhite',
	'forestgreen',
	'fuchsia',
	'gainsboro',
	'ghostwhite',
	'gold',
	'goldenrod',
	'gray',
	'green',
	'greenyellow',
	'grey',
	'honeydew',
	'hotpink',
	'indianred',
	'indigo',
	'ivory',
	'khaki',
	'lavender',
	'lavenderblush',
	'lawngreen',
	'lemonchiffon',
	'lightblue',
	'lightcoral',
	'lightcyan',
	'lightgoldenrodyellow',
	'lightgray',
	'lightgreen',
	'lightgrey',
	'lightpink',
	'lightsalmon',
	'lightseagreen',
	'lightskyblue',
	'lightslategray',
	'lightslategrey',
	'lightsteelblue',
	'lightyellow',
	'lime',
	'limegreen',
	'linen',
	'magenta',
	'maroon',
	'mediumaquamarine',
	'mediumblue',
	'mediumorchid',
	'mediumpurple',
	'mediumseagreen',
	'mediumslateblue',
	'mediumspringgreen',
	'mediumturquoise',
	'mediumvioletred',
	'midnightblue',
	'mintcream',
	'mistyrose',
	'moccasin',
	'navajowhite',
	'navy',
	'oldlace',
	'olive',
	'olivedrab',
	'orange',
	'orangered',
	'orchid',
	'palegoldenrod',
	'palegreen',
	'paleturquoise',
	'palevioletred',
	'papayawhip',
	'peachpuff',
	'peru',
	'pink',
	'plum',
	'powderblue',
	'purple',
	'rebeccapurple',
	'red',
	'rosybrown',
	'royalblue',
	'saddlebrown',
	'salmon',
	'sandybrown',
	'seagreen',
	'seashell',
	'sienna',
	'silver',
	'skyblue',
	'slateblue',
	'slategray',
	'slategrey',
	'snow',
	'springgreen',
	'steelblue',
	'tan',
	'teal',
	'thistle',
	'tomato',
	'transparent',
	'turquoise',
	'violet',
	'wheat',
	'white',
	'whitesmoke',
	'yellow',
	'yellowgreen',
]);

/**
 * Returns `true` when `value` is a safe CSS color value.
 * Accepts hex (`#RGB`, `#RRGGBB`), `rgb()`, `rgba()`, `hsl()`, `hsla()`,
 * and CSS named colors. Rejects anything else — defense against CSS injection
 * via manipulated color values in `style` attributes.
 */
export function isValidCSSColor(value: string): boolean {
	if (!value) return false;
	const trimmed: string = value.trim().toLowerCase();
	if (!trimmed) return false;

	return (
		HEX_COLOR_PATTERN.test(trimmed) ||
		RGB_PATTERN.test(trimmed) ||
		HSL_PATTERN.test(trimmed) ||
		CSS_NAMED_COLORS.has(trimmed)
	);
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

// --- Font Family Validation ---

/** Characters that are never valid in a CSS font-family value. */
const FONT_FAMILY_FORBIDDEN: RegExp = /[{}<>;]|url\(|expression\(/i;

/**
 * Returns `true` when `value` is a safe CSS `font-family` value.
 * Rejects values containing `{`, `}`, `;`, `<`, `>`, `url(`, or `expression(`
 * to defend against CSS injection.
 */
export function isValidCSSFontFamily(value: string): boolean {
	if (!value) return false;
	const trimmed: string = value.trim();
	if (!trimmed) return false;
	return !FONT_FAMILY_FORBIDDEN.test(trimmed);
}

// --- Font Size Validation ---

/** Matches valid CSS font-size values: number with unit (px, pt, em, rem, %). */
const FONT_SIZE_PATTERN: RegExp = /^\d+(\.\d+)?(px|pt|em|rem|%)$/i;

/**
 * Returns `true` when `value` is a safe CSS `font-size` value.
 * Accepts values like `16px`, `1.5em`, `12pt`, `100%`, `0.875rem`.
 */
export function isValidCSSFontSize(value: string): boolean {
	if (!value) return false;
	return FONT_SIZE_PATTERN.test(value.trim());
}
