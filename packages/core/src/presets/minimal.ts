/**
 * Minimal preset entry point.
 *
 * Import from '@notectl/core/presets/minimal' to get only the minimal preset
 * without pulling in the full plugin suite.
 *
 * @example
 * ```ts
 * import { createMinimalPreset } from '@notectl/core/presets/minimal';
 * import { STARTER_FONTS } from '@notectl/core/fonts';
 *
 * const preset = createMinimalPreset({ font: { fonts: STARTER_FONTS } });
 * ```
 */
export type { PresetConfig, MinimalPresetOptions } from './PresetTypes.js';
export { createMinimalPreset } from './MinimalPreset.js';
