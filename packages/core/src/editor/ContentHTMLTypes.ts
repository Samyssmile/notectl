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
}
