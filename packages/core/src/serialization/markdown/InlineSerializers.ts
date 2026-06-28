/**
 * Inline Markdown serialization: marks (emphasis nesting), code spans, links and
 * inline nodes. Marks with no portable Markdown form (underline, highlight, …)
 * fall back to raw inline HTML via the existing `MarkSerializer` (D3).
 *
 * Emphasis delimiters are emitted with a ProseMirror-markdown-style
 * reconciliation: shared "mixable" marks keep their open position across
 * adjacent text runs, so the serializer never produces ambiguous adjacent
 * delimiters (e.g. `**a*****b***`) that would mis-parse on round-trip.
 */

import type { InlineNode, Mark, TextNode } from '../../model/Document.js';
import { createTextNode, isInlineNode, markSetsEqual } from '../../model/Document.js';
import type { HTMLExportContext } from '../../model/NodeSpec.js';
import { serializeMarksToHTML } from '../MarkSerializer.js';
import { type SerContext, exportContext } from './MarkdownContext.js';
import {
	escapeInline,
	escapeLinkDestination,
	escapeLinkTitle,
	wrapCodeSpan,
} from './MarkdownEscape.js';

/** Inline HTML export context (inline-style mode) for HTML-fallback marks. */
const INLINE_HTML_CTX: HTMLExportContext = {
	styleAttr: (declarations: string) => (declarations ? ` style="${declarations}"` : ''),
};

/** Whether a mark is serialized as a Markdown delimiter (vs. HTML fallback / code). */
function isStackMark(mark: Mark, gfm: boolean): boolean {
	const t: string = mark.type;
	if (t === 'link' || t === 'bold' || t === 'italic') return true;
	if (t === 'strikethrough' && gfm) return true;
	return false;
}

/** Returns the open/close delimiter pair for a stack mark. */
function delimiters(mark: Mark, ctx: SerContext): { open: string; close: string } {
	const emphasis: string = ctx.opts.emphasis;
	switch (mark.type) {
		case 'bold':
			return { open: emphasis.repeat(2), close: emphasis.repeat(2) };
		case 'italic':
			return { open: emphasis, close: emphasis };
		case 'strikethrough':
			return { open: '~~', close: '~~' };
		default: {
			// link
			const href: string = String(mark.attrs?.href ?? '');
			const title: string = String(mark.attrs?.title ?? '');
			const dest: string = escapeLinkDestination(href);
			const titlePart: string = title ? ` "${escapeLinkTitle(title)}"` : '';
			return { open: '[', close: `](${dest}${titlePart})` };
		}
	}
}

/** Mixable marks may be reordered to keep shared marks open; link may not. */
function isMixable(mark: Mark): boolean {
	return mark.type !== 'link';
}

/** Structural equality for stack marks (type + attrs). */
function marksEqual(a: Mark, b: Mark): boolean {
	if (a.type !== b.type) return false;
	return JSON.stringify(a.attrs ?? {}) === JSON.stringify(b.attrs ?? {});
}

/** Collects the stack (delimiter) marks of a text node, link outermost. */
function stackMarksOf(node: TextNode, gfm: boolean): Mark[] {
	const link: Mark[] = [];
	const emphasis: Mark[] = [];
	for (const mark of node.marks) {
		if (!isStackMark(mark, gfm)) continue;
		if (mark.type === 'link') link.push(mark);
		else emphasis.push(mark);
	}
	return [...link, ...emphasis];
}

/**
 * Reorders a node's stack marks so that mixable marks already open (in `active`)
 * keep their position, minimizing close/reopen churn. Link stays outermost.
 */
function reorderToActive(marks: readonly Mark[], active: readonly Mark[]): Mark[] {
	const result: Mark[] = [];
	const remaining: Mark[] = [...marks];

	// Non-mixable (link) first, preserving its position.
	for (let i = remaining.length - 1; i >= 0; i--) {
		const mark = remaining[i];
		if (mark && !isMixable(mark)) {
			result.push(mark);
			remaining.splice(i, 1);
		}
	}

	// Then mixable marks already active, in active order.
	for (const a of active) {
		if (!isMixable(a)) continue;
		const idx: number = remaining.findIndex((m) => marksEqual(m, a));
		if (idx !== -1) {
			const found = remaining[idx];
			if (found) result.push(found);
			remaining.splice(idx, 1);
		}
	}

	// Finally any new mixable marks.
	for (const m of remaining) result.push(m);
	return result;
}

