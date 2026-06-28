/**
 * Inline Markdown parser: a linear-time, delimiter-stack tokenizer (the
 * CommonMark reference approach), producing an inline AST that is then flattened
 * into notectl's `(TextNode | InlineNode)[]` mark-set model.
 *
 * Linear-time and backtracking-free by construction: emphasis runs through a
 * doubly-linked delimiter stack, code spans / autolinks / inline HTML are
 * forward scans, and there is no catastrophic-backtracking regex. This is the
 * ReDoS-safety guarantee for untrusted pasted Markdown (D1).
 *
 * Marks with no Markdown form round-trip through inline HTML produced by the
 * serializer's fallback: a balanced `<u>…</u>` / `<span style>…</span>` run is
 * captured and re-parsed via the HTML parser, recovering the original mark (D3).
 */

import type { InlineNode, Mark, TextNode } from '../../model/Document.js';
import { createInlineNode, createTextNode } from '../../model/Document.js';
import { type InlineTypeName, inlineType, markType } from '../../model/TypeBrands.js';
import { parseHTMLToDocument } from '../DocumentParser.js';
import { type InlineAstNode, type InlineKind, insertAfter, makeNode, unlink } from './InlineAst.js';
import type { ParseContext } from './MarkdownParseContext.js';

// --- Delimiter / bracket stacks ---

interface Delimiter {
	cc: string;
	numdelims: number;
	origdelims: number;
	node: InlineAstNode;
	canOpen: boolean;
	canClose: boolean;
	prev: Delimiter | null;
	next: Delimiter | null;
}

interface Bracket {
	node: InlineAstNode;
	prev: Bracket | null;
	prevDelim: Delimiter | null;
	index: number;
	image: boolean;
	active: boolean;
}

/** Upper bound on an inline link destination scan (ReDoS guard; real URLs are short). */
const MAX_DESTINATION_LENGTH = 8192;

const PUNCTUATION = /[!-/:-@[-`{-~]/;
const ESCAPABLE = /[!-/:-@[-`{-~]/;
const INLINE_HTML_TAGS: ReadonlySet<string> = new Set([
	'u',
	'sup',
	'sub',
	'span',
	'mark',
	'b',
	'i',
	'em',
	'strong',
	'code',
	's',
	'del',
	'small',
	'abbr',
	'kbd',
	'a',
]);

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	copy: '©',
	reg: '®',
	hellip: '…',
	mdash: '—',
	ndash: '–',
};

/** Decodes a single HTML entity body (without `&`/`;`), or returns it verbatim. */
function decodeEntity(body: string): string {
	if (body[0] === '#') {
		const isHex: boolean = body[1] === 'x' || body[1] === 'X';
		const code: number = Number.parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
		if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
			try {
				return String.fromCodePoint(code);
			} catch {
				return `&${body};`;
			}
		}
		return `&${body};`;
	}
	return NAMED_ENTITIES[body] ?? `&${body};`;
}

function isWhitespace(ch: string): boolean {
	return ch === '' || /\s/.test(ch);
}

function isPunct(ch: string): boolean {
	return ch !== '' && PUNCTUATION.test(ch);
}

/** The inline parser. One instance per inline string. */
class InlineParser {
	private pos = 0;
	private readonly text: string;
	private readonly len: number;
	private readonly ctx: ParseContext;
	private delimiters: Delimiter | null = null;
	private brackets: Bracket | null = null;

	constructor(text: string, ctx: ParseContext) {
		this.text = text;
		this.len = text.length;
		this.ctx = ctx;
	}

	/** Parses the inline string into a list of top-level AST nodes. */
	parse(): InlineAstNode[] {
		const root: InlineAstNode = makeNode('text');
		let last: InlineAstNode = root;
		const append = (node: InlineAstNode): void => {
			insertAfter(last, node);
			last = node;
		};

		while (this.pos < this.len) {
			const node: InlineAstNode | null = this.parseToken();
			if (node) append(node);
		}

		this.processEmphasis(null);
		return collectSiblings(root);
	}

