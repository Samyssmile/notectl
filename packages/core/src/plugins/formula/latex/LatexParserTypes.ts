/**
 * Shared types for the LaTeX recursive-descent parser.
 *
 * Layer A (framework-agnostic, zero notectl imports). Defines the atom model
 * (the unit of the parse, carrying its MathML markup plus metadata needed for
 * script and limit placement) and the parser-facing interfaces used by the
 * per-category command handlers.
 */

import type { SymbolKind } from './LatexSymbols.js';
import type { LatexError } from './LatexToMathML.js';
import type { Token } from './LatexTokenizer.js';

/**
 * A single parsed atom. The parser accumulates a list of these per group so
 * `^`/`_`/`'` can attach to the *preceding* atom and big-operator limit
 * placement can key off the atom's kind.
 */
export interface Atom {
	/** The MathML markup for this atom (already built via the builder). */
	readonly node: string;
	/** Symbol kind, when the atom came from a known symbol; drives limits. */
	readonly kind?: SymbolKind;
	/** True when this atom is a big operator that takes movable limits. */
	readonly bigOp?: boolean;
	/** True for integral-family operators, whose limits stay as side scripts. */
	readonly intLike?: boolean;
}

/** Builds a plain ordinary atom from finished markup. */
export function atom(node: string, kind?: SymbolKind): Atom {
	return kind === undefined ? { node } : { node, kind };
}

/**
 * Builds a big-operator atom (∑, ∫, lim, …) that accepts movable limits.
 * `intLike` marks integral-family operators whose limits stay as side scripts
 * even in display mode (standard typographic convention).
 */
export function bigOpAtom(node: string, kind: SymbolKind, intLike = false): Atom {
	return { node, kind, bigOp: true, intLike };
}

/**
 * Parser surface exposed to per-category command handlers. Keeps handlers free
 * of the concrete parser class so they stay small and independently testable.
 */
export interface ParserApi {
	/** Whether display (block) style is active; affects limit placement. */
	readonly display: boolean;
	/** Returns the next token without consuming it, or undefined at EOF. */
	peek(): Token | undefined;
	/** Consumes and returns the next token, or undefined at EOF. */
	next(): Token | undefined;
	/**
	 * Parses one mandatory argument (a `{...}` group or a single token) and
	 * returns its MathML markup. At EOF returns `''` (graceful recovery).
	 */
	parseArgument(): string;
	/**
	 * Parses an optional bracketed argument `[...]` if present, returning its
	 * markup, or undefined when the next token is not `[`.
	 */
	parseOptionalArgument(): string | undefined;
	/**
	 * Parses one mandatory argument as literal source text (no math markup),
	 * used by `\text`/`\operatorname`. At EOF returns `''`.
	 */
	parseRawArgument(): string;
	/**
	 * Parses tokens until the matching group close (or a custom stop), returning
	 * the assembled atoms. Used for environment cells and delimiter bodies.
	 */
	parseAtomsUntil(stop: (token: Token) => boolean): readonly Atom[];
	/** Records a recoverable error. */
	error(err: LatexError): void;
}
