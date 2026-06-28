/**
 * Block-level Markdown tokenizer.
 *
 * A line scanner that turns Markdown source into a flat (recursive for
 * blockquotes) list of block tokens. The grammar is centralized here, by
 * necessity: CommonMark block structure is global and context-sensitive and
 * cannot be decomposed into per-spec rules (D4). `MarkdownParser` maps these
 * tokens to schema node types by name.
 *
 * Scope notes (Phase 2): list items use the editor's flat-with-indent model
 * (one line per item, indent = floor(leadingSpaces / 2), matching the
 * serializer); multi-block list items degrade to following blocks (D9). Lazy
 * blockquote continuation and indented code blocks are not yet recognized
 * (fenced code is). GFM tables and `$$` math arrive in Phase 3.
 */

import type { MarkdownSyntaxExtension } from '../../model/MarkdownSyntaxRegistry.js';
import { type ColumnAlign, type TableData, matchTable } from './GfmTableParser.js';

/** A parsed block-level token. Inline text is left raw for the inline parser. */
export type BlockToken =
	| { readonly type: 'heading'; readonly level: number; readonly text: string }
	| { readonly type: 'paragraph'; readonly text: string }
	| { readonly type: 'code_block'; readonly language: string; readonly code: string }
	| { readonly type: 'hr' }
	| { readonly type: 'blockquote'; readonly children: readonly BlockToken[] }
	| {
			readonly type: 'list_item';
			readonly listType: 'bullet' | 'ordered' | 'checklist';
			readonly indent: number;
			readonly checked: boolean;
			readonly text: string;
	  }
	| { readonly type: 'html'; readonly html: string }
	| {
			readonly type: 'table';
			readonly aligns: readonly ColumnAlign[];
			readonly header: readonly string[];
			readonly rows: readonly (readonly string[])[];
	  }
	| {
			readonly type: 'extension_block';
			readonly nodeType: string;
			readonly attrs: Record<string, string | number | boolean>;
	  };

/** Block-level HTML tags that begin an HTML block; inline tags fall through to paragraphs. */
const BLOCK_HTML_TAGS: ReadonlySet<string> = new Set([
	'address',
	'article',
	'aside',
	'blockquote',
	'details',
	'div',
	'dl',
	'dd',
	'dt',
	'figure',
	'figcaption',
	'footer',
	'form',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'header',
	'hr',
	'iframe',
	'main',
	'nav',
	'ol',
	'p',
	'pre',
	'section',
	'table',
	'tbody',
	'td',
	'tfoot',
	'th',
	'thead',
	'tr',
	'ul',
	'video',
]);

// Exported so the parser's link-reference pre-pass can reuse the exact grammar
// when deciding block boundaries (single source of truth for the syntax).
export const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
export const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})[ \t]*(.*)$/;
export const THEMATIC_BREAK = /^ {0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/;
const BLOCKQUOTE = /^ {0,3}>[ ]?/;
const BULLET_ITEM = /^( *)([-*+])([ \t]+)(.*)$/;
const ORDERED_ITEM = /^( *)(\d{1,9})([.)])([ \t]+)(.*)$/;
const TASK_PREFIX = /^\[([ xX])\][ \t]+(.*)$/;
const SETEXT_H1 = /^ {0,3}=+[ \t]*$/;
const SETEXT_H2 = /^ {0,3}-+[ \t]*$/;
const HTML_BLOCK_START = /^ {0,3}<(\/?)([a-zA-Z][a-zA-Z0-9-]*)|^ {0,3}<!--/;

const SPACES_PER_INDENT = 2;

/**
 * Maximum blockquote nesting before `>` prefixes are treated as literal text.
 * Each level recurses (`tokenizeLines` → `consumeBlockquote` → `tokenizeLines`),
 * so an adversarial paste of thousands of `>` would overflow the stack. The cap
 * keeps recursion bounded; deeper content degrades to a paragraph (no data loss,
 * the `>` characters are preserved). Real documents never nest this deep.
 */
const MAX_BLOCKQUOTE_DEPTH = 32;

function isBlank(line: string): boolean {
	return line.trim() === '';
}

