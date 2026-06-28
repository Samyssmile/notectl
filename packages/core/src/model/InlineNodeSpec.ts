/**
 * InlineNodeSpec: defines how an inline node type renders to the DOM.
 * Registered by plugins via PluginContext.registerInlineNodeSpec().
 */

import type { InlineNode } from './Document.js';
import type { AttrSpec, MarkdownExportContext } from './NodeSpec.js';
import type { ParseRule } from './ParseRule.js';
import type { SanitizeConfig } from './SanitizeConfig.js';

export interface InlineNodeSpec<T extends string = string> {
	readonly type: T;
	/** Renders the InlineNode as a DOM element (should set contentEditable="false"). */
	toDOM(node: InlineNode): HTMLElement;
	/** Allowed attributes with defaults. */
	readonly attrs?: Readonly<Record<string, AttrSpec>>;
	/** Group membership (default: 'inline'). For content rules. */
	readonly group?: string;
	/** Serializes the inline node to an HTML string. */
	readonly toHTMLString?: (node: InlineNode) => string;
	/**
	 * Serializes the inline node to Markdown. Return `null` to defer to the
	 * raw-HTML fallback (D4). Used by self-contained inline nodes (e.g. inline
	 * math via the formula plugin).
	 */
	readonly toMarkdown?: (node: InlineNode, ctx: MarkdownExportContext) => string | null;
	/** Rules for matching HTML elements to this inline node type during parsing. */
	readonly parseHTML?: readonly ParseRule[];
	/** Tags and attributes this spec needs through DOMPurify sanitization. */
	readonly sanitize?: SanitizeConfig;
}
