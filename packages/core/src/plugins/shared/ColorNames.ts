/**
 * Human-readable color name lookup for accessibility.
 *
 * Provides descriptive names for color swatches so screen readers
 * announce "Red" instead of "#ff0000". Covers all default palette
 * colors with a fallback algorithm for custom hex values.
 */

// ---------------------------------------------------------------------------
// Static name map — covers every default palette color
// ---------------------------------------------------------------------------

const COLOR_NAME_MAP: ReadonlyMap<string, string> = new Map([
	// ── TextColor palette (70 colors) ──────────────────────────────────────

	// Row 1 — Grays
	['#000000', 'Black'],
	['#434343', 'Dark Gray 4'],
	['#666666', 'Dark Gray 3'],
	['#999999', 'Dark Gray 2'],
	['#b7b7b7', 'Dark Gray 1'],
	['#cccccc', 'Light Gray 3'],
	['#d9d9d9', 'Light Gray 2'],
	['#efefef', 'Light Gray 1'],
	['#f3f3f3', 'Near White'],
	['#ffffff', 'White'],

	// Row 2 — Vivid
	['#980000', 'Dark Red Berry'],
	['#ff0000', 'Red'],
	['#ff9900', 'Orange'],
	['#ffff00', 'Yellow'],
	['#00ff00', 'Green'],
	['#00ffff', 'Cyan'],
	['#4a86e8', 'Cornflower Blue'],
	['#0000ff', 'Blue'],
	['#9900ff', 'Purple'],
	['#ff00ff', 'Magenta'],

	// Row 3 — Light 3 (lightest tint)
	['#e6b8af', 'Light Red Berry 3'],
	['#f4cccc', 'Light Red 3'],
	['#fce5cd', 'Light Orange 3'],
	['#fff2cc', 'Light Yellow 3'],
	['#d9ead3', 'Light Green 3'],
	['#d0e0e3', 'Light Cyan 3'],
	['#c9daf8', 'Light Cornflower Blue 3'],
	['#cfe2f3', 'Light Blue 3'],
	['#d9d2e9', 'Light Purple 3'],
	['#ead1dc', 'Light Magenta 3'],

	// Row 4 — Light 2
	['#dd7e6b', 'Light Red Berry 2'],
	['#ea9999', 'Light Red 2'],
	['#f9cb9c', 'Light Orange 2'],
	['#ffe599', 'Light Yellow 2'],
	['#b6d7a8', 'Light Green 2'],
	['#a2c4c9', 'Light Cyan 2'],
	['#a4c2f4', 'Light Cornflower Blue 2'],
	['#9fc5e8', 'Light Blue 2'],
	['#b4a7d6', 'Light Purple 2'],
	['#d5a6bd', 'Light Magenta 2'],

	// Row 5 — Light 1
	['#cc4125', 'Light Red Berry 1'],
	['#e06666', 'Light Red 1'],
	['#f6b26b', 'Light Orange 1'],
	['#ffd966', 'Light Yellow 1'],
	['#93c47d', 'Light Green 1'],
	['#76a5af', 'Light Cyan 1'],
	['#6d9eeb', 'Light Cornflower Blue 1'],
	['#6fa8dc', 'Light Blue 1'],
	['#8e7cc3', 'Light Purple 1'],
	['#c27ba0', 'Light Magenta 1'],

	// Row 6 — Dark 1
	['#a61c00', 'Dark Red Berry 1'],
	['#cc0000', 'Dark Red 1'],
	['#e69138', 'Dark Orange 1'],
	['#f1c232', 'Dark Yellow 1'],
	['#6aa84f', 'Dark Green 1'],
	['#45818e', 'Dark Cyan 1'],
	['#3c78d8', 'Dark Cornflower Blue 1'],
	['#3d85c6', 'Dark Blue 1'],
	['#674ea7', 'Dark Purple 1'],
	['#a64d79', 'Dark Magenta 1'],

	// Row 7 — Dark 2
	['#85200c', 'Dark Red Berry 2'],
	['#990000', 'Dark Red 2'],
	['#b45f06', 'Dark Orange 2'],
	['#bf9000', 'Dark Yellow 2'],
	['#38761d', 'Dark Green 2'],
	['#134f5c', 'Dark Cyan 2'],
	['#1155cc', 'Dark Cornflower Blue 2'],
	['#0b5394', 'Dark Blue 2'],
	['#351c75', 'Dark Purple 2'],
	['#741b47', 'Dark Magenta 2'],

	// ── Highlight palette (50 colors, minus duplicates) ────────────────────

	// Row 1 — Classic highlighter (bright, vivid)
	['#fff176', 'Bright Yellow'],
	['#aed581', 'Light Green'],
	['#4dd0e1', 'Bright Cyan'],
	['#64b5f6', 'Sky Blue'],
	['#ce93d8', 'Lavender'],
	['#f48fb1', 'Pink'],
	['#ffab91', 'Peach'],
	['#ff8a65', 'Coral'],
	['#e6ee9c', 'Lime'],
	['#80cbc4', 'Teal'],

	// Row 2 — Light pastels
	['#fff9c4', 'Pale Yellow'],
	['#dcedc8', 'Pale Green'],
	['#e0f7fa', 'Pale Cyan'],
	['#e3f2fd', 'Pale Blue'],
	['#f3e5f5', 'Pale Purple'],
	['#fce4ec', 'Pale Pink'],
	['#fff3e0', 'Pale Orange'],
	['#fbe9e7', 'Pale Red'],
	['#f9fbe7', 'Pale Lime'],
	['#e0f2f1', 'Pale Teal'],

	// Row 3 — Medium pastels
	['#fff59d', 'Soft Yellow'],
	['#c5e1a5', 'Soft Green'],
	['#80deea', 'Soft Cyan'],
	['#90caf9', 'Soft Blue'],
	['#e1bee7', 'Soft Purple'],
	['#f8bbd0', 'Soft Pink'],
	['#ffcc80', 'Soft Orange'],
	// #ffab91 duplicate → Peach (already mapped)
	// #e6ee9c duplicate → Lime (already mapped)
	['#a5d6a7', 'Mint'],

	// Row 4 — Bold pastels
	['#ffee58', 'Vivid Yellow'],
	['#9ccc65', 'Vivid Green'],
	['#26c6da', 'Vivid Cyan'],
	['#42a5f5', 'Vivid Blue'],
	['#ab47bc', 'Vivid Purple'],
	['#ec407a', 'Vivid Pink'],
	['#ffa726', 'Vivid Orange'],
	['#ff7043', 'Red Orange'],
	['#d4e157', 'Vivid Lime'],
	['#66bb6a', 'Emerald'],

	// Row 5 — Grays and neutral highlights
	// #ffffff duplicate → White (already mapped)
	['#fafafa', 'Almost White'],
	['#f5f5f5', 'Lightest Gray'],
	['#eeeeee', 'Very Light Gray'],
	['#e0e0e0', 'Silver'],
	['#bdbdbd', 'Medium Gray'],
	['#e8eaf6', 'Lavender Gray'],
	['#efebe9', 'Warm Gray'],
	['#eceff1', 'Cool Gray'],
	// #fafafa duplicate → Almost White (already mapped)
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable name for a hex color.
 *
 * Checks the static map first, then falls back to a computed
 * description based on hue, saturation, and lightness.
 */
export function getColorName(hex: string): string {
	const name: string | undefined = COLOR_NAME_MAP.get(hex.toLowerCase());
	if (name) return name;
	return describeColor(hex);
}

/**
 * Determines whether a color is light enough to need a visible
 * border when rendered on a white background (WCAG 1.4.11).
 *
 * Uses a contrast-ratio threshold of 3:1 against white.
 */
export function isLightColor(hex: string): boolean {
	const luminance: number = relativeLuminance(hex);
	// Contrast ratio against white: (1.05) / (L + 0.05) < 3
	// ⟹ L > 1.05/3 − 0.05 = 0.3
	const LIGHT_THRESHOLD = 0.3;
	return luminance > LIGHT_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Expands `#RGB` to `#RRGGBB` and lowercases. */
function normalizeHex(hex: string): string {
	const h: string = hex.toLowerCase();
	if (h.length === 4) {
		return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
	}
	return h;
}

/** Applies sRGB linearization to a single channel value (0–1). */
function linearize(channel: number): number {
	return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Computes WCAG relative luminance from a hex color. */
function relativeLuminance(hex: string): number {
	const normalized: string = normalizeHex(hex);
	const r: number = linearize(Number.parseInt(normalized.slice(1, 3), 16) / 255);
	const g: number = linearize(Number.parseInt(normalized.slice(3, 5), 16) / 255);
	const b: number = linearize(Number.parseInt(normalized.slice(5, 7), 16) / 255);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Hue boundary table: upper bound (degrees) → name. */
const HUE_NAMES: readonly (readonly [number, string])[] = [
	[15, 'Red'],
	[45, 'Orange'],
	[65, 'Yellow'],
	[150, 'Green'],
	[190, 'Cyan'],
	[250, 'Blue'],
	[290, 'Purple'],
	[330, 'Pink'],
	[361, 'Red'],
];

/**
 * Generates a descriptive name from a hex color using HSL analysis.
 * Produces names like "Dark Blue", "Light Green", or "Gray".
 */
function describeColor(hex: string): string {
	const normalized: string = normalizeHex(hex);
	const rRaw: number = Number.parseInt(normalized.slice(1, 3), 16) / 255;
	const gRaw: number = Number.parseInt(normalized.slice(3, 5), 16) / 255;
	const bRaw: number = Number.parseInt(normalized.slice(5, 7), 16) / 255;

	const max: number = Math.max(rRaw, gRaw, bRaw);
	const min: number = Math.min(rRaw, gRaw, bRaw);
	const lightness: number = (max + min) / 2;
	const delta: number = max - min;

	// Achromatic
	if (delta < 0.05) {
		if (lightness < 0.15) return 'Black';
		if (lightness < 0.35) return 'Dark Gray';
		if (lightness < 0.65) return 'Gray';
		if (lightness < 0.85) return 'Light Gray';
		return 'Near White';
	}

	// Compute hue in degrees
	let hue = 0;
	if (max === rRaw) {
		hue = ((gRaw - bRaw) / delta + (gRaw < bRaw ? 6 : 0)) * 60;
	} else if (max === gRaw) {
		hue = ((bRaw - rRaw) / delta + 2) * 60;
	} else {
		hue = ((rRaw - gRaw) / delta + 4) * 60;
	}

	// Look up hue name
	let hueName = 'Red';
	for (const [threshold, name] of HUE_NAMES) {
		if (hue < threshold) {
			hueName = name;
			break;
		}
	}

	// Lightness modifier
	if (lightness < 0.25) return `Very Dark ${hueName}`;
	if (lightness < 0.4) return `Dark ${hueName}`;
	if (lightness > 0.8) return `Very Light ${hueName}`;
	if (lightness > 0.65) return `Light ${hueName}`;
	return hueName;
}
