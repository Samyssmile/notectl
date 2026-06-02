/**
 * Public entry point for the zero-dependency LaTeX → Presentation MathML converter.
 *
 * Layer A (framework-agnostic, zero notectl imports). Tokenizes the source,
 * runs the recursive-descent parser, and groups the top-level atoms into a
 * single MathML root element. Never throws: malformed input is recovered, and
 * every problem is surfaced both as a visible `merror`/marker in the output and
 * as a recorded `LatexError`.
 */

import { mrow } from '../mathml/index.js';
import { parseLatex } from './LatexParser.js';
import type { Atom } from './LatexParserTypes.js';

/** A single recoverable problem encountered while converting LaTeX. */
export interface LatexError {
	/** Human-readable description (e.g. 'Unknown command'). */
	readonly message: string;
	/** The offending command, including the leading backslash, when applicable. */
	readonly command?: string;
	/** Zero-based source position of the problem, when known. */
	readonly position?: number;
}

/** The result of a LaTeX → MathML conversion. */
export interface LatexConversionResult {
	/** A SINGLE root presentation-MathML element string (e.g. `<mrow>…</mrow>`). Never empty: uses `<mrow></mrow>`. */
	readonly presentation: string;
	/** Every problem encountered; empty when the input converted cleanly. */
	readonly errors: readonly LatexError[];
}

/** Options controlling how the LaTeX source is converted. */
export interface LatexToMathMLOptions {
	/** Display (block) vs inline. Affects displaystyle / big-operator limit placement. */
	readonly display?: boolean;
}

const EMPTY_ROOT = '<mrow></mrow>';

/** Converts a LaTeX math string to a presentation-MathML root element. Never throws. */
export function latexToMathML(latex: string, opts?: LatexToMathMLOptions): LatexConversionResult {
	const display: boolean = opts?.display ?? false;
	const trimmed: string = latex.trim();
	if (trimmed === '') return { presentation: EMPTY_ROOT, errors: [] };
	const { atoms, errors } = parseLatex(latex, display);
	return { presentation: rootElement(atoms), errors };
}

function rootElement(atoms: readonly Atom[]): string {
	if (atoms.length === 0) return EMPTY_ROOT;
	if (atoms.length === 1) {
		const only: Atom | undefined = atoms[0];
		return only ? only.node : EMPTY_ROOT;
	}
	return mrow(atoms.map((a) => a.node).join(''));
}
