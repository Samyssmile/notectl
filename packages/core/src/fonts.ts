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
