/**
 * MarkdownSerializer: converts an immutable Document into a Markdown string.
 *
 * Mirrors `DocumentSerializer.ts` (HTML) but is reached **only** via dynamic
 * `import()` from the async web-component method and the paste branch, so the
 * bundler genuinely code-splits the engine out of the core chunk (D13). Pure
 * functions — operate on Document/SchemaRegistry, no class state.
 */

import type { Document } from '../model/Document.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { buildMarkOrder } from './MarkSerializer.js';
import type { MarkdownSerializeOptions } from './MarkdownTypes.js';
import { serializeBlocks } from './markdown/BlockSerializers.js';
import { type SerContext, resolveSerializeOptions } from './markdown/MarkdownContext.js';

/**
 * Serializes a document to a Markdown string.
 *
 * Standard CommonMark/GFM constructs are emitted by the engine's built-in
 * by-type mappings; unrepresentable nodes/marks emit raw HTML (valid Markdown)
 * when `htmlFallback` is on (default), or degrade gracefully when off (D3).
 */
export function serializeDocumentToMarkdown(
	doc: Document,
	registry?: SchemaRegistry,
	options?: MarkdownSerializeOptions,
): string {
	const ctx: SerContext = {
		registry,
		opts: resolveSerializeOptions(options),
		markOrder: registry ? buildMarkOrder(registry) : undefined,
	};
	const body: string = serializeBlocks(doc.children, ctx);
	return finalizeDocument(body);
}

/**
 * Closes the assembled document with a single trailing newline, dropping any
 * leading/trailing blank lines. It intentionally does NOT touch the interior:
 * each block serializer is responsible for emitting clean lines, and
 * `serializeBlocks` already joins blocks with exactly one blank line. Trimming
 * only the document boundaries is provably code-safe, since a document never
 * begins or ends inside a code body (blocks open and close on their own
 * delimiters), so significant blank lines and trailing spaces inside a
 * `code_block` survive verbatim at any nesting depth.
 */
function finalizeDocument(markdown: string): string {
	const trimmed: string = markdown.trim();
	return trimmed.length > 0 ? `${trimmed}\n` : '';
}
