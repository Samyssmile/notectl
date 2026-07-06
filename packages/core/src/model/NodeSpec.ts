/**
 * NodeSpec: defines how a block-node type behaves and renders to the DOM.
 */

import type { NodeAttrsFor } from './AttrRegistry.js';
import type { BlockNode } from './Document.js';
import type { ParseRule } from './ParseRule.js';
import type { SanitizeConfig } from './SanitizeConfig.js';

export interface AttrSpec {
	readonly default?: string | number | boolean;
}

/** Describes a wrapper element that groups consecutive blocks of the same kind. */
export interface WrapperSpec {
	/** The HTML tag for the wrapper element (e.g., 'ul', 'ol'). */
	readonly tag: string;
	/** A key to group consecutive blocks. Blocks with the same key share a wrapper. */
	readonly key: string;
	/** Optional CSS class for the wrapper element. */
	readonly className?: string;
	/** Optional attributes for the wrapper element. */
	readonly attrs?: Readonly<Record<string, string>>;
}

/** Describes which children a node type is allowed to contain. */
export interface ContentRule {
	/** Allowed child types or group names. */
	readonly allow: readonly string[];
	readonly min?: number;
	readonly max?: number;
}

/**
 * Context passed to `toHTML()` during serialization.
 * Provides mode-aware helpers so plugins produce inline styles or CSS classes
 * depending on the active `cssMode`.
 */
export interface HTMLExportContext {
	/**
	 * Returns an attribute fragment for the given CSS declarations.
	 * - Inline mode: `' style="color: red"'`
	 * - Class mode: `' class="notectl-s-a3f2k9"'`
	 * - Empty/falsy input: `''`
	 */
	readonly styleAttr: (declarations: string) => string;
}

/**
 * Context passed to the optional `toMarkdown()` spec hook during Markdown
 * serialization. The hook is for **leaf / self-contained** nodes (paragraph,
 * heading, code_block, image, marks, inline nodes); container/structural nodes
 * (blockquote, list, table) stay engine-owned because their children need
 * per-line prefixing/indentation that cannot be composed from a wrapper (D12).
 * Returning `null` (or omitting the hook) makes the engine fall back to the
 * spec's `toHTML` output as valid raw-HTML Markdown (D3).
 */
export interface MarkdownExportContext {
	/** Active dialect. */
	readonly flavor: 'commonmark' | 'gfm';
	/** Whether unrepresentable content may emit raw HTML (D3). */
	readonly htmlFallback: boolean;
}

export interface NodeSpec<T extends string = string> {
	readonly type: T;
	/** Renders the block to a DOM element. Must set `data-block-id` on the root. */
	toDOM(node: Omit<BlockNode, 'attrs'> & { readonly attrs: NodeAttrsFor<T> }): HTMLElement;
	readonly attrs?: Readonly<Record<string, AttrSpec>>;
	/** If true, the node contains no editable text (e.g. Image, HR). */
	readonly isVoid?: boolean;
	/** Content model: which children this node can contain. */
	readonly content?: ContentRule;
	/** Group membership: 'block' | 'inline' | custom. */
	readonly group?: string;
	/** If true, selection cannot cross this node's boundary (e.g. table_cell). */
	readonly isolating?: boolean;
	/** If true, node can be selected as an object via mouse interaction. */
	readonly selectable?: boolean;
	/**
	 * Mark types that are incompatible with this block type.
	 * When a block is converted to this type, marks listed here
	 * are stripped from the block's inline content.
	 */
	readonly excludeMarks?: readonly string[];
	/**
	 * Serializes the block to an HTML string. `content` is the pre-serialized inline children.
	 * The optional `ctx` provides mode-aware helpers (inline style vs. CSS class).
	 */
	readonly toHTML?: (node: BlockNode, content: string, ctx?: HTMLExportContext) => string;
	/**
	 * Serializes a **leaf/self-contained** block to a Markdown string. `content`
	 * is the pre-serialized inline children. Return `null` to defer to the
	 * engine's built-in mapping or the raw-HTML fallback (D4, D12). Container
	 * blocks must NOT implement this — they are engine-owned.
	 */
	readonly toMarkdown?: (
		node: BlockNode,
		content: string,
		ctx: MarkdownExportContext,
	) => string | null;
	/** Rules for matching HTML elements to this block type during parsing. */
	readonly parseHTML?: readonly ParseRule[];
	/** Tags and attributes this spec needs through DOMPurify sanitization. */
	readonly sanitize?: SanitizeConfig;
	/**
	 * If provided, the Reconciler groups consecutive blocks with the same
	 * wrapper key into a shared wrapper element. Useful for semantic list
	 * wrappers (`<ul>`, `<ol>`) around `<li>` block elements.
	 */
	wrapper?(node: Omit<BlockNode, 'attrs'> & { readonly attrs: NodeAttrsFor<T> }): WrapperSpec;
}
