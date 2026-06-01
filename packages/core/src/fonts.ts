/**
 * Starter font definitions (Fira Code + Fira Sans as Base64 WOFF2).
 *
 * Import from '@notectl/core/fonts' to keep base64 font data
 * out of the main bundle for consumers who don't need it.
 *
 * @example
 * ```ts
 * import { STARTER_FONTS } from '@notectl/core/fonts';
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
 * import { NOTECTL_MATH_FONT } from '@notectl/core/fonts';
 * new FormulaPlugin({ mathFont: NOTECTL_MATH_FONT });
 * ```
 */
export { NOTECTL_MATH_FONT } from './plugins/formula/MathFont.js';
