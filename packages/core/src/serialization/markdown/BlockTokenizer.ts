/**
 * Block-level Markdown tokenizer.
 *
 * A line scanner that turns Markdown source into a flat (recursive for
 * blockquotes) list of block tokens. The grammar is centralized here, by
 * necessity: CommonMark block structure is global and context-sensitive and
 * cannot be decomposed into per-spec rules (D4). `MarkdownParser` maps these
 * tokens to schema node types by name.
 *
 * List items follow CommonMark content-column semantics (#194): each item owns
 * a content column derived from its marker; subsequent lines indented at least
 * that far are the item's own content region, dedented and tokenized
 * recursively. A region that yields a single paragraph keeps the item a leaf;
 * anything else makes the item a container with block children. Nested list
 * items are hoisted out of the region into flat siblings (the editor's
 * flat-with-indent sibling model, indent = nesting level). Markers indented
 * four or more columns are not markers (indented code / lazy text, per spec).
 * Blockquotes support lazy paragraph continuation, and so do list items.
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
			/** Inline text of a leaf item; empty when `children` is present. */
			readonly text: string;
			/** Block children of a multi-block (container) item, absent for leaves. */
			readonly children?: readonly BlockToken[];
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
// Exported alongside the other grammar patterns so the serializer's line-start
// escaping re-parses paragraph lines with the exact same rules (single source of
// truth: a line the tokenizer would read as a setext underline gets escaped).
export const SETEXT_H1 = /^ {0,3}=+[ \t]*$/;
export const SETEXT_H2 = /^ {0,3}-+[ \t]*$/;
const HTML_BLOCK_START = /^ {0,3}<(\/?)([a-zA-Z][a-zA-Z0-9-]*)|^ {0,3}<!--/;

/** Leading-whitespace columns that open an indented code block (CommonMark). */
const INDENTED_CODE_COLUMNS = 4;

/** Maximum leading columns of a list marker; deeper markers are code/lazy text. */
const MAX_MARKER_INDENT_COLUMNS = 3;

/**
 * Maximum container nesting (blockquotes, list-item regions) before the
 * construct is treated as literal text. Each level recurses
 * (`tokenizeLines` → container consumer → `tokenizeLines`), so an adversarial
 * paste of thousands of `>`/`-` prefixes would overflow the stack. The cap
 * keeps recursion bounded; deeper content degrades to a paragraph (no data
 * loss, the marker characters are preserved). Real documents never nest this
 * deep.
 */
