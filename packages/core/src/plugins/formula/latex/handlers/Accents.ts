/**
 * Accent and over/under-brace command handlers.
 *
 * Layer A (framework-agnostic, zero notectl imports). Each handler consumes one
 * argument and wraps it in an `mover`/`munder` with the right combining glyph.
 */

import { mo, mover, munder } from '../../mathml/index.js';
import { atom } from '../LatexParserTypes.js';
import type { Atom, ParserApi } from '../LatexParserTypes.js';

interface AccentSpec {
	/** The combining/standalone glyph drawn over or under the base. */
	readonly glyph: string;
	/** Whether the accent sits below (true) or above (false) the base. */
	readonly under: boolean;
	/** Whether the glyph stretches to the base width (braces, wide accents). */
	readonly stretchy: boolean;
}

function over(glyph: string, stretchy: boolean): AccentSpec {
	return { glyph, under: false, stretchy };
}

function under(glyph: string, stretchy: boolean): AccentSpec {
	return { glyph, under: true, stretchy };
}

const ACCENTS: Readonly<Record<string, AccentSpec>> = {
	hat: over('^', false),
	widehat: over('^', true),
	check: over('ˇ', false),
	tilde: over('~', false),
	widetilde: over('~', true),
	bar: over('‾', false),
	overline: over('‾', true),
	vec: over('→', false),
	overrightarrow: over('→', true),
	overleftarrow: over('←', true),
	overleftrightarrow: over('↔', true),
	dot: over('˙', false),
	ddot: over('¨', false),
	dddot: over('⃛', false),
	acute: over('´', false),
	grave: over('`', false),
	breve: over('˘', false),
	mathring: over('˚', false),
	overbrace: over('⏞', true),
	underline: under('_', true),
	underbrace: under('⏟', true),
	underrightarrow: under('→', true),
	underleftarrow: under('←', true),
};

/** Returns true when `name` is an accent/brace command. */
export function isAccent(name: string): boolean {
	return name in ACCENTS;
}

/** Parses an accent command's argument and returns the accented atom. */
export function parseAccent(name: string, api: ParserApi): Atom {
	const spec: AccentSpec | undefined = ACCENTS[name];
	if (!spec) return atom('');
	const base: string = api.parseArgument();
	const mark: string = mo(spec.glyph, { stretchy: spec.stretchy });
	const attrs: Readonly<Record<string, boolean>> = spec.under
		? { accentunder: true }
		: { accent: true };
	const built: string = spec.under ? munder(base, mark, attrs) : mover(base, mark, attrs);
	return atom(built);
}
