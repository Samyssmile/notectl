/**
 * Editor styles using Adopted Stylesheets for Shadow DOM.
 *
 * All colors reference CSS custom properties set by the ThemeEngine.
 * The theme stylesheet is always injected first, providing all --notectl-* values.
 *
 * Only core styles (base + reduced-motion) live here.
 * Plugin-specific CSS is registered via `PluginContext.registerStyleSheet()`.
 */

import { BASE_CSS } from './styles/base.js';
import { PAPER_CSS } from './styles/paper.js';
import { REDUCED_MOTION_CSS } from './styles/reduced-motion.js';

/**
 * Combined CSS for the core editor shell.
 * Plugin styles are added separately via the plugin system.
 */
const EDITOR_CSS: string = [BASE_CSS, REDUCED_MOTION_CSS, PAPER_CSS].join('\n');

let cachedStyleSheet: CSSStyleSheet | null = null;

/** Returns the shared editor stylesheet. */
export function getEditorStyleSheet(): CSSStyleSheet {
	if (!cachedStyleSheet) {
		cachedStyleSheet = new CSSStyleSheet();
		cachedStyleSheet.replaceSync(EDITOR_CSS);
	}
	return cachedStyleSheet;
}