const MAX_CONTAINER_DEPTH = 32;

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
			if (depth >= MAX_CONTAINER_DEPTH) {
				i = consumeParagraph(lines, i, tokens);
				continue;
			}
			i = consumeBlockquote(lines, i, tokens, gfm, extensions, depth);
			continue;
		}

		const marker: ListMarker | null = depth < MAX_CONTAINER_DEPTH ? matchListMarker(line) : null;
		if (marker) {
			i = consumeListItem(lines, i, marker, tokens, gfm, extensions, depth);
			continue;
		}

		if (canStartIndentedCode(line)) {
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
 * leading whitespace (tab-aware). Indented content that belongs to an open
 * list item never reaches this check — it is consumed into the item's content
 * region first (#194).
 */
function canStartIndentedCode(line: string): boolean {
	return indentColumns(line) >= INDENTED_CODE_COLUMNS;
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

/**
 * Strips `columns` columns of leading whitespace (tab-aware). The remaining
 * leading whitespace is re-emitted as spaces measured in absolute columns:
 * tab stops depend on the column a tab starts in, so dedented lines must not
 * carry raw tabs whose width would be recomputed in the wrong context.
 */
function stripIndent(line: string, columns: number): string {
	let col = 0;
	let i = 0;
	while (i < line.length) {
		const ch: string = line[i] ?? '';
		if (ch === ' ') col++;
		else if (ch === '\t') col += 4 - (col % 4);
		else break;
		i++;
	}
	return ' '.repeat(Math.max(0, col - columns)) + line.slice(i);
}

/**
 * Strips `columns` columns of leading whitespace from a code line, preserving
 * literal tabs beyond the strip boundary. Indented-code content is literal, so
 * tabs are significant (Makefiles, Go) and must survive verbatim — unlike
 * {@link stripIndent}, which normalizes re-tokenized structural whitespace to
 * spaces. Only a tab straddling the strip boundary contributes spaces (the part
 * of its width past `columns`); tabs fully past the boundary are kept as-is.
 */
function stripCodeIndent(line: string, columns: number): string {
	let col = 0;
	let i = 0;
	while (i < line.length && col < columns) {
		const ch: string = line[i] ?? '';
		if (ch === ' ') {
			col++;
			i++;
		} else if (ch === '\t') {
			const next: number = col + 4 - (col % 4);
			if (next > columns) {
				// Straddling tab: emit only its overflow past the boundary as spaces
				// and keep the remainder of the line (including later tabs) verbatim.
				return ' '.repeat(next - columns) + line.slice(i + 1);
			}
			col = next;
			i++;
		} else {
			break;
		}
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
			pendingBlanks.push(stripCodeIndent(line, INDENTED_CODE_COLUMNS));
			i++;
			continue;
		}
		if (indentColumns(line) < INDENTED_CODE_COLUMNS) break;
		while (pendingBlanks.length > 0) body.push(pendingBlanks.shift() ?? '');
		body.push(stripCodeIndent(line, INDENTED_CODE_COLUMNS));
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

/**
 * Whether a stripped container line leaves a paragraph open at its innermost
 * level: quote prefixes and list markers are peeled off (`> 1. > text` opens a
 * paragraph two containers deep, which a lazy line may continue).
 */
function continuesAsParagraph(stripped: string): boolean {
	let content: string = stripped;
	for (;;) {
		if (BLOCKQUOTE.test(content)) {
			content = content.replace(BLOCKQUOTE, '');
			continue;
		}
		const marker: ListMarker | null = matchListMarker(content);
		if (marker && marker.firstText !== '') {
			content = marker.firstText;
			continue;
		}
		break;
	}
	if (content.trim() === '' || interruptsParagraph(content)) return false;
	// An indented-code line is not a paragraph, so nothing can lazily continue it.
	return indentColumns(content) < INDENTED_CODE_COLUMNS;
}

/** Geometry and metadata of a single list-marker line. */
interface ListMarker {
	readonly listType: 'bullet' | 'ordered' | 'checklist';
	readonly checked: boolean;
	/** Column where the item's content begins; region lines must reach it. */
	readonly contentColumn: number;
	/** The marker line's own content (task prefix stripped), '' for empty items. */
	readonly firstText: string;
	/** The ordered start number (1 for bullets). */
	readonly startNumber: number;
}

/** Columns spanned by a whitespace run starting at an absolute column. */
function columnsFrom(start: number, whitespace: string): number {
	let col: number = start;
	for (const ch of whitespace) {
		if (ch === ' ') col++;
		else if (ch === '\t') col += 4 - (col % 4);
		else break;
	}
	return col - start;
}

/**
 * Parses a list-marker line into its content-column geometry, or null when the
 * line is not a valid marker: markers indented four or more columns are
 * indented code or lazy text, never list items (CommonMark).
 */
function matchListMarker(line: string): ListMarker | null {
	const bullet: RegExpMatchArray | null = line.match(BULLET_ITEM);
	const ordered: RegExpMatchArray | null = bullet ? null : line.match(ORDERED_ITEM);
	const match: RegExpMatchArray | null = bullet ?? ordered;
	if (!match) return null;

	const leadingColumns: number = indentColumns(match[1] ?? '');
	if (leadingColumns > MAX_MARKER_INDENT_COLUMNS) return null;

	const markerText: string = (bullet ? match[2] : `${match[2]}${match[3]}`) ?? '-';
	const markerEnd: number = leadingColumns + markerText.length;
	const spacing: string = (bullet ? match[3] : match[4]) ?? '';
	const spacingColumns: number = columnsFrom(markerEnd, spacing);
	const rawContent: string = (bullet ? match[4] : match[5]) ?? '';
	const startNumber: number = ordered ? Number.parseInt(match[2] ?? '1', 10) : 1;

	let contentColumn: number;
	let firstText: string;
	if (rawContent.trim() === '') {
		contentColumn = markerEnd + 1;
		firstText = '';
	} else if (spacingColumns >= 5) {
		// Content five or more columns past the marker starts as indented code;
		// the content column sits one past the marker (CommonMark).
		contentColumn = markerEnd + 1;
		firstText = ' '.repeat(spacingColumns - 1) + rawContent;
	} else {
		contentColumn = markerEnd + spacingColumns;
		firstText = rawContent;
	}

	const task: RegExpMatchArray | null = firstText.match(TASK_PREFIX);
	if (task) {
		return {
			listType: 'checklist',
			checked: (task[1] ?? ' ').toLowerCase() === 'x',
			contentColumn,
			firstText: task[2] ?? '',
			startNumber,
		};
	}
	return {
		listType: ordered ? 'ordered' : 'bullet',
		checked: false,
		contentColumn,
		firstText,
		startNumber,
	};
}

/**
 * Consumes one list item: the marker line plus its content region — every
 * following line indented to the content column (dedented), interior blank
 * lines, and lazy paragraph continuation lines. The collected content is
 * tokenized recursively; nested list items are hoisted into flat siblings.
 * Returns the next line index.
 */
function consumeListItem(
	lines: readonly string[],
	start: number,
	marker: ListMarker,
	tokens: BlockToken[],
	gfm: boolean,
	extensions: readonly MarkdownSyntaxExtension[],
	depth: number,
): number {
	const region: string[] = [];
	const tracker: (line: string, paragraphOpen: boolean) => boolean = createParagraphTracker();
	let firstText: string = marker.firstText;
	let paragraphOpen: boolean = firstText === '' ? false : tracker(firstText, false);
	let pendingBlanks = 0;
	let i: number = start + 1;

	while (i < lines.length) {
		const line: string = lines[i] ?? '';

		if (isBlank(line)) {
			// An item may begin with at most one blank line: a marker with no
			// content followed by a blank line stays an empty item (CommonMark).
			if (firstText === '' && region.length === 0) break;
			pendingBlanks++;
			paragraphOpen = false;
			i++;
			continue;
		}

		if (indentColumns(line) >= marker.contentColumn) {
			while (pendingBlanks > 0) {
				region.push('');
				pendingBlanks--;
			}
			const dedented: string = stripIndent(line, marker.contentColumn);
			region.push(dedented);
			paragraphOpen = tracker(dedented, paragraphOpen);
			i++;
			continue;
		}

		// Under-indented: only a lazy paragraph continuation keeps the item open.
		// Any valid marker line is a sibling item, never lazy text (the
		// ordered-must-start-at-1 interrupt rule applies to paragraphs only).
		if (matchListMarker(line)) break;
		if (!paragraphOpen) break;
		if (interruptsParagraph(line)) break;
		if (gfm && matchTable(lines, i, interruptsParagraph)) break;
		// A lazy line belongs textually to the open paragraph: fold it into the
		// previous logical line so it can never re-parse as a block start in the
		// item's sub-document (`- d\n    - e` keeps "- e" as paragraph text).
		const lazy: string = line.trimStart();
		const lastRegionLine: string | undefined = region[region.length - 1];
		if (lastRegionLine !== undefined) {
			region[region.length - 1] = `${lastRegionLine}\n${lazy}`;
		} else {
			firstText = firstText === '' ? lazy : `${firstText}\n${lazy}`;
		}
		paragraphOpen = tracker(lazy, paragraphOpen);
		i++;
	}

	appendListItemTokens(marker, firstText, region, tokens, gfm, extensions, depth);
	return i;
}

/**
 * Tracks whether the innermost open block of an item's content region is a
 * paragraph — the precondition for lazy continuation. Fenced code suspends
 * laziness until the fence closes; block starters close the paragraph. The
 * caller passes whether a paragraph is currently open, because an indented line
 * cannot start an indented code block while a paragraph is open (CommonMark): it
 * continues that paragraph instead, and only opens a code block from a closed
 * state.
 */
function createParagraphTracker(): (line: string, paragraphOpen: boolean) => boolean {
	let closeRe: RegExp | null = null;
	return (line: string, paragraphOpen: boolean): boolean => {
		if (closeRe) {
			if (closeRe.test(line)) closeRe = null;
			return false;
		}
		const fence: RegExpMatchArray | null = matchFenceOpen(line);
		if (fence) {
			const fenceStr: string = fence[1] ?? '```';
			const fenceChar: string = fenceStr[0] ?? '`';
			closeRe = new RegExp(`^ {0,3}${`\\${fenceChar}`}{${fenceStr.length},}[ \\t]*$`);
			return false;
		}
		if (isBlank(line)) return false;
		if (BLOCKQUOTE.test(line) || matchListMarker(line)) return continuesAsParagraph(line);
		// Indented code cannot interrupt an open paragraph: an indented line keeps
		// the paragraph open, and only opens a code block when none is open.
		if (indentColumns(line) >= INDENTED_CODE_COLUMNS) return paragraphOpen;
		return !interruptsParagraph(line);
	};
}

/**
 * Builds the item token(s) from the marker line and its dedented content
 * region: the content is tokenized recursively; a single-paragraph result
 * keeps the item a leaf, anything else becomes a container with block
 * children. Nested list items are hoisted out into flat siblings one indent
 * deeper (the editor's flat-with-indent sibling model).
 */
function appendListItemTokens(
	marker: ListMarker,
	firstText: string,
	region: readonly string[],
	tokens: BlockToken[],
	gfm: boolean,
	extensions: readonly MarkdownSyntaxExtension[],
	depth: number,
): void {
	const subLines: string[] = firstText === '' ? [...region] : [firstText, ...region];
	const subTokens: BlockToken[] =
		subLines.length === 0 ? [] : tokenizeLines(subLines, gfm, extensions, depth + 1);

	const lifted: BlockToken[] = [];
	const own: BlockToken[] = [];
	for (const token of subTokens) {
		if (token.type === 'list_item') {
			lifted.push({ ...token, indent: token.indent + 1 });
		} else {
			own.push(token);
		}
	}

	const first: BlockToken | undefined = own[0];
	if (own.length === 1 && first?.type === 'paragraph') {
		tokens.push(makeListItemToken(marker, first.text));
	} else if (own.length === 0) {
		tokens.push(makeListItemToken(marker, ''));
	} else {
		tokens.push(makeListItemToken(marker, '', own));
	}
	tokens.push(...lifted);
}

/** Builds a `list_item` token at indent 0 of the current tokenization level. */
function makeListItemToken(
	marker: ListMarker,
	text: string,
	children?: readonly BlockToken[],
): BlockToken {
	const base = {
		type: 'list_item' as const,
		listType: marker.listType,
		indent: 0,
		checked: marker.checked,
		text,
	};
	return children ? { ...base, children } : base;
}

/**
 * Whether a list-item line may interrupt an open paragraph: CommonMark forbids
 * empty items and ordered items not starting at 1 from doing so (`14.` in prose
 * must not begin a list).
 */
function listItemInterrupts(line: string): boolean {
	const marker: ListMarker | null = matchListMarker(line);
	if (!marker) return false;
	if (marker.firstText.trim() === '') return false;
	if (marker.listType === 'ordered') return marker.startNumber === 1;
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
