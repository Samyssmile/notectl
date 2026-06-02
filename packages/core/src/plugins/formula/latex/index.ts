/**
 * Layer A `latex/` barrel: zero-dependency LaTeX → Presentation MathML converter.
 *
 * Zero notectl imports — depends only on the sibling `../mathml/` module and
 * standard JS/TS, so it is publishable as a standalone library.
 */

export { latexToMathML } from './LatexToMathML.js';
export type {
	LatexConversionResult,
	LatexError,
	LatexToMathMLOptions,
} from './LatexToMathML.js';
export { SYMBOLS, SymbolKind, lookupSymbol } from './LatexSymbols.js';
export type { SymbolEntry } from './LatexSymbols.js';