	/** Dispatches on the current character, returning the produced node (already linked for delims). */
	private parseToken(): InlineAstNode | null {
		const ch: string = this.text[this.pos] ?? '';
		switch (ch) {
			case '\n':
				return this.parseNewline();
			case '\\':
				return this.parseBackslash();
			case '`':
				return this.parseBackticks();
			case '*':
			case '_':
			case '~':
			case '=':
			case '^':
				return this.parseDelimiterRun(ch);
			case '[':
				return this.parseOpenBracket(false);
			case '!':
				if (this.text[this.pos + 1] === '[') return this.parseOpenBracket(true);
				this.pos++;
				return makeNode('text', '!');
			case ']':
				return this.parseCloseBracket();
			case '<':
				return this.parseLessThan();
			case '&':
				return this.parseEntity();
			default: {
				const ext: InlineAstNode | null = this.parseExtension();
				if (ext) return ext;
				return this.parseString();
			}
		}
	}

	/** Plain text up to the next significant character. */
	private parseString(): InlineAstNode {
		const start: number = this.pos;
		this.pos++;
		while (this.pos < this.len) {
			const ch: string = this.text[this.pos] ?? '';
			if ('\n\\`*_~=^[]!<&'.includes(ch)) break;
			if (this.matchesExtensionStart()) break;
			this.pos++;
		}
		return makeNode('text', this.text.slice(start, this.pos));
	}

	/** Plugin syntax extensions (e.g. formula `$...$`). */
	private parseExtension(): InlineAstNode | null {
		for (const ext of this.ctx.opts.syntaxExtensions) {
			const match = ext.matchInline?.(this.text, this.pos);
			if (match) {
				this.pos += match.length;
				const node: InlineAstNode = makeNode('inline_node');
				node.inlineType = match.type;
				node.attrs = match.attrs;
				return node;
			}
		}
		return null;
	}

	private matchesExtensionStart(): boolean {
		for (const ext of this.ctx.opts.syntaxExtensions) {
			if (ext.matchInline?.(this.text, this.pos)) return true;
		}
		return false;
	}

	/** A newline: hard break (preceded by `\` or two spaces) or soft break. */
	private parseNewline(): InlineAstNode {
		this.pos++;
		// Skip leading spaces of the next line.
		while (this.text[this.pos] === ' ') this.pos++;
		return makeNode('softbreak');
	}

	private parseBackslash(): InlineAstNode {
		this.pos++;
		const next: string = this.text[this.pos] ?? '';
		if (next === '\n') {
			this.pos++;
			while (this.text[this.pos] === ' ') this.pos++;
			return makeNode('hardbreak');
		}
		if (ESCAPABLE.test(next)) {
			this.pos++;
			return makeNode('text', next);
		}
		return makeNode('text', '\\');
	}

	/** A backtick code span; falls back to literal backticks if unclosed. */
	private parseBackticks(): InlineAstNode {
		const start: number = this.pos;
		let count = 0;
		while (this.text[this.pos] === '`') {
			count++;
			this.pos++;
		}
		const fence: string = '`'.repeat(count);
		const after: number = this.pos;
		let search: number = after;
		while (search < this.len) {
			const idx: number = this.text.indexOf(fence, search);
			if (idx === -1) break;
			// Require an exact-length run (not part of a longer run).
			if (this.text[idx - 1] !== '`' && this.text[idx + count] !== '`') {
				let content: string = this.text.slice(after, idx).replace(/\n/g, ' ');
				if (
					content.length > 2 &&
					content.startsWith(' ') &&
					content.endsWith(' ') &&
					content.trim() !== ''
				) {
					content = content.slice(1, -1);
				}
				this.pos = idx + count;
				return makeNode('code', content);
			}
			search = idx + 1;
		}
		// No closer: treat the opening run as literal text.
		this.pos = after;
		return makeNode('text', this.text.slice(start, after));
	}

	/** A run of emphasis/extension delimiters; records a stack entry. */
	private parseDelimiterRun(cc: string): InlineAstNode {
		const { numdelims, canOpen, canClose } = this.scanDelims(cc);
		const node: InlineAstNode = makeNode('text', cc.repeat(numdelims));
		const delim: Delimiter = {
			cc,
			numdelims,
			origdelims: numdelims,
			node,
			canOpen,
			canClose,
			prev: this.delimiters,
			next: null,
		};
		if (this.delimiters) this.delimiters.next = delim;
		this.delimiters = delim;
		return node;
	}

