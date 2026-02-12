/**
 * InlineNodeSpec: defines how an inline node type renders to the DOM.
 * Registered by plugins via PluginContext.registerInlineNodeSpec().
 */

import type { InlineNode } from './Document.js';
import type { AttrSpec } from './NodeSpec.js';

export interface InlineNodeSpec<T extends string = string> {
	readonly type: T;
	/** Renders the InlineNode as a DOM element (should set contentEditable="false"). */
	toDOM(node: InlineNode): HTMLElement;
	/** Allowed attributes with defaults. */
	readonly attrs?: Readonly<Record<string, AttrSpec>>;
	/** Group membership (default: 'inline'). For content rules. */
	readonly group?: string;
}
