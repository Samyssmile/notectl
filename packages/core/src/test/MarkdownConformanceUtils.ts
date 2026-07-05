/**
 * Shared helpers for the Markdown conformance gates (dev/test only).
 *
 * Both gates compare a **normalized structural rendering** instead of byte
 * HTML (D1): notectl deliberately produces different HTML than a generic
 * renderer (block IDs, schema tags, flat lists), so the comparison happens on
 * the model. `documentStructure` renders a parsed `Document`;
 * `specHtmlToStructure` renders a CommonMark/GFM spec example's expected HTML
 * into the same structural string, normalizing model-level equivalences
 * (tight vs. loose lists, nested lists to flat-with-indent, softbreaks to
 * spaces). Expected HTML that uses constructs outside notectl's model reports
 * `unsupported` with the offending construct, so the spec gate can classify
 * the example as out of scope instead of failing blindly.
 */

import type { BlockNode, Document, InlineNode, TextNode } from '../model/Document.js';
import { getBlockChildren, getInlineChildren, isLeafBlock } from '../model/Document.js';

// --- Document → structure ---

/** Renders a parsed Document to the normalized structural comparison string. */
export function documentStructure(doc: Document): string {
	return doc.children.map(renderBlock).join('\n');
}

function renderBlock(block: BlockNode): string {
	const attrs: string = block.attrs ? renderAttrs(block.attrs) : '';
	if (isLeafBlock(block)) {
		return `${block.type}${attrs}{${renderInline(getInlineChildren(block))}}`;
	}
	return `${block.type}${attrs}[${getBlockChildren(block).map(renderBlock).join(',')}]`;
}

function renderAttrs(attrs: Record<string, unknown>): string {
	const keys: string[] = Object.keys(attrs).sort();
	if (keys.length === 0) return '';
	return `<${keys.map((k) => `${k}=${String(attrs[k])}`).join(',')}>`;
}

function renderMarks(marks: readonly { type: string; attrs?: Record<string, unknown> }[]): string {
	return marks
		.map((m) => (m.attrs ? `${m.type}(${renderAttrs(normalizeUrlAttrs(m.attrs))})` : m.type))
		.sort()
		.join('+');
}

/**
 * Canonicalizes URL-bearing attributes for comparison: the spec's expected
 * HTML percent-encodes destinations (`föö` → `f%C3%B6%C3%B6`) while the model
 * keeps the raw author string, so both sides round through
 * `encodeURI(decodeURI(...))` before comparing.
 */
function normalizeUrlAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = { ...attrs };
	for (const key of ['href', 'src']) {
		if (typeof out[key] === 'string') out[key] = normalizeUrl(out[key] as string);
	}
	return out;
}

function normalizeUrl(url: string): string {
	try {
		return encodeURI(decodeURI(url));
	} catch {
		try {
			return encodeURI(url);
		} catch {
			return url;
		}
	}
}

function renderInline(children: readonly (TextNode | InlineNode)[]): string {
	return children
		.map((child) => {
			if ('text' in child) {
				const marks: string = renderMarks(child.marks);
				return marks ? `${child.text}[${marks}]` : child.text;
			}
			// Inline nodes carry marks too (e.g. a link on an inline image).
			const marks: string = renderMarks(child.marks);
			const node = `<${child.inlineType}:${renderAttrs(normalizeUrlAttrs(child.attrs))}>`;
			return marks ? `${node}[${marks}]` : node;
		})
		.join('');
}

// --- Spec expected-HTML → structure ---

/** Result of converting expected spec HTML: a structure, or why it cannot be one. */
export type SpecHtmlResult = { readonly structure: string } | { readonly unsupported: string };

interface InlineSegment {
	text?: string;
	node?: { type: string; attrs: Record<string, string> };
	marks: SegmentMark[];
}

interface SegmentMark {
	type: string;
	attrs?: Record<string, string>;
}

class UnsupportedConstruct extends Error {}

