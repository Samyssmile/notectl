/**
 * Unicode "Mathematical Alphanumeric Symbols" mapping for math-alphabet fonts.
 *
 * Layer A (framework-agnostic, zero notectl imports). Chromium's MathML Core has
 * dropped support for most `mathvariant` values (double-struck, script, fraktur,
 * bold, …), so wrapping a letter in `<mstyle mathvariant="…">` no longer renders
 * the styled glyph. Instead — exactly like KaTeX's MathML output — each ASCII
 * letter/digit is remapped to its dedicated codepoint in the Mathematical
 * Alphanumeric Symbols block (U+1D400…U+1D7FF) and emitted as a literal glyph.
 *
 * The block has well-known "holes": a handful of letters live in the older
 * Letterlike Symbols block (U+2100…) instead of the contiguous range, so the
 * per-style tables list those exceptions explicitly.
 */

import { mi, mn } from '../mathml/index.js';

/** A math-alphabet font style backed by a Unicode symbol block. */
export type MathAlphabetStyle =
	| 'double-struck'
	| 'script'
	| 'fraktur'
	| 'bold'
	| 'italic'
	| 'sans-serif'
	| 'monospace';

/** Per-style codepoint bases plus the Letterlike-Symbols holes for that style. */
interface StyleTable {
	/** Codepoint of the styled uppercase 'A', start of the contiguous A–Z run. */
	readonly upperBase: number;
	/** Codepoint of the styled lowercase 'a', start of the contiguous a–z run. */
	readonly lowerBase: number;
	/** Codepoint of the styled '0', start of the contiguous 0–9 run, if any. */
	readonly digitBase?: number;
	/** Letters whose styled glyph lives outside the contiguous block. */
	readonly holes: Readonly<Record<string, number>>;
}

const NO_HOLES: Readonly<Record<string, number>> = {};

const TABLES: Readonly<Record<MathAlphabetStyle, StyleTable>> = {
	'double-struck': {
		upperBase: 0x1d538,
		lowerBase: 0x1d552,
		digitBase: 0x1d7d8,
		holes: {
			C: 0x2102,
			H: 0x210d,
			N: 0x2115,
			P: 0x2119,
			Q: 0x211a,
			R: 0x211d,
			Z: 0x2124,
		},
	},
	script: {
		upperBase: 0x1d49c,
		lowerBase: 0x1d4b6,
		holes: {
			B: 0x212c,
			E: 0x2130,
			F: 0x2131,
			H: 0x210b,
			I: 0x2110,
			L: 0x2112,
			M: 0x2133,
			R: 0x211b,
			e: 0x212f,
			g: 0x210a,
			o: 0x2134,
		},
	},
	fraktur: {
		upperBase: 0x1d504,
		lowerBase: 0x1d51e,
		holes: {
			C: 0x212d,
			H: 0x210c,
			I: 0x2111,
			R: 0x211c,
			Z: 0x2128,
		},
	},
	bold: {
		upperBase: 0x1d400,
		lowerBase: 0x1d41a,
		digitBase: 0x1d7ce,
		holes: NO_HOLES,
	},
	italic: {
		upperBase: 0x1d434,
		lowerBase: 0x1d44e,
		holes: { h: 0x210e },
	},
	'sans-serif': {
		upperBase: 0x1d5a0,
		lowerBase: 0x1d5ba,
		digitBase: 0x1d7e2,
		holes: NO_HOLES,
	},
	monospace: {
		upperBase: 0x1d670,
		lowerBase: 0x1d68a,
		digitBase: 0x1d7f6,
		holes: NO_HOLES,
	},
};

function isUpper(ch: string): boolean {
	return ch >= 'A' && ch <= 'Z';
}

function isLower(ch: string): boolean {
	return ch >= 'a' && ch <= 'z';
}

function isDigit(ch: string): boolean {
	return ch >= '0' && ch <= '9';
}

/**
 * Maps a single ASCII letter/digit to its styled Unicode glyph for `style`.
 *
 * Returns the literal glyph string (a single astral code point built with
 * `String.fromCodePoint`), or `null` when there is no mapping — i.e. the
 * character is not an A–Z / a–z / 0–9, or the style has no digit block (so
 * digits keep their ASCII form, e.g. under italic). Callers fall back to the
 * plain character on `null`.
 */
export function mathAlphaChar(ch: string, style: MathAlphabetStyle): string | null {
	if (ch.length !== 1) return null;
	const table: StyleTable = TABLES[style];
	const hole: number | undefined = table.holes[ch];
	if (hole !== undefined) return String.fromCodePoint(hole);
	if (isUpper(ch)) return String.fromCodePoint(table.upperBase + (ch.charCodeAt(0) - 65));
	if (isLower(ch)) return String.fromCodePoint(table.lowerBase + (ch.charCodeAt(0) - 97));
	if (isDigit(ch) && table.digitBase !== undefined) {
		return String.fromCodePoint(table.digitBase + (ch.charCodeAt(0) - 48));
	}
	return null;
}

/** Matches the inner text of a leaf `<mi>`/`<mn>` element (no nested tags). */
const LEAF_TEXT = /<(mi|mn)>([^<]*)<\/\1>/g;
/** Matches a leaf `<mi>` element that carries no attributes. */
const BARE_MI = /<mi>([^<]*)<\/mi>/g;

/**
 * Remaps every ASCII letter/digit in the leaf identifiers/numbers of `markup`
 * to its styled Unicode glyph, rebuilding the element so the glyph renders in
 * engines without `mathvariant` support. Characters with no mapping (operators,
 * spaces, already-styled symbols, digits under a digit-less style) are left
 * untouched, which lets `\mathbb{+}` pass the `+` through unchanged.
 */
export function applyMathAlphabet(markup: string, style: MathAlphabetStyle): string {
	return markup.replace(LEAF_TEXT, (_match, tag: string, text: string) => {
		const mapped: string = remapText(text, style);
		return tag === 'mn' ? mn(mapped) : mi(mapped);
	});
}

function remapText(text: string, style: MathAlphabetStyle): string {
	let out = '';
	for (const ch of text) {
		out += mathAlphaChar(ch, style) ?? ch;
	}
	return out;
}

/**
 * Forces upright rendering for `\mathrm`: adds `mathvariant="normal"` to every
 * bare leaf `<mi>` so multi-letter content stays upright even in engines that
 * dropped `mathvariant` on `<mstyle>`. `normal` is the one variant value MathML
 * Core retained on `<mi>`. Numbers and operators already render upright.
 */
export function applyUprightIdentifiers(markup: string): string {
	return markup.replace(BARE_MI, (_match, text: string) => mi(text, { mathvariant: 'normal' }));
}
