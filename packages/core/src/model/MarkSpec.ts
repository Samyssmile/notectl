/**
 * MarkSpec: defines how an inline mark type renders to the DOM.
 */

import type { MarkAttrsFor } from './AttrRegistry.js';
import type { Mark } from './Document.js';
import type { AttrSpec, HTMLExportContext, MarkdownExportContext } from './NodeSpec.js';
import type { ParseRule } from './ParseRule.js';
import type { SanitizeConfig } from './SanitizeConfig.js';

export interface MarkSpec<T extends string = string> {
	readonly type: T;
	/** Wraps text content in a DOM element for this mark. */
	toDOM(mark: Omit<Mark, 'attrs'> & { readonly attrs: MarkAttrsFor<T> }): HTMLElement;
	/** Nesting priority — lower rank renders closer to the text content. */
	readonly rank?: number;
	/**
	 * Whether the mark extends onto text typed at its right boundary.
	 * Defaults to `true` (e.g. bold continues as you type). Set `false` for
	 * marks that must not bleed onto following text, such as links.
	 */
	readonly inclusive?: boolean;
	readonly attrs?: Readonly<Record<string, AttrSpec>>;
	/** Serializes the mark as an HTML wrapper. `content` is the pre-serialized inner HTML. */
	readonly toHTMLString?: (mark: Mark, content: string, ctx?: HTMLExportContext) => string;
	/**
	 * Serializes the mark to Markdown. `content` is the pre-serialized inner
	 * Markdown. Return `null` to defer to the engine's built-in mapping or the
	 * raw-HTML fallback (D4).
	 */
	readonly toMarkdown?: (mark: Mark, content: string, ctx: MarkdownExportContext) => string | null;
	/**
	 * Returns a CSS style declaration for this mark (e.g. `"color: red"`).
	 * When defined, the serializer merges all `toHTMLStyle` results into a single
	 * `<span style="...">` instead of nesting separate wrappers per mark.
	 */
	readonly toHTMLStyle?: (mark: Mark) => string | null;
	/** Rules for matching HTML elements to this mark type during parsing. */
	readonly parseHTML?: readonly ParseRule[];
	/** Tags and attributes this spec needs through DOMPurify sanitization. */
	readonly sanitize?: SanitizeConfig;
}