/** Converts a spec example's expected HTML into the structural string. */
export function specHtmlToStructure(html: string): SpecHtmlResult {
	const holder: HTMLElement = document.createElement('div');
	holder.innerHTML = html;
	try {
		const blocks: string[] = [];
		for (const child of Array.from(holder.childNodes)) {
			convertBlockNode(child, 0, blocks);
		}
		return { structure: blocks.join('\n') };
	} catch (error) {
		if (error instanceof UnsupportedConstruct) return { unsupported: error.message };
		throw error;
	}
}

function convertBlockNode(node: Node, listIndent: number, out: string[]): void {
	if (node.nodeType === 3) {
		if ((node.textContent ?? '').trim() !== '') {
			throw new UnsupportedConstruct('bare text at block level');
		}
		return;
	}
	if (node.nodeType !== 1) return;
	const el = node as Element;
	const tag: string = el.tagName.toLowerCase();

	switch (tag) {
		case 'p':
			out.push(convertParagraph(el));
			return;
		case 'h1':
		case 'h2':
		case 'h3':
		case 'h4':
		case 'h5':
		case 'h6':
			out.push(`heading<level=${tag[1]}>{${convertInline(el)}}`);
			return;
		case 'hr':
			out.push('horizontal_rule{}');
			return;
		case 'pre':
			out.push(convertCodeBlock(el));
			return;
		case 'blockquote': {
			const inner: string[] = [];
			for (const child of Array.from(el.childNodes)) convertBlockNode(child, 0, inner);
			if (inner.length === 0) inner.push('paragraph{}');
			out.push(`blockquote[${inner.join(',')}]`);
			return;
		}
		case 'ul':
		case 'ol':
			convertList(el, tag === 'ol', listIndent, out);
			return;
		case 'table':
			out.push(convertTable(el));
			return;
		default:
			throw new UnsupportedConstruct(`block element <${tag}>`);
	}
}

/** A `<p>` whose only child is a plain `<img>` mirrors the standalone-image promotion. */
function convertParagraph(el: Element): string {
	const children: Node[] = Array.from(el.childNodes);
	const onlyImage: Element | null =
		children.length === 1 &&
		children[0]?.nodeType === 1 &&
		(children[0] as Element).tagName.toLowerCase() === 'img'
			? (children[0] as Element)
			: null;
	if (onlyImage) {
		const attrs: Record<string, string> = {
			align: 'center',
			alt: onlyImage.getAttribute('alt') ?? '',
			src: onlyImage.getAttribute('src') ?? '',
		};
		const title: string | null = onlyImage.getAttribute('title');
		if (title) attrs.title = title;
		return `image${renderAttrs(normalizeUrlAttrs(attrs))}{}`;
	}
	return `paragraph{${convertInline(el)}}`;
}

function convertCodeBlock(el: Element): string {
	const code: Element | null = el.querySelector('code');
	if (!code) throw new UnsupportedConstruct('<pre> without <code>');
	const cls: string = code.getAttribute('class') ?? '';
	const language: string = cls.startsWith('language-') ? cls.slice('language-'.length) : '';
	const text: string = (code.textContent ?? '').replace(/\n$/, '');
	return `code_block<language=${language}>{${text}}`;
}

/** Flattens nested `<ul>`/`<ol>` into the flat-with-indent list model. */
function convertList(el: Element, ordered: boolean, indent: number, out: string[]): void {
	for (const child of Array.from(el.children)) {
		if (child.tagName.toLowerCase() !== 'li') {
			throw new UnsupportedConstruct(`<${child.tagName.toLowerCase()}> inside a list`);
		}
		convertListItem(child, ordered, indent, out);
	}
}

/**
 * Converts a `<li>`. Single-paragraph/inline items render as leaves; items
 * with further block children (second paragraph, code, quote, heading, hr)
 * render as containers with block children (#194). Nested `<ul>`/`<ol>` are
 * hoisted into flat siblings one indent deeper (the flat-with-indent sibling
 * model); block content *after* a nested list cannot keep its item-relative
 * order in that model and stays unsupported (gate B).
 */