	/** Counts a delimiter run and computes its flanking flags. */
	private scanDelims(cc: string): { numdelims: number; canOpen: boolean; canClose: boolean } {
		const start: number = this.pos;
		while (this.text[this.pos] === cc) this.pos++;
		const numdelims: number = this.pos - start;

		const before: string = start === 0 ? '' : (this.text[start - 1] ?? '');
		const after: string = this.text[this.pos] ?? '';
		const beforeWs: boolean = isWhitespace(before);
		const afterWs: boolean = isWhitespace(after);
		const beforePunct: boolean = isPunct(before);
		const afterPunct: boolean = isPunct(after);

		const leftFlanking: boolean = !afterWs && (!afterPunct || beforeWs || beforePunct);
		const rightFlanking: boolean = !beforeWs && (!beforePunct || afterWs || afterPunct);

		let canOpen: boolean;
		let canClose: boolean;
		if (cc === '_') {
			canOpen = leftFlanking && (!rightFlanking || beforePunct);
			canClose = rightFlanking && (!leftFlanking || afterPunct);
		} else {
			canOpen = leftFlanking;
			canClose = rightFlanking;
		}
		return { numdelims, canOpen, canClose };
	}

	/** `[` or `![`: push a bracket and emit its literal text node. */
	private parseOpenBracket(image: boolean): InlineAstNode {
		const literal: string = image ? '![' : '[';
		this.pos += literal.length;
		const node: InlineAstNode = makeNode('text', literal);
		this.brackets = {
			node,
			prev: this.brackets,
			prevDelim: this.delimiters,
			index: this.pos,
			image,
			active: true,
		};
		return node;
	}

	/** `]`: resolve a link/image against the open bracket, or emit literal `]`. */
	private parseCloseBracket(): InlineAstNode {
		this.pos++;
		const opener: Bracket | null = this.brackets;
		if (!opener || !opener.active) {
			if (opener) this.brackets = opener.prev;
			return makeNode('text', ']');
		}

		const dest: { href: string; title: string } | null = this.parseLinkTarget(opener);
		if (!dest) {
			this.brackets = opener.prev;
			return makeNode('text', ']');
		}

		const wrapper: InlineAstNode = makeNode(opener.image ? 'image' : 'link');
		wrapper.href = dest.href;
		wrapper.title = dest.title;

		// Move the nodes between the opener and now into the wrapper.
		let node: InlineAstNode | null = opener.node.next;
		while (node) {
			const next: InlineAstNode | null = node.next;
			unlink(node);
			wrapper.children.push(node);
			node = next;
		}
		if (opener.image) {
			wrapper.alt = astPlainText(wrapper.children);
			wrapper.children = [];
		}

		insertAfter(opener.node, wrapper);
		unlink(opener.node);
		this.processEmphasis(opener.prevDelim);

		// Links cannot contain other links.
		if (!opener.image) {
			let b: Bracket | null = opener.prev;
			while (b) {
				if (!b.image) b.active = false;
				b = b.prev;
			}
		}
		this.brackets = opener.prev;
		return wrapper;
	}

	/** Parses an inline `(dest "title")` or a reference `[label]` target. */
	private parseLinkTarget(opener: Bracket): { href: string; title: string } | null {
		if (this.text[this.pos] === '(') {
			const inline = this.parseInlineDestination();
			if (inline) return inline;
		}
		// Reference link: [label][ref], [label][], or shortcut [label].
		const label: string = this.text.slice(opener.index, this.pos - 1);
		let ref: string = label;
		// Position to advance to *only* when the reference resolves. A failed
		// lookup must leave `this.pos` at the `]` so the trailing `[ref]` re-parses
		// as literal text — otherwise `[text][missing]` silently drops `[missing]`.
		let resolvedEnd: number = this.pos;
		if (this.text[this.pos] === '[') {
			const close: number = this.text.indexOf(']', this.pos + 1);
			if (close !== -1) {
				const explicit: string = this.text.slice(this.pos + 1, close);
				if (explicit.trim() !== '') ref = explicit;
				resolvedEnd = close + 1;
			}
		}
		const found = this.ctx.linkRefs.get(ref.trim().toLowerCase());
		if (found) {
			this.pos = resolvedEnd;
			return { href: found.href, title: found.title ?? '' };
		}
		return null;
	}

