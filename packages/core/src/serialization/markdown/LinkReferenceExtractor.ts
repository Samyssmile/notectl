/**
 * Link reference definition extraction (`[label]: dest "title"`).
 *
 * Runs as a pre-pass over the source before block tokenization, mirroring how
 * commonmark.js resolves references before inline parsing. CommonMark rules
 * honored here:
 *
 * - A definition never interrupts an open paragraph (a def-shaped line that
 *   lazily continues a paragraph stays paragraph text).
 * - Def-shaped lines inside fenced code are code and survive verbatim.
 * - The destination may sit on the line after the label, and a title may sit
 *   on its own following line (multi-line labels and multi-line titles are not
 *   supported; such lines stay paragraph text, which never drops content).
 * - Titles honor backslash escapes; destinations and titles decode escapes and
 *   entity references; labels match case-folded (Unicode, `ẞ` ↔ `SS`).
 * - A definition inside a blockquote is recognized too; the quote marker line
 *   is kept so the (now empty) container survives.
 *
 * First definition of a label wins, as per spec.
 */

import { ATX_HEADING, THEMATIC_BREAK, matchFenceOpen } from './BlockTokenizer.js';
import { decodeEscapesAndEntities } from './MarkdownEntities.js';

/** A link reference definition target. */
export interface LinkRef {
	readonly href: string;
	readonly title?: string;
}

/** `[label]:` at up to 3 spaces indent; the label may hold escaped brackets. */
const LABEL_LINE = /^ {0,3}\[((?:\\.|[^\\[\]])+)\]:(.*)$/;

/** One or more blockquote markers prefixing a line. */
const BLOCKQUOTE_PREFIX = /^( {0,3}(?:> ?)+)(.*)$/;

/** A line holding nothing but a link title (for the title-on-next-line form). */
const TITLE_LINE =
	/^[ \t]*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|\(((?:\\.|[^()\\])*)\))[ \t]*$/;

const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

/**
 * Case-folds a reference label for matching. `toUpperCase().toLowerCase()`
 * approximates Unicode case folding (it maps `ẞ`/`ß` and `SS` to the same
 * string), which plain `toLowerCase()` does not.
 */
export function foldReferenceLabel(label: string): string {
	return label
		.trim()
		.replace(/[ \t\n]+/g, ' ')
		.toLowerCase()
		.toUpperCase()
		.toLowerCase();
}

/** Removes link reference definitions from the source and returns them as a map. */
export function extractLinkReferences(source: string): {
	source: string;
	linkRefs: Map<string, LinkRef>;
} {
	const linkRefs = new Map<string, LinkRef>();
	const lines: string[] = source.split('\n');
	const kept: string[] = [];
	let fence: { char: string; len: number } | null = null;
	// Whether a paragraph is open above the next line: a definition is only
	// recognized at a block boundary (document start, after a blank line, a
	// heading, a thematic break, a fence, or another definition).
	let openParagraph = false;
	let i = 0;

	while (i < lines.length) {
		const line: string = lines[i] ?? '';

		if (fence) {
			kept.push(line);
			const close: RegExpMatchArray | null = line.match(FENCE_CLOSE);
			const run: string | undefined = close?.[1];
			if (run && run[0] === fence.char && run.length >= fence.len) fence = null;
			openParagraph = false;
			i++;
			continue;
		}
		const open: RegExpMatchArray | null = matchFenceOpen(line);
		if (open?.[1]) {
			fence = { char: open[1][0] ?? '`', len: open[1].length };
			kept.push(line);
			openParagraph = false;
			i++;
			continue;
		}

		const consumed: number = openParagraph ? 0 : tryDefinition(lines, i, '', linkRefs, kept);
		if (consumed > 0) {
			i += consumed;
			continue;
		}

		kept.push(line);
		// A blank line or a complete block (heading, thematic break) closes any open
		// paragraph; every other non-blank line keeps one open. Deliberate keep-bias:
		// a def-shaped line after, e.g., a table row or setext underline is preserved
		// as text rather than registered, which never drops content (D3).
		openParagraph = line.trim() !== '' && !ATX_HEADING.test(line) && !THEMATIC_BREAK.test(line);
		i++;
	}
	return { source: kept.join('\n'), linkRefs };
}

