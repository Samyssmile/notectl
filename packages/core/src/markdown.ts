/**
 * Markdown serialization and parsing entry point.
 *
 * Import from `@notectl/core/markdown` to access the Markdown serializer and
 * parser as a standalone, code-split chunk. The editor's `getContentMarkdown` /
 * `setContentMarkdown` reach this engine only via dynamic `import()`, so it
 * never lands in the core bundle (D13).
 *
 * @example
 * ```ts
 * import { serializeDocumentToMarkdown } from '@notectl/core/markdown';
 * ```
 */

export type {
	MarkdownFlavor,
	HeadingStyle,
	BulletMarker,
	EmphasisMarker,
	CodeFence,
	MarkdownSerializeOptions,
	MarkdownParseOptions,
	MarkdownSyntaxExtension,
} from './serialization/MarkdownTypes.js';

export { serializeDocumentToMarkdown } from './serialization/MarkdownSerializer.js';
