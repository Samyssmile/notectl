/**
 * GFM extended autolinks: `www.`, `http(s)://`, `mailto:`/`xmpp:`, bare emails.
 *
 * Implements the GFM "autolinks (extension)" rules rather than a naive URL
 * regex: valid-domain checks (at least one period, no underscore in the last
 * two segments), trailing-punctuation trimming, closing-paren balancing, and
 * trailing entity-reference stripping. Two integration points:
 *
 * - `matchGfmAutolinkAt` runs inside the inline parser's dispatch and scans the
 *   raw source. Matching before emphasis processing keeps URLs with `_` / `~`
 *   in their path intact instead of fragmenting them into delimiter runs.
 * - `applyGfmEmailAutolinks` is a post-pass over the resolved inline AST for
 *   bare `user@host.tld` emails: the local part may contain delimiter
 *   characters, so the surrounding text is only whole again after emphasis
 *   resolution has turned unused delimiters back into plain text.
 *
 * Every scan here is a bounded forward/backward walk (linear time, D1).
 */

import { type InlineAstNode, makeNode } from './InlineAst.js';

/** A matched GFM autolink: destination, display text, and source length. */
export interface GfmAutolinkMatch {
	readonly href: string;
	readonly display: string;
	readonly length: number;
}

/** Trailing characters GFM never counts as part of an autolink. */
const TRIMMABLE_PUNCTUATION = '?!.,:*_~';

