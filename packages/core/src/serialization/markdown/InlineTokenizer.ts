/**
 * Inline Markdown parser: turns a raw inline string into `(TextNode | InlineNode)[]`.
 *
 * Phase 2 ships a minimal implementation (backslash unescaping, entity decode,
 * soft-break collapsing) so block import is usable end-to-end. Phase 3 replaces
 * the body with a linear-time delimiter-stack tokenizer (emphasis, code, links,
 * autolinks, reference links/images, inline math) behind this same boundary, so
 * the block tokenizer and parser never change.
 */

import type { InlineNode, TextNode } from '../../model/Document.js';
import { createTextNode } from '../../model/Document.js';
import type { ParseContext } from './MarkdownParseContext.js';

/** Backslash escapes: a backslash before ASCII punctuation yields the literal char. */
const BACKSLASH_ESCAPE = /\\([!-/:-@[-`{-~])/g;

/** Decodes the small set of HTML entities the serializer can emit. */
function decodeEntities(text: string): string {
	return text
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&');
}

/**
 * Parses inline Markdown into text/inline nodes.
 *
 * Phase 2: collapses soft breaks to spaces, applies backslash escapes and entity
 * decoding, and returns a single text node.
 */
export function parseInline(text: string, _ctx: ParseContext): (TextNode | InlineNode)[] {
	const collapsed: string = text.replace(/\n/g, ' ');
	const unescaped: string = decodeEntities(collapsed.replace(BACKSLASH_ESCAPE, '$1'));
	return [createTextNode(unescaped)];
}