function convertListItem(li: Element, ordered: boolean, indent: number, out: string[]): void {
	const nestedLists: Element[] = [];
	const blockChildren: string[] = [];
	const inlineHolder: Element = document.createElement('div');
	let checked: boolean | null = null;
	let sawLeadingParagraph = false;

	for (const child of Array.from(li.childNodes)) {
		if (child.nodeType !== 1) {
			const isWhitespace: boolean = (child.textContent ?? '').trim() === '';
			if (blockChildren.length > 0 || nestedLists.length > 0) {
				if (isWhitespace) continue;
				throw new UnsupportedConstruct('inline content after block content in a list item');
			}
			inlineHolder.appendChild(child.cloneNode(true));
			continue;
		}

		const el = child as Element;
		const tag: string = el.tagName.toLowerCase();
		if (tag === 'ul' || tag === 'ol') {
			nestedLists.push(el);
			continue;
		}
		if (tag === 'input') {
			// GFM task list checkbox.
			checked = el.hasAttribute('checked');
			continue;
		}
		const leading: boolean = blockChildren.length === 0 && nestedLists.length === 0;
		if (tag === 'p' && leading && !sawLeadingParagraph) {
			sawLeadingParagraph = true;
			for (const inner of Array.from(el.childNodes)) {
				inlineHolder.appendChild(inner.cloneNode(true));
			}
			continue;
		}
		if (isInlineTag(tag)) {
			if (!leading) {
				throw new UnsupportedConstruct('inline content after block content in a list item');
			}
			inlineHolder.appendChild(child.cloneNode(true));
			continue;
		}
		// A further block child: hoisted nested lists cannot keep block content
		// that follows them in item-relative order — unsupported (gate B).
		if (nestedLists.length > 0) {
			throw new UnsupportedConstruct('block content after a nested list in a list item');
		}
		convertBlockNode(child, 0, blockChildren);
	}

	const listType: string = checked !== null ? 'checklist' : ordered ? 'ordered' : 'bullet';
	const attrs: Record<string, string> = {
		checked: String(checked === true),
		indent: String(indent),
		listType,
	};
	// Edge whitespace in the expected HTML is formatting (loose-list newlines,
	// the gap after a task checkbox); the model trims item text.
	const inline: string = convertInline(inlineHolder).trim();
	if (blockChildren.length === 0) {
		out.push(`list_item${renderAttrs(attrs)}{${inline}}`);
	} else {
		const children: string[] =
			inline === '' ? blockChildren : [`paragraph{${inline}}`, ...blockChildren];
		out.push(`list_item${renderAttrs(attrs)}[${children.join(',')}]`);
	}
	for (const nested of nestedLists) {
		convertList(nested, nested.tagName.toLowerCase() === 'ol', indent + 1, out);
	}
}

function convertTable(table: Element): string {
	const rows: string[] = [];
	for (const tr of Array.from(table.querySelectorAll('tr'))) {
		const cells: string[] = [];
		for (const cell of Array.from(tr.children)) {
			const tag: string = cell.tagName.toLowerCase();
			if (tag !== 'td' && tag !== 'th') {
				throw new UnsupportedConstruct(`<${tag}> inside a table row`);
			}
			const align: string | null = mapTableAlign(cell.getAttribute('align'));
			const attrs: string = align ? `<align=${align}>` : '';
			cells.push(`table_cell[paragraph${attrs}{${convertInline(cell)}}]`);
		}
		rows.push(`table_row[${cells.join(',')}]`);
	}
	return `table[${rows.join(',')}]`;
}

function mapTableAlign(align: string | null): string | null {
	if (align === 'left') return 'start';
	if (align === 'center') return 'center';
	if (align === 'right') return 'end';
	return null;
}

const INLINE_TAGS: ReadonlySet<string> = new Set(['em', 'strong', 'code', 'del', 'a', 'img', 'br']);