/** Tokenizes a full Markdown source string into block tokens. */
export function tokenizeBlocks(
	source: string,
	gfm = true,
	extensions: readonly MarkdownSyntaxExtension[] = [],
): BlockToken[] {
	const lines: string[] = source.replace(/\r\n?/g, '\n').split('\n');
	return tokenizeLines(lines, gfm, extensions);
}

function tokenizeLines(
	lines: readonly string[],
	gfm: boolean,
	extensions: readonly MarkdownSyntaxExtension[],
	depth = 0,
): BlockToken[] {
	const tokens: BlockToken[] = [];
	let i = 0;

	while (i < lines.length) {
		const line: string = lines[i] ?? '';

		if (isBlank(line)) {
			i++;
			continue;
		}

		const extension: number = tryExtensionBlock(extensions, lines, i, tokens);
		if (extension > 0) {
			i += extension;
			continue;
		}

		if (gfm) {
			const table: TableData | null = matchTable(lines, i);
			if (table) {
				tokens.push({
					type: 'table',
					aligns: table.aligns,
					header: table.header,
					rows: table.rows,
				});
				i += table.linesConsumed;
				continue;
			}
		}

		const fence: RegExpMatchArray | null = line.match(FENCE_OPEN);
		if (fence) {
			i = consumeFencedCode(lines, i, fence, tokens);
			continue;
		}

		const atx: RegExpMatchArray | null = line.match(ATX_HEADING);
		if (atx) {
			tokens.push({ type: 'heading', level: (atx[1] ?? '#').length, text: (atx[2] ?? '').trim() });
			i++;
			continue;
		}

		if (THEMATIC_BREAK.test(line)) {
			tokens.push({ type: 'hr' });
			i++;
			continue;
		}

		if (BLOCKQUOTE.test(line)) {
			// Depth guard: past the cap, stop recursing and keep the `>` lines as
			// literal paragraph text rather than overflowing the stack.
			if (depth >= MAX_BLOCKQUOTE_DEPTH) {
				i = consumeParagraph(lines, i, tokens);
				continue;
			}
			i = consumeBlockquote(lines, i, tokens, gfm, extensions, depth);
			continue;
		}

		const item: BlockToken | null = matchListItem(line);
		if (item) {
			tokens.push(item);
			i++;
			continue;
		}

		if (isHtmlBlockStart(line)) {
			i = consumeHtmlBlock(lines, i, tokens);
			continue;
		}

		i = consumeParagraph(lines, i, tokens);
	}

	return tokens;
}

/** Consumes a fenced code block; returns the next line index. */
function consumeFencedCode(
	lines: readonly string[],
	start: number,
	fence: RegExpMatchArray,
	tokens: BlockToken[],
): number {
	const fenceStr: string = fence[1] ?? '```';
	const fenceChar: string = fenceStr[0] ?? '`';
	const language: string = (fence[2] ?? '').trim().split(/\s+/)[0] ?? '';
	const closeRe = new RegExp(`^ {0,3}${`\\${fenceChar}`}{${fenceStr.length},}[ \\t]*$`);

	const body: string[] = [];
	let i: number = start + 1;
	while (i < lines.length) {
		const line: string = lines[i] ?? '';
		if (closeRe.test(line)) {
			i++;
			break;
		}
		body.push(line);
		i++;
	}
	tokens.push({ type: 'code_block', language, code: body.join('\n') });
	return i;
}

/** Tries each extension's `matchBlock`; pushes a token and returns lines consumed (0 = no match). */
function tryExtensionBlock(
	extensions: readonly MarkdownSyntaxExtension[],
	lines: readonly string[],
	lineIndex: number,
	tokens: BlockToken[],
): number {
	for (const ext of extensions) {
		const match = ext.matchBlock?.(lines, lineIndex);
		if (match && match.linesConsumed > 0) {
			tokens.push({ type: 'extension_block', nodeType: match.type, attrs: match.attrs });
			return match.linesConsumed;
		}
	}
	return 0;
}