	/** Parses `(url "title")` starting at the current `(`; returns null if malformed. */
	private parseInlineDestination(): { href: string; title: string } | null {
		let i: number = this.pos + 1;
		while (this.text[i] === ' ' || this.text[i] === '\n') i++;

		let href = '';
		if (this.text[i] === '<') {
			const end: number = this.text.indexOf('>', i);
			if (end === -1) return null;
			href = this.text.slice(i + 1, end);
			i = end + 1;
		} else {
			let depth = 0;
			// Bound the destination scan: real URLs are short, and an unbounded scan
			// over adversarial input (`](](]( …` with no closing paren) is quadratic.
			const limit: number = Math.min(this.len, i + MAX_DESTINATION_LENGTH);
			while (i < limit) {
				const ch: string = this.text[i] ?? '';
				if (ch === '\\' && ESCAPABLE.test(this.text[i + 1] ?? '')) {
					href += this.text[i + 1];
					i += 2;
					continue;
				}
				if (ch === '(') depth++;
				else if (ch === ')') {
					if (depth === 0) break;
					depth--;
				} else if (/\s/.test(ch) || ch === '[' || ch === ']') {
					// Whitespace ends a bare destination; `[`/`]` are not valid there
					// (real URLs percent-encode them) and bailing here keeps degenerate
					// `](](]( …` input linear instead of quadratic (D1 ReDoS guard).
					break;
				}
				href += ch;
				i++;
			}
			// Scan hit the length cap without resolving a closing paren: not a link.
			if (i >= limit && this.text[i] !== ')') return null;
		}

		while (this.text[i] === ' ' || this.text[i] === '\n') i++;
		let title = '';
		const quote: string = this.text[i] ?? '';
		if (quote === '"' || quote === "'") {
			const end: number = this.text.indexOf(quote, i + 1);
			if (end === -1) return null;
			title = this.text.slice(i + 1, end);
			i = end + 1;
		}
		while (this.text[i] === ' ' || this.text[i] === '\n') i++;
		if (this.text[i] !== ')') return null;
		this.pos = i + 1;
		return { href, title };
	}

