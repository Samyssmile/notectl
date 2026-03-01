/**
 * Minimal preset: a lightweight editor with only font selection.
 */

import { FontPlugin } from '../plugins/font/FontPlugin.js';
import type { MinimalPresetOptions, PresetConfig } from './PresetTypes.js';

/**
 * Creates a minimal editor preset with font selection only.
 * CaretNavigation and GapCursor are auto-registered by the editor.
 *
 * Pass `font.fonts` to supply font definitions (e.g. `STARTER_FONTS`).
 * Without explicit fonts, the font picker toolbar renders empty.
 */
export function createMinimalPreset(options?: MinimalPresetOptions): PresetConfig {
	const fontPlugin: FontPlugin = new FontPlugin({
		fonts: [],
		...options?.font,
	});

	return {
		toolbar: [[fontPlugin]],
		plugins: [],
	};
}