/** Consumes consecutive `>`-prefixed lines and recurses into their content. */
function consumeBlockquote(
	lines: readonly string[],
	start: number,
	tokens: BlockToken[],
	gfm: boolean,
	extensions: readonly MarkdownSyntaxExtension[],
	depth: number,
): number {
	const inner: string[] = [];
	let i: number = start;
	while (i < lines.length) {
		const line: string = lines[i] ?? '';
		if (!BLOCKQUOTE.test(line)) break;
		inner.push(line.replace(BLOCKQUOTE, ''));
		i++;
	}
	tokens.push({ type: 'blockquote', children: tokenizeLines(inner, gfm, extensions, depth + 1) });
	return i;
}

/** Parses a single list-item line, or null if the line is not a list item. */
function matchListItem(line: string): BlockToken | null {
	const bullet: RegExpMatchArray | null = line.match(BULLET_ITEM);
	const ordered: RegExpMatchArray | null = bullet ? null : line.match(ORDERED_ITEM);
	const match: RegExpMatchArray | null = bullet ?? ordered;
	if (!match) return null;

	const leading: string = match[1] ?? '';
	const indent: number = Math.floor(leading.length / SPACES_PER_INDENT);
	const rawContent: string = (bullet ? match[4] : match[5]) ?? '';

	const task: RegExpMatchArray | null = rawContent.match(TASK_PREFIX);
	if (task) {
		return {
			type: 'list_item',
			listType: 'checklist',
			indent,
			checked: (task[1] ?? ' ').toLowerCase() === 'x',
			text: task[2] ?? '',
		};
	}
	return {
		type: 'list_item',
		listType: ordered ? 'ordered' : 'bullet',
		indent,
		checked: false,
		text: rawContent,
	};
}

/** Whether a line begins a block-level HTML element (inline tags fall through). */
function isHtmlBlockStart(line: string): boolean {
	const match: RegExpMatchArray | null = line.match(HTML_BLOCK_START);
	if (!match) return false;
	if (line.trimStart().startsWith('<!--')) return true;
	const tag: string = (match[2] ?? '').toLowerCase();
	return BLOCK_HTML_TAGS.has(tag);
}

/** Consumes an HTML block up to the next blank line. */
function consumeHtmlBlock(lines: readonly string[], start: number, tokens: BlockToken[]): number {
	const html: string[] = [];
	let i: number = start;
	while (i < lines.length) {
		const line: string = lines[i] ?? '';
		if (isBlank(line)) break;
		html.push(line);
		i++;
	}
	tokens.push({ type: 'html', html: html.join('\n') });
	return i;
}

/** Whether a line would interrupt an open paragraph (begins another block). */
function interruptsParagraph(line: string): boolean {
	if (isBlank(line)) return true;
	if (ATX_HEADING.test(line)) return true;
	if (FENCE_OPEN.test(line)) return true;
	if (THEMATIC_BREAK.test(line)) return true;
	if (BLOCKQUOTE.test(line)) return true;
	if (matchListItem(line)) return true;
	if (isHtmlBlockStart(line)) return true;
	return false;
}

/** Consumes a paragraph (with lazy continuation) or a setext heading. */
function consumeParagraph(lines: readonly string[], start: number, tokens: BlockToken[]): number {
	const collected: string[] = [lines[start] ?? ''];
	let i: number = start + 1;

	while (i < lines.length) {
		const line: string = lines[i] ?? '';

		// A setext underline turns the collected paragraph into a heading.
		if (SETEXT_H1.test(line)) {
			tokens.push({ type: 'heading', level: 1, text: joinParagraph(collected) });
			return i + 1;
		}
		// A `-` underline outranks a thematic break when a paragraph sits above it.
		if (SETEXT_H2.test(line)) {
			tokens.push({ type: 'heading', level: 2, text: joinParagraph(collected) });
			return i + 1;
		}

		if (interruptsParagraph(line)) break;
		collected.push(line);
		i++;
	}

	tokens.push({ type: 'paragraph', text: collected.map((l) => l.trim()).join('\n') });
	return i;
}

/** Joins multi-line paragraph text into a single-line heading string. */
function joinParagraph(lines: readonly string[]): string {
	return lines
		.map((l) => l.trim())
		.join(' ')
		.trim();
}
