/**
 * Configuration types for the NotectlEditor Web Component.
 *
 * Extracted to break circular imports between NotectlEditor,
 * EditorConfigController, and PluginBootstrapper.
 */

import type { Locale } from '../i18n/Locale.js';
import type { PaperSize } from '../model/PaperSize.js';
import type { Plugin } from '../plugins/Plugin.js';
import type { TextFormattingConfig } from '../plugins/text-formatting/TextFormattingPlugin.js';
import type { ToolbarOverflowBehavior } from '../plugins/toolbar/ToolbarOverflowBehavior.js';
import type { Theme, ThemePreset } from './theme/ThemeTokens.js';

/**
 * Expanded toolbar configuration for `createEditor`.
 * Allows specifying both the plugin layout and overflow behavior.
 */
export interface ToolbarConfig {
	/**
	 * Plugin groups defining toolbar layout. Each inner array is a visual group;
	 * separators are rendered between groups. Order = array order.
	 */
	readonly groups: ReadonlyArray<ReadonlyArray<Plugin>>;
	/**
	 * Controls responsive overflow behavior when items exceed available width.
	 * Defaults to `ToolbarOverflowBehavior.BurgerMenu`.
	 */
	readonly overflow?: ToolbarOverflowBehavior;
}

export interface NotectlEditorConfig {
	/** Controls which inline marks are enabled. Used to auto-configure TextFormattingPlugin. */
	features?: Partial<TextFormattingConfig>;
	plugins?: readonly Plugin[];
	/**
	 * Toolbar configuration. Accepts either:
	 * - A shorthand array of plugin groups: `[[BoldPlugin, ItalicPlugin], [HeadingPlugin]]`
	 * - A full config object: `{ groups: [...], overflow: ToolbarOverflowBehavior.Flow }`
	 *
	 * When set, a ToolbarPlugin is created internally — do not add one to `plugins`.
	 */
	toolbar?: ReadonlyArray<ReadonlyArray<Plugin>> | ToolbarConfig;
	placeholder?: string;
	readonly?: boolean;
	autofocus?: boolean;
	maxHistoryDepth?: number;
	/** Theme preset or custom Theme object. Defaults to ThemePreset.Light. */
	theme?: ThemePreset | Theme;
	/** Optional nonce for fallback runtime `<style>` elements when strict mode cannot use adopted sheets. */
	styleNonce?: string;
	/** Paper size for WYSIWYG page layout. When set, content renders at exact paper width. */
	paperSize?: PaperSize;
	/** Document-level text direction. When set, applies `dir` on the content element. */
	dir?: 'ltr' | 'rtl';
	/** Editor locale. Defaults to Locale.BROWSER (auto-detect from navigator.language). */
	locale?: Locale;
}
