/**
 * Resolution logic for the `markdown` editor config knob.
 *
 * The public `markdown` option controls notectl's *implicit* Markdown behavior:
 * the live "shorthand" typing transforms (`# ` -> heading, `**bold**` -> bold,
 * `- ` -> list, ...) and Markdown auto-detection on paste. It does NOT affect
 * the explicit `getContentMarkdown()` / `setContentMarkdown()` API, the toolbar
 * buttons, or keyboard shortcuts, which stay available regardless. Disabling it
 * removes the typed shorthand, not the underlying bold/heading capability.
 *
 * Boundary note: today every registered input rule is a Markdown shorthand, so
 * the global gate disables exactly the Markdown shorthands. A future
 * non-Markdown input rule (e.g. a typography plugin turning `...` into an
 * ellipsis) would also be caught by this switch; such a rule should ship its
 * own opt-out instead of relying on the `markdown` knob.
 */

/** Fine-grained form of the `markdown` config option. */
export interface MarkdownConfig {
	/**
	 * Live Markdown "shorthand" transforms while typing (`# ` -> heading,
	 * `**bold**` -> bold, `- ` -> list, `> ` -> quote, etc.). Default `true`.
	 */
	readonly shorthand?: boolean;
	/**
	 * Markdown auto-detection when pasting plain text. `auto` converts text with
	 * strong block-level Markdown signals (fenced code, GFM table, a run of
	 * list/heading/quote markers) into rich content; `never` always pastes raw.
	 * Default `'auto'`.
	 */
	readonly paste?: 'auto' | 'never';
}

/** Fully-resolved Markdown behavior consumed by the input and paste pipelines. */
export interface ResolvedMarkdownMode {
	readonly shorthand: boolean;
	readonly paste: 'auto' | 'never';
}

const ENABLED: ResolvedMarkdownMode = { shorthand: true, paste: 'auto' };
const DISABLED: ResolvedMarkdownMode = { shorthand: false, paste: 'never' };

/**
 * Resolves the `markdown` config union into concrete `{ shorthand, paste }` flags.
 *
 * - `undefined` / `true` -> both on (`shorthand: true`, `paste: 'auto'`).
 * - `false` -> both off (`shorthand: false`, `paste: 'never'`).
 * - object -> each axis resolved independently from its default (shorthand on,
 *   paste auto); only the keys you set are overridden.
 */
export function resolveMarkdownMode(
	value: boolean | MarkdownConfig | undefined,
): ResolvedMarkdownMode {
	if (value === undefined || value === true) return ENABLED;
	if (value === false) return DISABLED;
	return {
		shorthand: value.shorthand ?? true,
		paste: value.paste ?? 'auto',
	};
}