/**
 * Tries to consume a definition starting at `lines[start]`, registering it and
 * pushing any kept container-prefix line. Returns the number of source lines
 * consumed (0 = no definition here).
 */
function tryDefinition(
	lines: readonly string[],
	start: number,
	prefix: string,
	linkRefs: Map<string, LinkRef>,
	kept: string[],
): number {
	const line: string = lines[start] ?? '';

	const label: RegExpMatchArray | null = line.match(LABEL_LINE);
	if (!label) {
		// A definition nested in a blockquote: strip the marker(s) and retry once.
		if (prefix === '') {
			const quoted: RegExpMatchArray | null = line.match(BLOCKQUOTE_PREFIX);
			if (quoted?.[1] && LABEL_LINE.test(quoted[2] ?? '')) {
				const inner: string[] = [];
				const consumed: number = tryDefinition([quoted[2] ?? ''], 0, quoted[1], linkRefs, inner);
				if (consumed > 0) {
					// Keep the bare marker so the blockquote container survives.
					kept.push(quoted[1].trimEnd());
					return 1;
				}
			}
		}
		return 0;
	}

	const labelText: string = label[1] ?? '';
	let rest: string = (label[2] ?? '').trim();
	let consumed = 1;

	// Destination on the next line (only supported outside containers).
	if (rest === '' && prefix === '') {
		const next: string = lines[start + consumed] ?? '';
		if (next.trim() === '') return 0;
		rest = next.trim();
		consumed++;
	}
	if (rest === '') return 0;

	const dest = scanDestination(rest);
	if (!dest) return 0;
	const afterDest: string = rest.slice(dest.end).trim();

	let title: string | undefined;
	if (afterDest !== '') {
		const inline: RegExpMatchArray | null = afterDest.match(TITLE_LINE);
		if (!inline) return 0; // Junk after the destination: not a definition.
		title = titleFrom(inline);
	} else if (prefix === '') {
		// Optional title on its own next line.
		const next: string = lines[start + consumed] ?? '';
		const nextTitle: RegExpMatchArray | null = next.match(TITLE_LINE);
		if (nextTitle) {
			title = titleFrom(nextTitle);
			consumed++;
		}
	}

	const key: string = foldReferenceLabel(labelText);
	if (key !== '' && !linkRefs.has(key)) {
		linkRefs.set(key, title !== undefined ? { href: dest.href, title } : { href: dest.href });
	}
	return consumed;
}

function titleFrom(match: RegExpMatchArray): string {
	return decodeEscapesAndEntities(match[1] ?? match[2] ?? match[3] ?? '');
}

/** Scans a definition destination: `<angle>` or a bare paren-balanced run. */
function scanDestination(rest: string): { href: string; end: number } | null {
	if (rest[0] === '<') {
		let i = 1;
		while (i < rest.length) {
			const ch: string = rest[i] ?? '';
			if (ch === '\\') {
				i += 2;
				continue;
			}
			if (ch === '>') {
				return { href: decodeEscapesAndEntities(rest.slice(1, i)), end: i + 1 };
			}
			if (ch === '<') return null;
			i++;
		}
		return null;
	}
	let depth = 0;
	let i = 0;
	while (i < rest.length) {
		const ch: string = rest[i] ?? '';
		if (ch === ' ' || ch === '\t') break;
		if (ch === '\\') {
			i += 2;
			continue;
		}
		if (ch === '(') depth++;
		if (ch === ')') {
			if (depth === 0) break;
			depth--;
		}
		i++;
	}
	if (i === 0) return null;
	return { href: decodeEscapesAndEntities(rest.slice(0, i)), end: i };
}
