/**
 * Types for class-based CSS serialization of document HTML.
 */

/** Controls whether exported HTML uses inline `style` attributes or CSS class names. */
export type CSSMode = 'inline' | 'classes';

/** Options for {@link NotectlEditor.getContentHTML}. */
export interface ContentHTMLOptions {
	readonly pretty?: boolean;
	readonly cssMode?: CSSMode;
}

/** Result of class-based HTML serialization (`cssMode: 'classes'`). */
export interface ContentCSSResult {
	readonly html: string;
	readonly css: string;
	/**
	 * Maps each generated class name to its CSS declarations.
	 * Pass to `setContentHTML(html, { styleMap })` for round-trip re-import.
	 */
	readonly styleMap: ReadonlyMap<string, string>;
}

/** Options for {@link NotectlEditor.setContentHTML} when importing class-based HTML. */
export interface SetContentHTMLOptions {
	/**
	 * Style map from a previous `getContentHTML({ cssMode: 'classes' })` call.
	 * Used to rehydrate class-based HTML back into styled content.
	 */
	readonly styleMap?: ReadonlyMap<string, string>;
}