	/** `&`: decodes an HTML entity reference, or emits a literal `&`. */
	private parseEntity(): InlineAstNode {
		const rest: string = this.text.slice(this.pos);
		const match: RegExpMatchArray | null = rest.match(
			/^&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});/,
		);
		if (!match?.[1]) {
			this.pos++;
			return makeNode('text', '&');
		}
		this.pos += match[0].length;
		return makeNode('text', decodeEntity(match[1]));
	}

	/** `<`: autolink, inline HTML (balanced fallback run), or literal. */
	private parseLessThan(): InlineAstNode {
		const auto: InlineAstNode | null = this.parseAutolink();
		if (auto) return auto;
		const html: InlineAstNode | null = this.parseInlineHtml();
		if (html) return html;
		this.pos++;
		return makeNode('text', '<');
	}

	private parseAutolink(): InlineAstNode | null {
		const rest: string = this.text.slice(this.pos);
		const uri: RegExpMatchArray | null = rest.match(/^<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^<>\s]*)>/);
		if (uri?.[1]) {
			this.pos += uri[0].length;
			const node: InlineAstNode = makeNode('link');
			node.href = uri[1];
			node.children = [makeNode('text', uri[1])];
			return node;
		}
		const email: RegExpMatchArray | null = rest.match(
			/^<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/,
		);
		if (email?.[1]) {
			this.pos += email[0].length;
			const node: InlineAstNode = makeNode('link');
			node.href = `mailto:${email[1]}`;
			node.children = [makeNode('text', email[1])];
			return node;
		}
		return null;
	}

	/** Captures a balanced inline-HTML fallback run (`<u>…</u>`) or a single tag. */
	private parseInlineHtml(): InlineAstNode | null {
		const rest: string = this.text.slice(this.pos);
		const open: RegExpMatchArray | null = rest.match(/^<([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^<>]*)?>/);
		if (!open?.[1]) {
			const comment: RegExpMatchArray | null = rest.match(/^<!--[\s\S]*?-->/);
			if (comment) {
				this.pos += comment[0].length;
				return makeNode('html_inline', comment[0]);
			}
			return null;
		}
		const tag: string = open[1].toLowerCase();
		if (INLINE_HTML_TAGS.has(tag)) {
			const closeTag = `</${tag}>`;
			const closeIdx: number = this.text.toLowerCase().indexOf(closeTag, this.pos + open[0].length);
			if (closeIdx !== -1) {
				const end: number = closeIdx + closeTag.length;
				const html: string = this.text.slice(this.pos, end);
				this.pos = end;
				return makeNode('html_inline', html);
			}
		}
		this.pos += open[0].length;
		return makeNode('html_inline', open[0]);
	}

	/**
	 * The CommonMark emphasis algorithm: walk closers, match against openers,
	 * wrap the enclosed nodes, honoring the rule-of-three for `*` / `_`.
	 *
	 * `openersBottom` is the CommonMark "lower bound for opener searches" cache.
	 * It must be keyed by `(delimiter char, canOpen, origdelims % 3)` — exactly
	 * the bucketing used by the reference implementation — because the rule-of-
	 * three test depends on both flags. Keying by the character alone lets a
	 * `canOpen=false` closer that fails lower the bound for a later `canOpen=true`
	 * closer of a different length class, silently dropping valid emphasis (e.g.
	 * `**a*b*c**` would lose all of its bold/italic).
	 */
	private processEmphasis(stackBottom: Delimiter | null): void {
		const openersBottom = new Map<string, Delimiter | null>();
		const bottomFor = (d: Delimiter): Delimiter | null => {
			const key: string = emphBottomKey(d);
			return openersBottom.has(key) ? (openersBottom.get(key) ?? null) : stackBottom;
		};

		let closer: Delimiter | null = stackBottom ? stackBottom.next : this.firstDelimiter();
		while (closer) {
			if (!closer.canClose) {
				closer = closer.next;
				continue;
			}
			const cc: string = closer.cc;
			let opener: Delimiter | null = closer.prev;
			let openerFound = false;
			const bottom: Delimiter | null = bottomFor(closer);
			while (opener && opener !== stackBottom && opener !== bottom) {
				if (opener.cc === cc && opener.canOpen && this.emphMatches(opener, closer)) {
					openerFound = true;
					break;
				}
				opener = opener.prev;
			}

			if (!openerFound) {
				openersBottom.set(emphBottomKey(closer), closer.prev);
				if (!closer.canOpen) this.removeDelimiter(closer);
				closer = closer.next;
				continue;
			}

			const matchedOpener: Delimiter = opener as Delimiter;
			const use: number = this.wrapCount(cc, matchedOpener, closer);
			if (use === 0) {
				closer = closer.next;
				continue;
			}

			this.wrapEmphasis(cc, matchedOpener, closer, use);

			matchedOpener.numdelims -= use;
			closer.numdelims -= use;
			matchedOpener.node.literal = matchedOpener.node.literal.slice(use);
			closer.node.literal = closer.node.literal.slice(use);

			this.removeDelimitersBetween(matchedOpener, closer);
			if (matchedOpener.numdelims === 0) this.removeDelimiter(matchedOpener);
			if (closer.numdelims === 0) {
				const next: Delimiter | null = closer.next;
				this.removeDelimiter(closer);
				closer = next;
			}
		}

		// Remove all delimiters above stackBottom.
		while (this.delimiters && this.delimiters !== stackBottom) {
			this.removeDelimiter(this.delimiters);
		}
	}

	private firstDelimiter(): Delimiter | null {
		let d: Delimiter | null = this.delimiters;
		while (d?.prev) d = d.prev;
		return d;
	}

	/** Rule-of-three test for `*` / `_`; other delimiters always match. */
	private emphMatches(opener: Delimiter, closer: Delimiter): boolean {
		if (opener.cc !== '*' && opener.cc !== '_') return true;
		const oddMatch: boolean =
			(closer.canOpen || opener.canClose) &&
			closer.origdelims % 3 !== 0 &&
			(opener.origdelims + closer.origdelims) % 3 === 0;
		return !oddMatch;
	}

	/** How many delimiters this match consumes (and implicitly which wrapper kind). */
	private wrapCount(cc: string, opener: Delimiter, closer: Delimiter): number {
		const both2: boolean = opener.numdelims >= 2 && closer.numdelims >= 2;
		if (cc === '*' || cc === '_') return both2 ? 2 : 1;
		if (cc === '~') {
			if (this.ctx.opts.gfm && both2) return 2;
			return this.ctx.opts.extendedInlineSyntax ? 1 : 0;
		}
		if (cc === '=') return this.ctx.opts.extendedInlineSyntax && both2 ? 2 : 0;
		if (cc === '^') return this.ctx.opts.extendedInlineSyntax ? 1 : 0;
		return 0;
	}

	private wrapKind(cc: string, use: number): InlineKind {
		if (cc === '*' || cc === '_') return use === 2 ? 'strong' : 'emph';
		if (cc === '~') return use === 2 ? 'strike' : 'sub';
		if (cc === '=') return 'highlight';
		return 'sup';
	}

	/** Moves nodes between opener and closer into a new wrapper node. */
	private wrapEmphasis(cc: string, opener: Delimiter, closer: Delimiter, use: number): void {
		const wrapper: InlineAstNode = makeNode(this.wrapKind(cc, use));
		let node: InlineAstNode | null = opener.node.next;
		while (node && node !== closer.node) {
			const next: InlineAstNode | null = node.next;
			unlink(node);
			wrapper.children.push(node);
			node = next;
		}
		insertAfter(opener.node, wrapper);
	}

	private removeDelimitersBetween(opener: Delimiter, closer: Delimiter): void {
		let d: Delimiter | null = closer.prev;
		while (d && d !== opener) {
			const prev: Delimiter | null = d.prev;
			this.removeDelimiter(d);
			d = prev;
		}
	}

	private removeDelimiter(delim: Delimiter): void {
		if (delim.prev) delim.prev.next = delim.next;
		if (delim.next) delim.next.prev = delim.prev;
		if (!delim.next) this.delimiters = delim.prev;
	}
}

