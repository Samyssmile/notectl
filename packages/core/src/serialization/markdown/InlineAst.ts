/**
 * Inline AST node model + linked-list helpers shared by the inline parser.
 *
 * A doubly-linked list of nodes is used during parsing so the emphasis
 * delimiter-stack algorithm runs in linear time (no array splicing), which is
 * the ReDoS-safety guarantee for untrusted pasted Markdown (D1).
 */

/** Inline AST node kind. */
export type InlineKind =
	| 'text'
	| 'code'
	| 'softbreak'
	| 'hardbreak'
	| 'emph'
	| 'strong'
	| 'strike'
	| 'highlight'
	| 'sup'
	| 'sub'
	| 'link'
	| 'image'
	| 'inline_node'
	| 'html_inline';

/** A single inline AST node (mutable; linked into a sibling list). */
export interface InlineAstNode {
	type: InlineKind;
	/** Literal text for `text` / `code` / `html_inline`. */
	literal: string;
	/** Container children (`emph`, `strong`, `link`, …). */
	children: InlineAstNode[];
	/** Link/image destination + title. */
	href: string;
	title: string;
	/** Image alt text (plain). */
	alt: string;
	/** Generic inline-node passthrough (plugin extensions, e.g. math). */
	inlineType: string;
	attrs: Record<string, string | number | boolean>;
	prev: InlineAstNode | null;
	next: InlineAstNode | null;
}

/** Creates a fresh inline AST node of the given kind. */
export function makeNode(type: InlineKind, literal = ''): InlineAstNode {
	return {
		type,
		literal,
		children: [],
		href: '',
		title: '',
		alt: '',
		inlineType: '',
		attrs: {},
		prev: null,
		next: null,
	};
}

/** Appends `node` after `target` in the sibling linked list. */
export function insertAfter(target: InlineAstNode, node: InlineAstNode): void {
	node.prev = target;
	node.next = target.next;
	if (target.next) target.next.prev = node;
	target.next = node;
}

/** Removes `node` from its sibling linked list. */
export function unlink(node: InlineAstNode): void {
	if (node.prev) node.prev.next = node.next;
	if (node.next) node.next.prev = node.prev;
	node.prev = null;
	node.next = null;
}
