/**
 * CommonMark escaping rules for Markdown serialization.
 *
 * Escaping is contextual: inline text backslash-escapes characters that would
 * otherwise start emphasis/code/links, while the start of a line additionally
 * escapes block markers (`#`, `>`, `-`, …) so prose never accidentally becomes
 * a heading or list on re-parse. Output stays minimal: we do not escape every
 * punctuation character, only those that are actually ambiguous in context.
 */

import { FENCE_OPEN, SETEXT_H1, SETEXT_H2, THEMATIC_BREAK } from './BlockTokenizer.js';

/** Inline specials that always need escaping in text content. */
const ALWAYS_ESCAPE = new Set(['\\', '`', '*', '[', ']', '<', '>']);

/** Whether the character at `i` sits between two word characters (intra-word). */
function isIntraWord(text: string, i: number): boolean {
	const prev: string | undefined = text[i - 1];
	const next: string | undefined = text[i + 1];
	if (prev === undefined || next === undefined) return false;
	return /\w/.test(prev) && /\w/.test(next);
}

/**
 * Escapes inline text so it round-trips as literal content. `~` is escaped only
 * for GFM (where `~~` is strikethrough); `_` is escaped only when it is not
 * intra-word, matching CommonMark's emphasis rules (so `a_b_c` stays literal).
 */
export function escapeInline(text: string, gfm: boolean): string {
	let out = '';
	for (let i = 0; i < text.length; i++) {
		const ch: string = text[i] ?? '';
		if (ALWAYS_ESCAPE.has(ch)) {
			out += `\\${ch}`;
			continue;
		}
		if (ch === '_' && !isIntraWord(text, i)) {
			out += '\\_';
			continue;
		}
		if (ch === '~' && gfm) {
			out += '\\~';
			continue;
		}
		if (ch === '&') {
			out += '&amp;';
			continue;
		}
		out += ch;
	}
	return out;
}

/** Pattern matching a leading block marker that must be escaped in paragraph text. */
const LINE_START_MARKER = /^(\s*)([#>])/;
/** Pattern matching a leading list bullet (`- `, `* `, `+ `). */
const LINE_START_BULLET = /^(\s*)([-*+])(\s)/;
/** Pattern matching a leading ordered marker (`1.` / `1)`). */
const LINE_START_ORDERED = /^(\s*)(\d{1,9})([.)])(\s)/;

/**
 * Whether a whole line would re-parse as a block construct that spans the entire
 * line: a thematic break, a setext underline, or an opening code fence. These
 * carry no trailing content marker (unlike `#`/`-`/`1.`), so they slip past the
 * leading-marker rules above. Backtick fences and `*`/`_`/`~` breaks are already
 * neutralized by inline escaping (they arrive backslash-prefixed); what reaches
 * here is `-`/`=` runs and, under CommonMark, `~~~` fences.
 */
function reparsesAsBlockLine(line: string): boolean {
	return (
		THEMATIC_BREAK.test(line) ||
		SETEXT_H1.test(line) ||
		SETEXT_H2.test(line) ||
		FENCE_OPEN.test(line)
	);
}

/**
 * Escapes leading block markers at the start of a paragraph line so the text
 * does not re-parse as a heading, blockquote, list, thematic break, setext
 * underline, or code fence.
 */
export function escapeLineStart(line: string): string {
	if (LINE_START_MARKER.test(line)) {
		return line.replace(LINE_START_MARKER, (_m, ws: string, marker: string) => `${ws}\\${marker}`);
	}
	if (LINE_START_BULLET.test(line)) {
		return line.replace(
			LINE_START_BULLET,
			(_m, ws: string, marker: string, sp: string) => `${ws}\\${marker}${sp}`,
		);
	}
	if (LINE_START_ORDERED.test(line)) {
		return line.replace(
			LINE_START_ORDERED,
			(_m, ws: string, num: string, marker: string, sp: string) => `${ws}${num}\\${marker}${sp}`,
		);
	}
	if (reparsesAsBlockLine(line)) {
		// Backslash the first non-space character: that breaks the run so the line
		// stays a paragraph, and `\-` / `\=` / `\~` decode back to the literal char.
		return line.replace(/\S/, (ch) => `\\${ch}`);
	}
	return line;
}

/** Escapes the destination of a link/image so spaces and parens stay intact. */
export function escapeLinkDestination(url: string): string {
	if (/[\s()]/.test(url)) {
		return `<${url.replace(/([<>])/g, '\\$1')}>`;
	}
	return url;
}

/** Escapes a link/image title for the `"..."` form. */
export function escapeLinkTitle(title: string): string {
	return title.replace(/(["\\])/g, '\\$1');
}

/**
 * Picks a backtick fence long enough to wrap `content` as an inline code span.
 * CommonMark requires a fence longer than any backtick run inside the content.
 */
export function codeSpanFence(content: string): string {
	let longest = 0;
	let current = 0;
	for (const ch of content) {
		if (ch === '`') {
			current++;
			longest = Math.max(longest, current);
		} else {
			current = 0;
		}
	}
	return '`'.repeat(longest + 1);
}

/** Wraps `content` in a correctly sized inline code span, padding when needed. */
export function wrapCodeSpan(content: string): string {
	const fence: string = codeSpanFence(content);
	// Pad with a space when content starts/ends with a backtick or is all spaces,
	// per CommonMark's code-span stripping rule.
	const needsPad: boolean =
		content.startsWith('`') ||
		content.endsWith('`') ||
		(content.length > 0 && content.trim().length === 0);
	const inner: string = needsPad ? ` ${content} ` : content;
	return `${fence}${inner}${fence}`;
}
