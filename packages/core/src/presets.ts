/**
 * Preset factory functions entry point (barrel).
 *
 * For smaller bundles, prefer the granular sub-path imports:
 * - `@notectl/core/presets/minimal` — minimal preset only (~5 KB gzip)
 * - `@notectl/core/presets/full` — full preset with all plugins (~60 KB gzip)
 *
 * This barrel re-exports both for backward compatibility.
 *
 * @example
 * ```ts
 * import { createFullPreset } from '@notectl/core/presets';
 * import { STARTER_FONTS } from '@notectl/core/fonts';
 *
 * const preset = createFullPreset({ font: { fonts: STARTER_FONTS } });
 * ```
 */
export * from './presets/minimal.js';
export * from './presets/full.js';
