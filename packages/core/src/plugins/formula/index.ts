/**
 * Public barrel for the formula (math) plugin.
 *
 * Re-exports the notectl plugin plus the standalone, framework-agnostic
 * LaTeX→MathML converter for advanced/standalone use.
 */

export { FormulaPlugin } from './FormulaPlugin.js';
export {
	DEFAULT_FORMULA_KEYMAP,
	type FormulaAttrs,
	type FormulaKeymap,
	type FormulaPluginConfig,
} from './FormulaTypes.js';
export type { FormulaLocale } from './FormulaLocale.js';
export { FORMULA_LOCALE_EN, loadFormulaLocale } from './FormulaLocale.js';

// Layer A (spin-off-able) public surface:
export { latexToMathML } from './latex/index.js';
export type {
	LatexConversionResult,
	LatexError,
	LatexToMathMLOptions,
} from './latex/index.js';
export { buildMathML, MATHML_ATTRS, MATHML_TAGS } from './mathml/index.js';
