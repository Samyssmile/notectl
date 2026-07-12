/**
 * Starter font definitions (Fira Code + Fira Sans as Base64 WOFF2).
 *
 * Prefer '@notectl/core/fonts/starter' so native ESM consumers do not also
 * download the independent OpenType MATH font.
 *
 * @example
 * ```ts
 * import { STARTER_FONTS } from '@notectl/core/fonts/starter';
 *
 * const editor = createEditor({
 *   plugins: [new FontPlugin({ fonts: STARTER_FONTS })],
 * });
 * ```
 */
export { FIRA_CODE, FIRA_SANS, STARTER_FONTS } from './plugins/font/StarterFonts.js';

/**
 * Bundled OpenType MATH font (subset of Noto Sans Math, SIL OFL 1.1).
 * Pass to the formula plugin so Chromium renders MathML stretchy constructs
 * (matrix brackets, large integrals/roots) correctly:
 *
 * ```ts
 * import { NOTECTL_MATH_FONT } from '@notectl/core/fonts/math';
 * new FormulaPlugin({ mathFont: NOTECTL_MATH_FONT });
 * ```
 */
export { NOTECTL_MATH_FONT } from './plugins/formula/MathFont.js';
