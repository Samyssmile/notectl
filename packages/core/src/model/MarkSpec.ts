/**
 * MarkSpec: defines how an inline mark type renders to the DOM.
 */

import type { MarkAttrsFor } from './AttrRegistry.js';
import type { Mark } from './Document.js';
import type { AttrSpec } from './NodeSpec.js';
import type { ParseRule } from './ParseRule.js';
import type { SanitizeConfig } from './SanitizeConfig.js';

export interface MarkSpec<T extends string = string> {
	readonly type: T;
	/** Wraps text content in a DOM element for this mark. */
	toDOM(mark: Omit<Mark, 'attrs'> & { readonly attrs: MarkAttrsFor<T> }): HTMLElement;
	/** Nesting priority — lower rank renders closer to the text content. */
	readonly rank?: number;
	readonly attrs?: Readonly<Record<string, AttrSpec>>;
	/** Serializes the mark as an HTML wrapper. `content` is the pre-serialized inner HTML. */
	readonly toHTMLString?: (mark: Mark, content: string) => string;
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