/**
 * The `openersBottom` bucket key for a closer: `(char, canOpen, origdelims % 3)`,
 * mirroring the CommonMark reference implementation's index (`base + (canOpen ?
 * 3 : 0) + (origdelims % 3)`). `origdelims` is used, not the live `numdelims`, so
 * the key is stable across the delimiter's consumption.
 */
function emphBottomKey(d: Delimiter): string {
	return `${d.cc}${d.canOpen ? 1 : 0}${d.origdelims % 3}`;
}

/** Collects the sibling list after the synthetic root into an array. */
function collectSiblings(root: InlineAstNode): InlineAstNode[] {
	const out: InlineAstNode[] = [];
	let node: InlineAstNode | null = root.next;
	while (node) {
		out.push(node);
		node = node.next;
	}
	return out;
}

/** Extracts the plain-text content of an AST subtree (for image alt text). */
function astPlainText(nodes: readonly InlineAstNode[]): string {
	let out = '';
	for (const node of nodes) {
		if (node.type === 'text' || node.type === 'code') out += node.literal;
		else if (node.type === 'softbreak' || node.type === 'hardbreak') out += ' ';
		else if (node.children.length) out += astPlainText(node.children);
		else if (node.alt) out += node.alt;
	}
	return out;
}

// --- Flatten AST → notectl inline content ---

const KIND_TO_MARK: Partial<Record<InlineKind, string>> = {
	emph: 'italic',
	strong: 'bold',
	strike: 'strikethrough',
	highlight: 'highlight',
	sup: 'superscript',
	sub: 'subscript',
};

/** Whether a mark type is usable (no registry means tests; allow all). */
function markAllowed(ctx: ParseContext, type: string): boolean {
	return !ctx.registry || ctx.registry.getMarkSpec(type) !== undefined;
}

function flatten(
	nodes: readonly InlineAstNode[],
	marks: readonly Mark[],
	ctx: ParseContext,
	out: (TextNode | InlineNode)[],
): void {
	for (const node of nodes) {
		flattenNode(node, marks, ctx, out);
	}
}

function flattenNode(
	node: InlineAstNode,
	marks: readonly Mark[],
	ctx: ParseContext,
	out: (TextNode | InlineNode)[],
): void {
	switch (node.type) {
		case 'text':
			if (node.literal) out.push(createTextNode(node.literal, [...marks]));
			return;
		case 'softbreak':
			out.push(createTextNode(' ', [...marks]));
			return;
		case 'hardbreak':
			out.push(createInlineNode(inlineType('hard_break'), {}));
			return;
		case 'code':
			out.push(createTextNode(node.literal, withMark(marks, ctx, 'code')));
			return;
		case 'link': {
			const attrs: Record<string, string> = { href: node.href };
			if (node.title) attrs.title = node.title;
			flatten(node.children, withMark(marks, ctx, 'link', attrs), ctx, out);
			return;
		}
		case 'image': {
			pushImage(node, marks, ctx, out);
			return;
		}
		case 'inline_node':
			out.push(createInlineNode(inlineType(node.inlineType) as InlineTypeName, node.attrs));
			return;
		case 'html_inline':
			pushInlineHtml(node.literal, marks, ctx, out);
			return;
		default: {
			const markName: string | undefined = KIND_TO_MARK[node.type];
			if (markName) {
				flatten(node.children, withMark(marks, ctx, markName), ctx, out);
			} else {
				flatten(node.children, marks, ctx, out);
			}
		}
	}
}

