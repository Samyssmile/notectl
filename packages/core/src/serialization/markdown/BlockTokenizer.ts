/**
 * Block-level Markdown tokenizer.
 *
 * A line scanner that turns Markdown source into a flat (recursive for
 * blockquotes) list of block tokens. The grammar is centralized here, by
 * necessity: CommonMark block structure is global and context-sensitive and
 * cannot be decomposed into per-spec rules (D4). `MarkdownParser` maps these
 * tokens to schema node types by name.
 *
 * Scope notes: list items use the editor's flat-with-indent model (indent =
 * floor(leadingColumns / 2), matching the serializer); multi-block list items
 * degrade to following blocks (D9), while plain lazy continuation lines fold
 * into the item's text. Blockquotes support lazy paragraph continuation.
 * Indented (4-space / tab) code blocks are recognized (#195), except directly
 * after a list item plus blank line, where CommonMark reads them as list
 * continuation content and the flat model degrades to a paragraph (D9).
 */

import type { MarkdownSyntaxExtension } from '../../model/MarkdownSyntaxRegistry.js';
import { type ColumnAlign, type TableData, matchTable } from './GfmTableParser.js';
import { decodeEscapesAndEntities } from './MarkdownEntities.js';

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
const BULLET_ITEM = /^([ \t]*)([-*+])(?:([ \t]+)(.*))?$/;
const ORDERED_ITEM = /^([ \t]*)(\d{1,9})([.)])(?:([ \t]+)(.*))?$/;
const TASK_PREFIX = /^\[([ xX])\][ \t]+(.*)$/;
/** Item content that is itself a list marker (`- - foo` chains nested items). */
const LIST_MARKER_START = /^(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;
// Exported alongside the other grammar patterns so the serializer's line-start
// escaping re-parses paragraph lines with the exact same rules (single source of
// truth: a line the tokenizer would read as a setext underline gets escaped).
export const SETEXT_H1 = /^ {0,3}=+[ \t]*$/;
export const SETEXT_H2 = /^ {0,3}-+[ \t]*$/;
const HTML_BLOCK_START = /^ {0,3}<(\/?)([a-zA-Z][a-zA-Z0-9-]*)|^ {0,3}<!--/;

const SPACES_PER_INDENT = 2;

/** Leading-whitespace columns that open an indented code block (CommonMark). */
const INDENTED_CODE_COLUMNS = 4;

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

/**
 * Matches a fence opener. A backtick fence whose info string contains a
 * backtick is not a fence per CommonMark (it reads as an inline code span).
 */
export function matchFenceOpen(line: string): RegExpMatchArray | null {
	const match: RegExpMatchArray | null = line.match(FENCE_OPEN);
	if (!match) return null;
	if ((match[1] ?? '')[0] === '`' && (match[2] ?? '').includes('`')) return null;
	return match;
}

/** Tokenizes a full Markdown source string into block tokens. */
export function tokenizeBlocks(
	source: string,
	gfm = true,
	extensions: readonly MarkdownSyntaxExtension[] = [],
): BlockToken[] {
	// A single trailing newline closes the last line; it is not an extra line
	// (otherwise an unclosed fence at EOF would gain a phantom blank line).
	const normalized: string = source.replace(/\r\n?/g, '\n').replace(/\n$/, '');
	return tokenizeLines(normalized.split('\n'), gfm, extensions);
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
			const table: TableData | null = matchTable(lines, i, interruptsParagraph);
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

		const fence: RegExpMatchArray | null = matchFenceOpen(line);
		if (fence) {
			i = consumeFencedCode(lines, i, fence, tokens);
			continue;
		}

		const atx: RegExpMatchArray | null = line.match(ATX_HEADING);
		if (atx) {
			const rawText: string = (atx[2] ?? '').trim();
			// Content that is only `#`s is a closing sequence, not text (`### ###`).
			const text: string = /^#+$/.test(rawText) ? '' : rawText;
			tokens.push({ type: 'heading', level: (atx[1] ?? '#').length, text });
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

		const items: BlockToken[] | null = matchListItems(line);
		if (items) {
			i = consumeListItemContinuation(lines, i + 1, items, gfm);
			tokens.push(...items);
			continue;
		}

		if (canStartIndentedCode(line, tokens)) {
			i = consumeIndentedCode(lines, i, tokens);
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
	const language: string = decodeEscapesAndEntities((fence[2] ?? '').trim().split(/\s+/)[0] ?? '');
	const closeRe = new RegExp(`^ {0,3}${`\\${fenceChar}`}{${fenceStr.length},}[ \\t]*$`);
	// An indented opening fence strips up to that indentation from each body line.
	const openLine: string = lines[start] ?? '';
	const openIndent: number = openLine.length - openLine.trimStart().length;

	const body: string[] = [];
	let i: number = start + 1;
	while (i < lines.length) {
		const line: string = lines[i] ?? '';
		if (closeRe.test(line)) {
			i++;
			break;
		}
		body.push(stripLeadingSpaces(line, openIndent));
		i++;
	}
	tokens.push({ type: 'code_block', language, code: body.join('\n') });
	return i;
}

/** Removes up to `max` leading spaces from a line. */
function stripLeadingSpaces(line: string, max: number): string {
	let i = 0;
	while (i < max && line[i] === ' ') i++;
	return line.slice(i);
}

/**
 * Whether a line opens an indented code block (#195): at least four columns of
 * leading whitespace (tab-aware). Skipped directly after a list item, where
 * indented content is list continuation in CommonMark; the flat list model
 * degrades that to a paragraph (D9), which must not silently become code.
 * List-shaped and table-shaped lines never reach this check (they match
 * earlier), which keeps the flat-with-indent list round-trip intact.
 */
function canStartIndentedCode(line: string, tokens: readonly BlockToken[]): boolean {
	if (indentColumns(line) < INDENTED_CODE_COLUMNS) return false;
	const last: BlockToken | undefined = tokens[tokens.length - 1];
	return last?.type !== 'list_item';
}

/** Columns of leading whitespace, with tabs advancing to 4-column tab stops. */
function indentColumns(line: string): number {
	let col = 0;
	for (const ch of line) {
		if (ch === ' ') col++;
		else if (ch === '\t') col += 4 - (col % 4);
		else break;
	}
	return col;
}

/** Strips up to `columns` columns of leading whitespace (tab-aware). */
function stripIndent(line: string, columns: number): string {
	let col = 0;
	let i = 0;
	while (i < line.length && col < columns) {
		const ch: string = line[i] ?? '';
		if (ch === ' ') {
			col++;
			i++;
			continue;
		}
		if (ch === '\t') {
			col += 4 - (col % 4);
			i++;
			// A tab crossing the strip boundary re-expands into the excess spaces.
			if (col > columns) return ' '.repeat(col - columns) + line.slice(i);
			continue;
		}
		break;
	}
	return line.slice(i);
}

/**
 * Consumes an indented code block: all subsequent lines indented by at least
 * four columns, keeping interior blank lines but not trailing ones (they
 * separate the block from what follows). Returns the next line index.
 */
function consumeIndentedCode(
	lines: readonly string[],
	start: number,
	tokens: BlockToken[],
): number {
	const body: string[] = [];
	const pendingBlanks: string[] = [];
	let i: number = start;
	while (i < lines.length) {
		const line: string = lines[i] ?? '';
		if (isBlank(line)) {
			// Interior blank lines keep their content beyond the stripped columns.
			pendingBlanks.push(stripIndent(line, INDENTED_CODE_COLUMNS));
			i++;
			continue;
		}
		if (indentColumns(line) < INDENTED_CODE_COLUMNS) break;
		while (pendingBlanks.length > 0) body.push(pendingBlanks.shift() ?? '');
		body.push(stripIndent(line, INDENTED_CODE_COLUMNS));
		i++;
	}
	tokens.push({ type: 'code_block', language: '', code: body.join('\n') });
	return i - pendingBlanks.length;
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

/**
 * Consumes consecutive `>`-prefixed lines (plus lazy paragraph continuation
 * lines, per CommonMark) and recurses into their content. A plain line
 * continues the quote only while the innermost open block is a paragraph.
 */
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
	let lazyOk = false;
	while (i < lines.length) {
		const line: string = lines[i] ?? '';
		if (BLOCKQUOTE.test(line)) {
			const stripped: string = line.replace(BLOCKQUOTE, '');
			inner.push(stripped);
			lazyOk = continuesAsParagraph(stripped);
			i++;
			continue;
		}
		if (
			lazyOk &&
			!isBlank(line) &&
			!interruptsParagraph(line) &&
			!(gfm && matchTable(lines, i, interruptsParagraph))
		) {
			inner.push(line);
			i++;
			continue;
		}
		break;
	}
	tokens.push({ type: 'blockquote', children: tokenizeLines(inner, gfm, extensions, depth + 1) });
	return i;
}

/** Whether a stripped quote line leaves a paragraph open (at any nesting depth). */
function continuesAsParagraph(stripped: string): boolean {
	let content: string = stripped;
	while (BLOCKQUOTE.test(content)) content = content.replace(BLOCKQUOTE, '');
	if (content.trim() === '' || interruptsParagraph(content)) return false;
	// An indented-code line is not a paragraph, so nothing can lazily continue it.
	return indentColumns(content) < INDENTED_CODE_COLUMNS;
}

/** One parsed list marker: the item token plus chain/interrupt metadata. */
interface ListMarkerMatch {
	readonly token: BlockToken & { readonly type: 'list_item' };
	/** Synthetic line for a nested marker inside the content (`- - foo`), or null. */
	readonly nestedLine: string | null;
	/** The ordered start number (1 for bullets). */
	readonly startNumber: number;
}

/**
 * Parses the list marker(s) on a line, or null if the line is not a list item.
 * Content that is itself a marker chains into nested items (`- - foo` is an
 * empty bullet holding a nested bullet "foo"), re-parsed at the content column.
 */
function matchListItems(line: string): BlockToken[] | null {
	const out: BlockToken[] = [];
	let current: string = line;
	for (;;) {
		const match: ListMarkerMatch | null = matchSingleListItem(current);
		if (!match) break;
		out.push(match.token);
		if (match.nestedLine === null) break;
		current = match.nestedLine;
	}
	return out.length > 0 ? out : null;
}

/** Parses a single list marker on a line, or null. */
function matchSingleListItem(line: string): ListMarkerMatch | null {
	const bullet: RegExpMatchArray | null = line.match(BULLET_ITEM);
	const ordered: RegExpMatchArray | null = bullet ? null : line.match(ORDERED_ITEM);
	const match: RegExpMatchArray | null = bullet ?? ordered;
	if (!match) return null;

	const leading: string = match[1] ?? '';
	const leadingColumns: number = indentColumns(leading);
	const indent: number = Math.floor(leadingColumns / SPACES_PER_INDENT);
	const marker: string = (bullet ? match[2] : `${match[2]}${match[3]}`) ?? '-';
	const rawContent: string = ((bullet ? match[4] : match[5]) ?? '').trimEnd();
	const startNumber: number = ordered ? Number.parseInt(match[2] ?? '1', 10) : 1;

	const task: RegExpMatchArray | null = rawContent.match(TASK_PREFIX);
	if (task) {
		return {
			token: {
				type: 'list_item',
				listType: 'checklist',
				indent,
				checked: (task[1] ?? ' ').toLowerCase() === 'x',
				text: (task[2] ?? '').trimEnd(),
			},
			nestedLine: null,
			startNumber,
		};
	}

	if (LIST_MARKER_START.test(rawContent)) {
		// The content column is where the nested marker's own line begins.
		const contentColumn: number = leadingColumns + marker.length + 1;
		return {
			token: {
				type: 'list_item',
				listType: ordered ? 'ordered' : 'bullet',
				indent,
				checked: false,
				text: '',
			},
			nestedLine: `${' '.repeat(contentColumn)}${rawContent}`,
			startNumber,
		};
	}

	return {
		token: {
			type: 'list_item',
			listType: ordered ? 'ordered' : 'bullet',
			indent,
			checked: false,
			text: rawContent,
		},
		nestedLine: null,
		startNumber,
	};
}

/**
 * Consumes lazy continuation lines of the last list item: a plain line that
 * does not start another block continues the item's (tight) paragraph, per
 * CommonMark. Returns the next line index and rewrites the item's text.
 */
function consumeListItemContinuation(
	lines: readonly string[],
	start: number,
	items: BlockToken[],
	gfm: boolean,
): number {
	const last: BlockToken | undefined = items[items.length - 1];
	if (!last || last.type !== 'list_item') return start;
	const collected: string[] = [];
	let i: number = start;
	while (i < lines.length) {
		const line: string = lines[i] ?? '';
		// Any list-marker line is a sibling item, never lazy text (the
		// ordered-must-start-at-1 interrupt rule applies to paragraphs only).
		if (isBlank(line) || matchSingleListItem(line) || interruptsParagraph(line)) break;
		if (gfm && matchTable(lines, i, interruptsParagraph)) break;
		collected.push(line.trim());
		i++;
	}
	if (collected.length > 0) {
		const parts: string[] = last.text === '' ? collected : [last.text, ...collected];
		items[items.length - 1] = { ...last, text: parts.join('\n') };
	}
	return i;
}

/**
 * Whether a list-item line may interrupt an open paragraph: CommonMark forbids
 * empty items and ordered items not starting at 1 from doing so (`14.` in prose
 * must not begin a list).
 */
function listItemInterrupts(line: string): boolean {
	const match: ListMarkerMatch | null = matchSingleListItem(line);
	if (!match) return false;
	if (match.token.type === 'list_item' && match.token.text === '' && match.nestedLine === null) {
		return false;
	}
	if (match.token.type === 'list_item' && match.token.listType === 'ordered') {
		return match.startNumber === 1;
	}
	return true;
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
	if (matchFenceOpen(line)) return true;
	if (THEMATIC_BREAK.test(line)) return true;
	if (BLOCKQUOTE.test(line)) return true;
	if (listItemInterrupts(line)) return true;
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

	tokens.push({ type: 'paragraph', text: joinParagraphText(collected) });
	return i;
}

/**
 * Joins collected paragraph lines for inline parsing. Leading indentation is
 * insignificant and stripped, but trailing spaces on interior lines are kept:
 * two or more of them encode a hard break, which the inline parser consumes
 * (#193). The final line's trailing whitespace carries no meaning and is
 * dropped.
 */
function joinParagraphText(lines: readonly string[]): string {
	return lines
		.map((line, index) => (index === lines.length - 1 ? line.trim() : line.trimStart()))
		.join('\n');
}

/** Joins multi-line paragraph text into a single-line heading string. */
function joinParagraph(lines: readonly string[]): string {
	return lines
		.map((l) => l.trim())
		.join(' ')
		.trim();
}