/** Renders the literal content of a text node (code span, HTML-fallback, or escaped text). */
function renderTextContent(node: TextNode, ctx: SerContext): string {
	if (node.text === '') return '';

	const hasCode: boolean = node.marks.some((m) => m.type === 'code');
	if (hasCode) return wrapCodeSpan(node.text);

	const gfm: boolean = ctx.opts.gfm;
	const fallbackMarks: Mark[] = node.marks.filter((m) => !isStackMark(m, gfm) && m.type !== 'code');

	if (fallbackMarks.length > 0 && ctx.opts.htmlFallback && ctx.registry) {
		return serializeMarksToHTML(
			node.text,
			fallbackMarks,
			ctx.registry,
			ctx.markOrder,
			INLINE_HTML_CTX,
		);
	}
	// htmlFallback off (or unknown registry): keep text, drop styling.
	return escapeInline(node.text, gfm);
}

/** Serializes a single inline node (hard break, inline image, math, plugin extensions). */
function serializeInlineNode(node: InlineNode, ctx: SerContext): string {
	if (node.inlineType === 'hard_break') return '\\\n';
	if (node.inlineType === 'image_inline') return serializeInlineImage(node, ctx);

	const spec = ctx.registry?.getInlineNodeSpec(node.inlineType);
	const md: string | null | undefined = spec?.toMarkdown?.(node, exportContext(ctx.opts));
	if (md != null) return md;

	if (ctx.opts.htmlFallback && spec?.toHTMLString) return spec.toHTMLString(node);
	return '';
}

/** Serializes an inline image node to `![alt](src "title")` (engine-owned standard construct). */
function serializeInlineImage(node: InlineNode, ctx: SerContext): string {
	const src: string = String(node.attrs.src ?? '');
	const alt: string = String(node.attrs.alt ?? '');
	const title: string = String(node.attrs.title ?? '');
	const titlePart: string = title ? ` "${escapeLinkTitle(title)}"` : '';
	return `![${escapeInline(alt, ctx.opts.gfm)}](${escapeLinkDestination(src)}${titlePart})`;
}

/** Merges adjacent text nodes with identical mark sets; inline nodes are boundaries. */
function mergeAdjacent(children: readonly (TextNode | InlineNode)[]): (TextNode | InlineNode)[] {
	const result: (TextNode | InlineNode)[] = [];
	for (const child of children) {
		const prev = result[result.length - 1];
		if (
			!isInlineNode(child) &&
			prev &&
			!isInlineNode(prev) &&
			markSetsEqual(prev.marks, child.marks)
		) {
			result[result.length - 1] = { type: 'text', text: prev.text + child.text, marks: prev.marks };
		} else {
			result.push(child);
		}
	}
	return result;
}

/** A flanking-sensitive emphasis mark (bold/italic/strike) whose delimiters must hug non-whitespace. */
function isFlankingMark(mark: Mark, gfm: boolean): boolean {
	return isStackMark(mark, gfm) && mark.type !== 'link';
}

/** Whether a sibling carries a mark equal to `mark` (false for inline nodes / no sibling). */
function siblingHasMark(node: TextNode | InlineNode | undefined, mark: Mark): boolean {
	if (!node || isInlineNode(node)) return false;
	return node.marks.some((m) => marksEqual(m, mark));
}

/** Length of the leading run of ASCII/Unicode whitespace in `text`. */
function leadingWhitespace(text: string): number {
	let i = 0;
	while (i < text.length && /\s/.test(text[i] as string)) i++;
	return i;
}

/** Length of the trailing run of whitespace in `text`. */
function trailingWhitespace(text: string): number {
	let i: number = text.length;
	while (i > 0 && /\s/.test(text[i - 1] as string)) i--;
	return text.length - i;
}