/** Returns `marks` plus a new mark of `type` (with attrs), if the schema allows it. */
function withMark(
	marks: readonly Mark[],
	ctx: ParseContext,
	type: string,
	attrs?: Record<string, string | number | boolean>,
): Mark[] {
	if (!markAllowed(ctx, type)) return [...marks];
	const mark: Mark = attrs ? { type: markType(type), attrs } : { type: markType(type) };
	return [...marks, mark];
}

/** Emits an inline image node, or degrades to alt text when unavailable. */
function pushImage(
	node: InlineAstNode,
	marks: readonly Mark[],
	ctx: ParseContext,
	out: (TextNode | InlineNode)[],
): void {
	const hasInlineImage: boolean =
		!ctx.registry || ctx.registry.getInlineNodeSpec('image_inline') !== undefined;
	if (hasInlineImage) {
		const attrs: Record<string, string> = { src: node.href, alt: node.alt };
		if (node.title) attrs.title = node.title;
		out.push(createInlineNode(inlineType('image_inline'), attrs));
		return;
	}
	if (node.alt) out.push(createTextNode(node.alt, [...marks]));
}

/** Re-parses an inline-HTML fallback run via the HTML parser to recover marks. */
function pushInlineHtml(
	html: string,
	marks: readonly Mark[],
	ctx: ParseContext,
	out: (TextNode | InlineNode)[],
): void {
	if (!ctx.registry) {
		out.push(createTextNode(html, [...marks]));
		return;
	}
	const doc = parseHTMLToDocument(`<p>${html}</p>`, ctx.registry);
	const block = doc.children[0];
	if (!block) return;
	for (const child of block.children) {
		if ('text' in child) {
			out.push(createTextNode(child.text, mergeMarks(marks, child.marks)));
		} else if ('inlineType' in child) {
			out.push(child);
		}
	}
}

/** Merges two mark lists, de-duplicating by type. */
function mergeMarks(outer: readonly Mark[], inner: readonly Mark[]): Mark[] {
	const result: Mark[] = [...outer];
	for (const mark of inner) {
		if (!result.some((m) => m.type === mark.type)) result.push(mark);
	}
	return result;
}

/** Merges adjacent text nodes that share an identical mark set. */
function mergeAdjacentText(nodes: readonly (TextNode | InlineNode)[]): (TextNode | InlineNode)[] {
	const result: (TextNode | InlineNode)[] = [];
	for (const node of nodes) {
		const prev = result[result.length - 1];
		if ('text' in node && prev && 'text' in prev && sameMarkTypes(prev.marks, node.marks)) {
			result[result.length - 1] = { type: 'text', text: prev.text + node.text, marks: prev.marks };
		} else {
			result.push(node);
		}
	}
	return result;
}

/** Structural equality of two mark lists (type + attrs, order-independent). */
function sameMarkTypes(a: readonly Mark[], b: readonly Mark[]): boolean {
	if (a.length !== b.length) return false;
	const key = (m: Mark): string => `${m.type}:${JSON.stringify(m.attrs ?? {})}`;
	const setB = new Set(b.map(key));
	return a.every((m) => setB.has(key(m)));
}

/** Parses inline Markdown into text/inline nodes (linear-time, ReDoS-safe). */
export function parseInline(text: string, ctx: ParseContext): (TextNode | InlineNode)[] {
	const ast: InlineAstNode[] = new InlineParser(text, ctx).parse();
	const out: (TextNode | InlineNode)[] = [];
	flatten(ast, [], ctx, out);
	const merged: (TextNode | InlineNode)[] = mergeAdjacentText(out);
	return merged.length > 0 ? merged : [createTextNode('')];
}