function isInlineTag(tag: string): boolean {
	return INLINE_TAGS.has(tag);
}

/** Converts an element's inline content to the structural inline rendering. */
function convertInline(el: Element): string {
	const segments: InlineSegment[] = [];
	collectInline(el, [], segments);
	return renderSegments(mergeSegments(segments));
}

function collectInline(el: Element, marks: readonly SegmentMark[], out: InlineSegment[]): void {
	for (const child of Array.from(el.childNodes)) {
		if (child.nodeType === 3) {
			// Softbreaks render as literal newlines in spec HTML; the model uses spaces.
			out.push({ text: (child.textContent ?? '').replace(/\n/g, ' '), marks: [...marks] });
			continue;
		}
		if (child.nodeType !== 1) continue;
		const element = child as Element;
		const tag: string = element.tagName.toLowerCase();
		switch (tag) {
			case 'em':
				collectInline(element, [...marks, { type: 'italic' }], out);
				break;
			case 'strong':
				collectInline(element, [...marks, { type: 'bold' }], out);
				break;
			case 'del':
				collectInline(element, [...marks, { type: 'strikethrough' }], out);
				break;
			case 'code':
				out.push({
					text: element.textContent ?? '',
					marks: [...marks, { type: 'code' }],
				});
				break;
			case 'a': {
				const attrs: Record<string, string> = { href: element.getAttribute('href') ?? '' };
				const title: string | null = element.getAttribute('title');
				if (title) attrs.title = title;
				collectInline(element, [...marks, { type: 'link', attrs }], out);
				break;
			}
			case 'input':
				// Task-list checkbox metadata is handled by the list converter.
				break;
			case 'img': {
				const attrs: Record<string, string> = {
					alt: element.getAttribute('alt') ?? '',
					src: element.getAttribute('src') ?? '',
				};
				const title: string | null = element.getAttribute('title');
				if (title) attrs.title = title;
				out.push({ node: { type: 'image_inline', attrs }, marks: [...marks] });
				break;
			}
			case 'br':
				out.push({ node: { type: 'hard_break', attrs: {} }, marks: [] });
				break;
			default:
				throw new UnsupportedConstruct(`inline element <${tag}>`);
		}
	}
}

/**
 * Merges adjacent text segments with equal mark sets and drops empty text.
 * Whitespace directly after a hard break is source formatting (the `<br />`
 * sits at a line end in spec HTML); the model's hard break consumes it.
 */
function mergeSegments(segments: readonly InlineSegment[]): InlineSegment[] {
	const out: InlineSegment[] = [];
	for (const segment of segments) {
		const prev: InlineSegment | undefined = out[out.length - 1];
		const normalized: InlineSegment =
			prev?.node?.type === 'hard_break' && segment.text !== undefined
				? { ...segment, text: segment.text.replace(/^[ ]+/, '') }
				: segment;
		if (normalized.text === '') continue;
		if (
			prev &&
			prev.text !== undefined &&
			normalized.text !== undefined &&
			sameMarks(prev.marks, normalized.marks)
		) {
			prev.text += normalized.text;
			continue;
		}
		out.push({ ...normalized, marks: [...normalized.marks] });
	}
	return out;
}

function sameMarks(a: readonly SegmentMark[], b: readonly SegmentMark[]): boolean {
	if (a.length !== b.length) return false;
	const key = (m: SegmentMark): string => `${m.type}:${JSON.stringify(m.attrs ?? {})}`;
	const setB = new Set(b.map(key));
	return a.every((m) => setB.has(key(m)));
}

function renderSegments(segments: readonly InlineSegment[]): string {
	return segments
		.map((segment) => {
			const marks: string = renderMarks(segment.marks);
			if (segment.node) {
				const node = `<${segment.node.type}:${renderAttrs(segment.node.attrs)}>`;
				return marks ? `${node}[${marks}]` : node;
			}
			return marks ? `${segment.text}[${marks}]` : (segment.text ?? '');
		})
		.join('');
}