/** Characters that may precede an autolink (besides start-of-text). */
const BOUNDARY = /[\s*_~(]/;

/** One domain segment: alphanumerics, underscores, hyphens. */
const DOMAIN_SEGMENT = /^[a-zA-Z0-9_-]+$/;

/** Bare email form (sticky, for in-source scans after a `mailto:`/`xmpp:` scheme). */
const EMAIL_AT = /[a-zA-Z0-9.+_-]+@[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+/y;

const EMAIL_LOCAL_CHAR = /[a-zA-Z0-9.+_-]/;
const EMAIL_DOMAIN_CHAR = /[a-zA-Z0-9_-]/;

/** Cheap pre-check: whether `pos` could start a GFM autolink (boundary + prefix). */
export function isGfmAutolinkCandidate(text: string, pos: number): boolean {
	const ch: string = text[pos] ?? '';
	if (ch !== 'h' && ch !== 'w' && ch !== 'm' && ch !== 'x' && ch !== 'f') return false;
	if (pos > 0 && !BOUNDARY.test(text[pos - 1] ?? '')) return false;
	return (
		text.startsWith('http://', pos) ||
		text.startsWith('https://', pos) ||
		text.startsWith('ftp://', pos) ||
		text.startsWith('www.', pos) ||
		text.startsWith('mailto:', pos) ||
		text.startsWith('xmpp:', pos)
	);
}

/** Matches a GFM autolink at `pos` (boundary included in the check), or null. */
export function matchGfmAutolinkAt(text: string, pos: number): GfmAutolinkMatch | null {
	if (!isGfmAutolinkCandidate(text, pos)) return null;
	if (
		text.startsWith('http://', pos) ||
		text.startsWith('https://', pos) ||
		text.startsWith('ftp://', pos)
	) {
		return matchUrl(text, pos);
	}
	if (text.startsWith('www.', pos)) return matchWww(text, pos);
	return matchProtocolEmail(text, pos);
}

/** The raw autolink candidate at `pos`: the trimmed run up to whitespace or `<`. */
function linkCandidate(text: string, pos: number): string {
	let end: number = pos;
	while (end < text.length) {
		const ch: string = text[end] ?? '';
		if (ch === '<' || /\s/.test(ch)) break;
		end++;
	}
	return trimTrailing(text.slice(pos, end));
}

function matchUrl(text: string, pos: number): GfmAutolinkMatch | null {
	const candidate: string = linkCandidate(text, pos);
	const schemeLength: number = text.startsWith('https://', pos)
		? 8
		: text.startsWith('http://', pos)
			? 7
			: 6;
	if (!isValidDomain(hostOf(candidate.slice(schemeLength)))) return null;
	return { href: candidate, display: candidate, length: candidate.length };
}

function matchWww(text: string, pos: number): GfmAutolinkMatch | null {
	const candidate: string = linkCandidate(text, pos);
	if (!isValidDomain(hostOf(candidate))) return null;
	return { href: `http://${candidate}`, display: candidate, length: candidate.length };
}

/** `mailto:` / `xmpp:` + email; the scheme is part of both href and display. */
function matchProtocolEmail(text: string, pos: number): GfmAutolinkMatch | null {
	const schemeLength: number = text.startsWith('mailto:', pos) ? 7 : 5;
	EMAIL_AT.lastIndex = pos + schemeLength;
	const match: RegExpExecArray | null = EMAIL_AT.exec(text);
	const email: string | undefined = match?.[0];
	if (!email || !isValidEmailEnd(email)) return null;
	const full: string = text.slice(pos, pos + schemeLength + email.length);
	return { href: full, display: full, length: full.length };
}

/** The host part of a candidate (up to the first `/ ? # :`). */
function hostOf(rest: string): string {
	const end: number = rest.search(/[/?#:]/);
	return end === -1 ? rest : rest.slice(0, end);
}

/** GFM valid domain: >= 2 segments, no underscore in the last two segments. */
function isValidDomain(domain: string): boolean {
	const segments: string[] = domain.split('.');
	if (segments.length < 2) return false;
	if (!segments.every((segment) => DOMAIN_SEGMENT.test(segment))) return false;
	return !segments.slice(-2).some((segment) => segment.includes('_'));
}

/** GFM email rule: the last character must not be `-` or `_`. */
function isValidEmailEnd(email: string): boolean {
	return !email.endsWith('-') && !email.endsWith('_');
}

/**
 * GFM trailing trims, applied until stable: trailing punctuation, an excess
 * closing paren (only while the candidate holds more `)` than `(`), and a
 * trailing entity reference (`&copy;`). Each pass removes at least one
 * character via a bounded backward scan, so the whole trim is linear.
 */
function trimTrailing(candidate: string): string {
	let open = 0;
	let close = 0;
	for (const ch of candidate) {
		if (ch === '(') open++;
		else if (ch === ')') close++;
	}
	let end: number = candidate.length;
	while (end > 0) {
		const ch: string = candidate[end - 1] ?? '';
		if (TRIMMABLE_PUNCTUATION.includes(ch)) {
			end--;
			continue;
		}
		if (ch === ')' && close > open) {
			end--;
			close--;
			continue;
		}
		if (ch === ';') {
			let j: number = end - 2;
			while (j > 0 && /[a-zA-Z0-9]/.test(candidate[j] ?? '')) j--;
			if (candidate[j] === '&' && j < end - 2) {
				end = j;
				continue;
			}
		}
		break;
	}
	return candidate.slice(0, end);
}

/**
 * Post-pass over the resolved inline AST: turns bare `user@host.tld` emails in
 * plain text into `mailto:` links. Adjacent text nodes (including leftover
 * delimiter runs) are merged first so a local part like `a_b` is scanned as one
 * string. Subtrees that must not be linkified (links, images, code, raw HTML,
 * plugin inline nodes) are skipped.
 */
export function applyGfmEmailAutolinks(nodes: InlineAstNode[]): void {
	mergeAdjacentAstText(nodes);
	for (let i = 0; i < nodes.length; i++) {
		const node: InlineAstNode | undefined = nodes[i];
		if (!node || skipsEmailScan(node.type)) continue;
		if (node.type === 'text') {
			const split: InlineAstNode[] | null = splitEmails(node.literal);
			if (split) {
				nodes.splice(i, 1, ...split);
				i += split.length - 1;
			}
			continue;
		}
		if (node.children.length > 0) applyGfmEmailAutolinks(node.children);
	}
}

function skipsEmailScan(type: InlineAstNode['type']): boolean {
	return (
		type === 'link' ||
		type === 'image' ||
		type === 'code' ||
		type === 'html_inline' ||
		type === 'inline_node'
	);
}

/**
 * Merges adjacent text siblings in place (delimiter leftovers are text too).
 * Single compaction pass — no per-merge splice, which would go quadratic on a
 * long run of unmatched delimiters (D1).
 */
function mergeAdjacentAstText(nodes: InlineAstNode[]): void {
	let write = 0;
	for (const node of nodes) {
		const prev: InlineAstNode | undefined = write > 0 ? nodes[write - 1] : undefined;
		if (prev && prev.type === 'text' && node.type === 'text') {
			prev.literal += node.literal;
			continue;
		}
		nodes[write] = node;
		write++;
	}
	nodes.length = write;
}

/**
 * Splits a literal into text/link nodes around bare emails, or null if none.
 * Anchored on each `@` with bounded back/forward scans instead of a global
 * regex: a `X+@` pattern backtracks quadratically over long runs of local-part
 * characters (the ReDoS fuzz suite catches exactly that, D1).
 */
function splitEmails(literal: string): InlineAstNode[] | null {
	const out: InlineAstNode[] = [];
	let cursor = 0;
	let at: number = literal.indexOf('@');
	while (at !== -1) {
		let start: number = at;
		while (start > cursor && EMAIL_LOCAL_CHAR.test(literal[start - 1] ?? '')) start--;
		let end: number = at + 1;
		while (
			end < literal.length &&
			(EMAIL_DOMAIN_CHAR.test(literal[end] ?? '') || literal[end] === '.')
		) {
			end++;
		}
		// Trailing periods are punctuation, not part of the address.
		while (end > at + 1 && literal[end - 1] === '.') end--;
		const email: string = literal.slice(start, end);
		if (start < at && isValidBareEmail(email, end - at - 1)) {
			if (start > cursor) out.push(makeNode('text', literal.slice(cursor, start)));
			const link: InlineAstNode = makeNode('link');
			link.href = `mailto:${email}`;
			link.children = [makeNode('text', email)];
			out.push(link);
			cursor = end;
			at = literal.indexOf('@', end);
			continue;
		}
		at = literal.indexOf('@', at + 1);
	}
	if (out.length === 0) return null;
	if (cursor < literal.length) out.push(makeNode('text', literal.slice(cursor)));
	return out;
}

/** Validates a scanned bare email: >= 2 domain segments, valid end character. */
function isValidBareEmail(email: string, domainLength: number): boolean {
	if (domainLength <= 0) return false;
	const domain: string = email.slice(email.indexOf('@') + 1);
	const segments: string[] = domain.split('.');
	if (segments.length < 2) return false;
	if (segments.some((segment) => segment === '')) return false;
	return isValidEmailEnd(email);
}
