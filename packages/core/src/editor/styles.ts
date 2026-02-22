/**
 * Editor styles using Adopted Stylesheets for Shadow DOM.
 *
 * All colors reference CSS custom properties set by the ThemeEngine.
 * The theme stylesheet is always injected first, providing all --notectl-* values.
 *
 * Styles are split into per-feature modules under `./styles/`.
 * Plugins can register additional CSS via `PluginContext.registerStyleSheet()`.
 */

import { BASE_CSS } from './styles/base.js';
import { CODE_BLOCK_CSS } from './styles/code-block.js';
import { COLOR_PICKER_CSS } from './styles/color-picker.js';
import { FONT_SELECT_CSS } from './styles/font-select.js';
import { FONT_SIZE_SELECT_CSS } from './styles/font-size-select.js';
import { HEADING_SELECT_CSS } from './styles/heading-select.js';
import { IMAGE_CSS } from './styles/image.js';
import { LIST_CSS } from './styles/list.js';
import { REDUCED_MOTION_CSS } from './styles/reduced-motion.js';
import { TABLE_CSS } from './styles/table.js';
import { TOOLBAR_CSS } from './styles/toolbar.js';

/**
 * Combined CSS for the core editor and all built-in features.
 * This is the full monolithic stylesheet — used by the main entry
 * and the UMD build for backwards compatibility.
 */
const EDITOR_CSS: string = [
	BASE_CSS,
	TOOLBAR_CSS,
	LIST_CSS,
	IMAGE_CSS,
	COLOR_PICKER_CSS,
	FONT_SELECT_CSS,
	HEADING_SELECT_CSS,
	TABLE_CSS,
	FONT_SIZE_SELECT_CSS,
	CODE_BLOCK_CSS,
	REDUCED_MOTION_CSS,
].join('\n');

let cachedStyleSheet: CSSStyleSheet | null = null;

/** Returns the shared editor stylesheet. */
export function getEditorStyleSheet(): CSSStyleSheet {
	if (!cachedStyleSheet) {
		cachedStyleSheet = new CSSStyleSheet();
		cachedStyleSheet.replaceSync(EDITOR_CSS);
	}
	return cachedStyleSheet;
}
