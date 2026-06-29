/**
 * Configuration types for the NotectlEditor Web Component.
 *
 * Extracted to break circular imports between NotectlEditor,
 * EditorConfigController, and PluginBootstrapper.
 */

import type { Locale } from '../i18n/Locale.js';
import type { PaperSize } from '../model/PaperSize.js';
import type { Logger } from '../plugins/Logger.js';
import type { Plugin } from '../plugins/Plugin.js';
import type { TextFormattingConfig } from '../plugins/text-formatting/TextFormattingPlugin.js';
import type { ToolbarOverflowBehavior } from '../plugins/toolbar/ToolbarOverflowBehavior.js';
import type { MarkdownConfig } from './MarkdownMode.js';
import type { Theme, ThemePreset } from './theme/ThemeTokens.js';

/**
 * A single toolbar group in the editor-level config. Accepts either:
 *  - A `ReadonlyArray<Plugin>` (backwards-compatible tuple form), or
 *  - An object with `plugins` and an optional accessible `label`. When `label` is set,
 *    the group's wrapper element receives `role="group"` and `aria-label`, so assistive
 *    technology can announce the cluster by name.
 */
export type ToolbarGroupInput =
	| ReadonlyArray<Plugin>
	| {
			readonly plugins: ReadonlyArray<Plugin>;
			readonly label?: string;
	  };

/**
 * Expanded toolbar configuration for `createEditor`.
 * Allows specifying both the plugin layout and overflow behavior.
 */
export interface ToolbarConfig {
	/**
	 * Plugin groups defining toolbar layout. Each entry is a visual group;
	 * separators are rendered between groups. Order = array order.
	 * Use the object form `{ plugins, label }` to attach an accessible label.
	 */
	readonly groups: ReadonlyArray<ToolbarGroupInput>;
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
	/**
	 * Controls notectl's *implicit* Markdown behavior: the live "shorthand"
	 * typing transforms (`# ` -> heading, `**bold**` -> bold, `- ` -> list, ...)
	 * and Markdown auto-detection on paste.
	 *
	 * - `true` (default): shorthand typing and paste auto-detect are both on.
	 * - `false`: typed and pasted Markdown stays literal text.
	 * - object: control each axis independently, e.g. `{ shorthand: false }`
	 *   keeps literal typing while still auto-detecting pasted Markdown.
	 *
	 * This does NOT affect the explicit `getContentMarkdown()` /
	 * `setContentMarkdown()` API, the toolbar, or keyboard shortcuts (`Mod-B`):
	 * `markdown: false` removes the typed shorthand, not the bold/heading
	 * capability itself.
	 */
	markdown?: boolean | MarkdownConfig;
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
	/**
	 * Sink for editor runtime errors. Defaults to a console-backed logger.
	 * Supply `silentLogger` or a custom adapter to route errors into your
	 * own telemetry pipeline instead of the browser console.
	 */
	logger?: Logger;
}
