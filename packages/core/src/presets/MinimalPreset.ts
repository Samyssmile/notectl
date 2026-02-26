/**
 * Minimal preset: a lightweight editor with only font selection.
 */

import { FontPlugin } from '../plugins/font/FontPlugin.js';
import { STARTER_FONTS } from '../plugins/font/StarterFonts.js';
import type { MinimalPresetOptions, PresetConfig } from './PresetTypes.js';

/**
 * Creates a minimal editor preset with font selection only.
 * CaretNavigation and GapCursor are auto-registered by the editor.
 */
export function createMinimalPreset(options?: MinimalPresetOptions): PresetConfig {
	const fontPlugin: FontPlugin = new FontPlugin({
		fonts: STARTER_FONTS,
		...options?.font,
	});

	return {
		toolbar: [[fontPlugin]],
		plugins: [],
	};
}
