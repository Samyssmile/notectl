/**
 * Structural command handlers: fractions, roots, binomials, stacks.
 *
 * Layer A (framework-agnostic, zero notectl imports). These consume one or more
 * arguments and assemble the corresponding `mfrac`/`msqrt`/`mroot`/`mover`/
 * `munder` markup.
 */

import { mfrac, mo, mover, mroot, mrow, msqrt, munder } from '../../mathml/index.js';
import { atom } from '../LatexParserTypes.js';
import type { Atom, ParserApi } from '../LatexParserTypes.js';

const FRACTION_COMMANDS: ReadonlySet<string> = new Set(['frac', 'dfrac', 'tfrac', 'cfrac']);
const BINOM_COMMANDS: ReadonlySet<string> = new Set(['binom', 'dbinom', 'tbinom', 'choose']);
const STACK_COMMANDS: ReadonlySet<string> = new Set(['overset', 'underset', 'stackrel']);

/** Returns true when `name` is a fraction-like command. */
export function isFraction(name: string): boolean {
	return FRACTION_COMMANDS.has(name);
}

/** Returns true when `name` is a binomial-coefficient command. */
export function isBinom(name: string): boolean {
	return BINOM_COMMANDS.has(name);
}

/** Returns true when `name` is an over/under-set stacking command. */
export function isStack(name: string): boolean {
	return STACK_COMMANDS.has(name);
}

/** Parses `\frac`/`\dfrac`/`\tfrac`/`\cfrac` into an `mfrac`. */
export function parseFraction(api: ParserApi): Atom {
	const numerator: string = api.parseArgument();
	const denominator: string = api.parseArgument();
	return atom(mfrac(numerator, denominator));
}

/** Parses `\binom`/`\dbinom`/`\tbinom` into a parenthesized line-less fraction. */
export function parseBinom(api: ParserApi): Atom {
	const top: string = api.parseArgument();
	const bottom: string = api.parseArgument();
	const stack: string = mfrac(top, bottom, { linethickness: 0 });
	const open: string = mo('(', { fence: true });
	const close: string = mo(')', { fence: true });
	return atom(mrow(`${open}${stack}${close}`));
}

/** Parses `\sqrt` with an optional `[index]` into `msqrt`/`mroot`. */
export function parseSqrt(api: ParserApi): Atom {
	const index: string | undefined = api.parseOptionalArgument();
	const radicand: string = api.parseArgument();
	if (index === undefined || index === '') return atom(msqrt(radicand));
	return atom(mroot(radicand, index));
}

/**
 * Parses `\overset`/`\underset`/`\stackrel`. The first argument is the mark,
 * the second is the base (LaTeX order), assembled into `mover`/`munder`.
 */
export function parseStack(name: string, api: ParserApi): Atom {
	const mark: string = api.parseArgument();
	const base: string = api.parseArgument();
	if (name === 'underset') return atom(munder(base, mark));
	return atom(mover(base, mark));
}
