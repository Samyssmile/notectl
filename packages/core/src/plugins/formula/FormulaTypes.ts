/**
 * Shared types, attribute registry augmentation, and configuration for the
 * formula plugin (inline + display math). Layer B (notectl glue).
 */

import type { FontDefinition } from '../font/FontPlugin.js';
import type { FormulaLocale } from './FormulaLocale.js';

/** Inline math node type name (atomic InlineNode, width 1, contenteditable=false). */
export const INLINE_MATH_TYPE = 'math_inline';

/** Display math node type name (selectable void block on its own line). */
export const DISPLAY_MATH_TYPE = 'math_display';

/**
 * Attributes stored on every formula node. The canonical `mathml` carries the
 * LaTeX source as a TeX annotation; `latex` duplicates it for cheap re-editing
 * and `alt` is the accessible fallback label (rendered as native `alttext`).
 */
export interface FormulaAttrs {
	readonly mathml: string;
	readonly latex: string;
	readonly alt: string;
	/** CSS font-size for the whole formula (e.g. `'24px'`); empty string inherits. */
	readonly fontSize: string;
}

// --- Attribute Registry Augmentation (typed, branded) ---

declare module '../../model/AttrRegistry.js' {
	interface InlineNodeAttrRegistry {
		math_inline: { mathml: string; latex: string; alt: string; fontSize: string };
	}
	interface NodeAttrRegistry {
		math_display: { mathml: string; latex: string; alt: string; fontSize: string };
	}
}

// --- Keyboard Bindings ---

export interface FormulaKeymap {
	/** Insert/open an inline formula. */
	readonly insertInline?: string | null;
	/** Insert/open a display (block) formula. */
	readonly insertDisplay?: string | null;
}

export const DEFAULT_FORMULA_KEYMAP: Readonly<Record<keyof FormulaKeymap, string>> = {
	insertInline: 'Mod-Shift-E',
	insertDisplay: 'Mod-Shift-M',
};

/** Preset px sizes offered by the formula editor's size control. */
export const DEFAULT_FORMULA_FONT_SIZES: readonly number[] = [12, 16, 20, 24, 32, 40, 48, 64, 96];

// --- Configuration ---

export interface FormulaPluginConfig {
	/** Live Markdown shortcuts: `$...$` (inline) and `$$...$$` (display) math. Default true. */
	readonly inputRule?: boolean;
	/** Locale override for user-facing strings. */
	readonly locale?: FormulaLocale;
	/** Keyboard shortcut overrides. */
	readonly keymap?: FormulaKeymap;
	/**
	 * Preset px sizes shown in the formula editor's size control. Pass an empty
	 * array to hide the control. Defaults to {@link DEFAULT_FORMULA_FONT_SIZES}.
	 */
	readonly fontSizes?: readonly number[];
	/**
	 * Optional OpenType MATH font, registered as `@font-face` for correct
	 * stretchy rendering in Chromium. Import `NOTECTL_MATH_FONT` from
	 * `@notectl/core/fonts`. Opt-in to keep the font payload out of the bundle.
	 */
	readonly mathFont?: FontDefinition;
}

export const DEFAULT_FORMULA_CONFIG: FormulaPluginConfig = {};
