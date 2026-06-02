/**
 * Types for class-based CSS serialization of document HTML.
 */

/** Controls whether exported HTML uses inline `style` attributes or CSS class names. */
export type CSSMode = 'inline' | 'classes';

/** Low-level options shared by the document serializers. */
export interface SerializeOptions {
	/**
	 * Whether to emit the `data-block-id` attribute on each block element.
	 * Defaults to `true`.
	 *
	 * The attribute is notectl's wire format: it lets
	 * `setContentHTML(getContentHTML())` preserve block identity so the caret
	 * survives content round-trips driven by external sync (Angular signal
	 * forms, RxJS pipes — see ARCHITECTURE §9.2).
	 *
	 * Set to `false` for clean export HTML (database storage, server-side
	 * tag/attribute validation, handoff to another system), where the
	 * editor-internal id would be an abstraction leak. Round-trips then
	 * generate fresh ids and no longer preserve the caret.
	 */
	readonly includeBlockIds?: boolean;
}

/** Options for {@link NotectlEditor.getContentHTML}. */
export interface ContentHTMLOptions extends SerializeOptions {
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
