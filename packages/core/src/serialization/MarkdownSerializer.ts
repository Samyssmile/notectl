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
	return normalizeOutput(body);
}

/** Trims trailing whitespace per line and collapses to a single trailing newline. */
function normalizeOutput(markdown: string): string {
	const trimmed: string = markdown
		.split('\n')
		.map((line) => line.replace(/[ \t]+$/, ''))
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	return trimmed.length > 0 ? `${trimmed}\n` : '';
}
