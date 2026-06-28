/**
 * Option types for the Markdown serialization layer.
 *
 * Mirrors `ContentHTMLTypes.ts` for the HTML engine. These types are pure data
 * (no engine code), so importing them never pulls the Markdown engine into a
 * bundle — the engine itself is reached only via dynamic `import()` (D13).
 */

import type { Document } from '../model/Document.js';

/** Markdown dialect. `gfm` adds tables, task lists, strikethrough and autolinks. */
export type MarkdownFlavor = 'commonmark' | 'gfm';

/** ATX (`# h`) vs. setext (`h\n===`) heading style on export. */
export type HeadingStyle = 'atx' | 'setext';

/** Bullet marker used for unordered list items on export. */
export type BulletMarker = '-' | '*' | '+';

/** Emphasis delimiter used for italic on export. */
export type EmphasisMarker = '*' | '_';

/** Fence used for fenced code blocks on export. */
export type CodeFence = '```' | '~~~';

/** Options for {@link serializeDocumentToMarkdown} / {@link NotectlEditor.getContentMarkdown}. */
export interface MarkdownSerializeOptions {
	/** Dialect to emit. Default `gfm`. */
	readonly flavor?: MarkdownFlavor;
	/**
	 * When `true` (default), nodes/marks with no portable Markdown representation
	 * (underline, highlight, color, video, …) serialize as raw HTML so the
	 * round-trip stays lossless (D3). When `false`, styling-only features degrade
	 * gracefully (text kept, styling dropped) for clean portable Markdown.
	 */
	readonly htmlFallback?: boolean;
	/** Heading style. Default `atx`. */
	readonly headingStyle?: HeadingStyle;
	/** Bullet marker for unordered lists. Default `-`. */
	readonly bullet?: BulletMarker;
	/** Emphasis delimiter for italic. Default `*`. */
	readonly emphasis?: EmphasisMarker;
	/** Fenced code block fence. Default ` ``` `. */
	readonly codeFence?: CodeFence;
	/** Spaces per indent level for nested lists. Default `2`. */
	readonly listIndent?: number;
}

/** Re-exported from `model/` so the extension type sits at the dependency floor (D4). */
export type { MarkdownSyntaxExtension } from '../model/MarkdownSyntaxRegistry.js';
import type { MarkdownSyntaxExtension } from '../model/MarkdownSyntaxRegistry.js';

/** Options for {@link parseMarkdownToDocument} / {@link NotectlEditor.setContentMarkdown}. */
export interface MarkdownParseOptions {
	/** Dialect to accept. Default `gfm`. */
	readonly flavor?: MarkdownFlavor;
	/**
	 * Import-only Obsidian/Pandoc extensions (`==highlight==`, `^sup^`, `~sub~`).
	 * Default `false` — single `~` collides with `~~` strikethrough and these are
	 * not portable on output (D2).
	 */
	readonly extendedInlineSyntax?: boolean;
	/**
	 * When `true` (default), raw HTML embedded in the Markdown is parsed back via
	 * the HTML parser so superset features survive the round-trip (D3).
	 */
	readonly htmlFallback?: boolean;
	/** Plugin-contributed grammar extensions (formula `$...$`, etc.). */
	readonly syntaxExtensions?: readonly MarkdownSyntaxExtension[];
}

/** Document → Markdown serializer signature (for typing the lazy import). */
export type SerializeDocumentToMarkdown = (
	doc: Document,
	registry?: import('../model/SchemaRegistry.js').SchemaRegistry,
	options?: MarkdownSerializeOptions,
) => string;

/** Markdown → Document parser signature (for typing the lazy import). */
export type ParseMarkdownToDocument = (
	markdown: string,
	registry?: import('../model/SchemaRegistry.js').SchemaRegistry,
	options?: MarkdownParseOptions,
) => Document;