/** Returns `marks` with every mark in `strip` removed. */
function withoutMarks(marks: readonly Mark[], strip: readonly Mark[]): Mark[] {
	if (strip.length === 0) return [...marks];
	return marks.filter((m) => !strip.some((s) => marksEqual(s, m)));
}

/** Splits one text node's edge whitespace out of its flanking emphasis marks. */
function expelNodeWhitespace(
	node: TextNode,
	prev: TextNode | InlineNode | undefined,
	next: TextNode | InlineNode | undefined,
	gfm: boolean,
	out: (TextNode | InlineNode)[],
): void {
	const flanking: Mark[] = node.marks.filter((m) => isFlankingMark(m, gfm));
	if (flanking.length === 0) {
		out.push(node);
		return;
	}

	const text: string = node.text;
	const leadLen: number = leadingWhitespace(text);

	// All whitespace: a flanking mark survives only when interior on BOTH sides
	// (a same-mark neighbor before and after); otherwise it is expelled.
	if (leadLen === text.length) {
		const strip: Mark[] = flanking.filter(
			(m) => !(siblingHasMark(prev, m) && siblingHasMark(next, m)),
		);
		out.push(createTextNode(text, withoutMarks(node.marks, strip)));
		return;
	}

	const trailLen: number = trailingWhitespace(text);
	const lead: string = text.slice(0, leadLen);
	const core: string = text.slice(leadLen, text.length - trailLen);
	const trail: string = text.slice(text.length - trailLen);

	if (lead) {
		const strip: Mark[] = flanking.filter((m) => !siblingHasMark(prev, m));
		out.push(createTextNode(lead, withoutMarks(node.marks, strip)));
	}
	out.push(createTextNode(core, node.marks));
	if (trail) {
		const strip: Mark[] = flanking.filter((m) => !siblingHasMark(next, m));
		out.push(createTextNode(trail, withoutMarks(node.marks, strip)));
	}
}

/**
 * Expels whitespace from the edges of flanking-sensitive emphasis spans
 * (bold/italic/strikethrough). A `**` delimiter that hugs whitespace
 * (`**end **`) is not flanking, so CommonMark — and this engine's own parser —
 * read it literally, breaking the round-trip. Whitespace at a mark's span
 * boundary is moved outside the mark; whitespace interior to a span is kept.
 */
function expelEdgeWhitespace(
	children: readonly (TextNode | InlineNode)[],
	gfm: boolean,
): (TextNode | InlineNode)[] {
	const out: (TextNode | InlineNode)[] = [];
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (!child) continue;
		if (isInlineNode(child)) {
			out.push(child);
			continue;
		}
		expelNodeWhitespace(child, children[i - 1], children[i + 1], gfm, out);
	}
	return mergeAdjacent(out);
}

/** Serializes inline children of a leaf block to a Markdown string. */
export function serializeInlineContent(
	children: readonly (TextNode | InlineNode)[],
	ctx: SerContext,
): string {
	const gfm: boolean = ctx.opts.gfm;
	const merged: (TextNode | InlineNode)[] = expelEdgeWhitespace(mergeAdjacent(children), gfm);
	let out = '';
	let active: Mark[] = [];

	const closeFrom = (keep: number): void => {
		for (let i = active.length - 1; i >= keep; i--) {
			const mark = active[i];
			if (mark) out += delimiters(mark, ctx).close;
		}
		active = active.slice(0, keep);
	};

	for (const child of merged) {
		if (isInlineNode(child)) {
			closeFrom(0);
			out += serializeInlineNode(child, ctx);
			continue;
		}

		const target: Mark[] = reorderToActive(stackMarksOf(child, gfm), active);

		let keep = 0;
		while (
			keep < active.length &&
			keep < target.length &&
			marksEqual(active[keep] as Mark, target[keep] as Mark)
		) {
			keep++;
		}
		closeFrom(keep);
		for (let i = keep; i < target.length; i++) {
			const mark = target[i];
			if (!mark) continue;
			out += delimiters(mark, ctx).open;
			active.push(mark);
		}

		out += renderTextContent(child, ctx);
	}

	closeFrom(0);
	return out;
}
