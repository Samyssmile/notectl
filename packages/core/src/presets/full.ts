/**
 * Full preset entry point.
 *
 * Import from '@notectl/core/presets/full' to get the full preset
 * with all standard plugins.
 *
 * @example
 * ```ts
 * import { createFullPreset } from '@notectl/core/presets/full';
 * import { STARTER_FONTS } from '@notectl/core/fonts';
 *
 * const preset = createFullPreset({ font: { fonts: STARTER_FONTS } });
 * ```
 */
export type { PresetConfig, FullPresetOptions } from './PresetTypes.js';
export { createFullPreset } from './FullPreset.js';
