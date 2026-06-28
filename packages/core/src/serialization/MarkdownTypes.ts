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

/**
 * A plugin-contributed Markdown grammar extension (D4). Registered via
 * `PluginContext.registerMarkdownSyntax(...)` and threaded into the parser
 * through {@link MarkdownParseOptions.syntaxExtensions}, so the core grammar
 * never hard-codes plugin syntax such as `$...$` (formula).
 */
export interface MarkdownSyntaxExtension {
	/** Stable id for the contributing plugin (e.g. `formula`). */
	readonly id: string;
	/**
	 * Matches a plugin inline construct starting at `index` in `text`. Returns the
	 * produced inline-node descriptor plus the number of characters consumed, or
	 * `null` if no match. Must be linear-time (no backtracking regex).
	 */
	readonly matchInline?: (
		text: string,
		index: number,
	) => {
		readonly type: string;
		readonly attrs: Record<string, string | number | boolean>;
		readonly length: number;
	} | null;
	/**
	 * Matches a plugin block construct given the full source lines and the current
	 * line index. Returns the produced block descriptor plus the number of lines
	 * consumed, or `null` if no match.
	 */
	readonly matchBlock?: (
		lines: readonly string[],
		lineIndex: number,
	) => {
		readonly type: string;
		readonly attrs: Record<string, string | number | boolean>;
		readonly linesConsumed: number;
	} | null;
}

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
