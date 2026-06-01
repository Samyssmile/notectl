/**
 * Font/style command handlers (`\mathbb`, `\text`, `\operatorname`, …).
 *
 * Layer A (framework-agnostic, zero notectl imports). Math-alphabet commands
 * (`\mathbb`, `\mathcal`, …) remap their ASCII letters/digits to the dedicated
 * Unicode "Mathematical Alphanumeric Symbols" glyphs (see `MathAlphabet`), since
 * Chromium's MathML Core dropped `mathvariant`; `\mathrm` forces upright
 * identifiers; text commands emit upright `mtext` from the raw argument source.
 */

import { mi, mstyle, mtext } from '../../mathml/index.js';
import { atom } from '../LatexParserTypes.js';
import type { Atom, ParserApi } from '../LatexParserTypes.js';
import {
	type MathAlphabetStyle,
	applyMathAlphabet,
	applyUprightIdentifiers,
} from '../MathAlphabet.js';

/** Alphabet-variant commands mapped to a Unicode symbol block (no `mathvariant`). */
const ALPHABET_STYLES: Readonly<Record<string, MathAlphabetStyle>> = {
	mathbb: 'double-struck',
	mathcal: 'script',
	mathscr: 'script',
	mathfrak: 'fraktur',
	mathbf: 'bold',
	mathit: 'italic',
	mathsf: 'sans-serif',
	mathtt: 'monospace',
};

/** Variant commands still emitted via `mathvariant` (no dedicated glyph block). */
const VARIANTS: Readonly<Record<string, string>> = {
	boldsymbol: 'bold-italic',
	bm: 'bold-italic',
};

/** Commands whose single argument is rendered as upright literal text. */
const TEXT_COMMANDS: Readonly<Record<string, string | undefined>> = {
	text: undefined,
	textnormal: 'normal',
	textrm: 'normal',
	textbf: 'bold',
	textit: 'italic',
	textsf: 'sans-serif',
	texttt: 'monospace',
	mbox: undefined,
};

/** Returns true when `name` is a font/style or text command. */
export function isFontCommand(name: string): boolean {
	return (
		name in ALPHABET_STYLES ||
		name in VARIANTS ||
		name in TEXT_COMMANDS ||
		name === 'mathrm' ||
		name === 'operatorname'
	);
}

/** Parses a font/style/text command and returns the styled atom. */
export function parseFontCommand(name: string, api: ParserApi): Atom {
	if (name === 'operatorname') {
		return atom(mi(api.parseRawArgument(), { mathvariant: 'normal' }));
	}
	if (name in TEXT_COMMANDS) {
		const variant: string | undefined = TEXT_COMMANDS[name];
		const raw: string = api.parseRawArgument();
		return atom(variant ? mtext(raw, { mathvariant: variant }) : mtext(raw));
	}
	const alphabet: MathAlphabetStyle | undefined = ALPHABET_STYLES[name];
	if (alphabet !== undefined) {
		return atom(applyMathAlphabet(api.parseArgument(), alphabet));
	}
	if (name === 'mathrm') {
		return atom(applyUprightIdentifiers(api.parseArgument()));
	}
	const variant: string | undefined = VARIANTS[name];
	const body: string = api.parseArgument();
	return atom(mstyle(body, { mathvariant: variant ?? 'normal' }));
}
