/**
 * DocumentSerializer: converts an immutable Document into sanitized HTML.
 * Pure functions — operates on Document/SchemaRegistry, no class state.
 */

import DOMPurify from 'dompurify';
import { isNodeOfType } from '../model/AttrRegistry.js';
import type { BlockNode, Document, InlineNode, TextNode } from '../model/Document.js';
import {
	getBlockChildren,
	getInlineChildren,
	isInlineNode,
	isLeafBlock,
	isTextNode,
	markSetsEqual,
} from '../model/Document.js';
import { SAFE_URI_REGEXP, escapeAttr, escapeHTML } from '../model/HTMLUtils.js';
import type { HTMLExportContext } from '../model/NodeSpec.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { CSSClassCollector } from './CSSClassCollector.js';
import type { ContentCSSResult } from './ContentHTMLTypes.js';
import {
	buildMarkOrder,
	serializeMarksToClassHTML,
	serializeMarksToHTML,
} from './MarkSerializer.js';

/** Internal context threaded through all serialization helpers. */
interface SerializerContext {
	readonly registry?: SchemaRegistry;
	readonly collector?: CSSClassCollector;
	readonly exportCtx?: HTMLExportContext;
}

/** Known-safe alignment values accepted by the serializer (defense-in-depth). */
export const VALID_ALIGNMENTS: ReadonlySet<string> = new Set(['start', 'center', 'end', 'justify']);

/** Legacy physical → logical alignment mapping (mirrors DocumentParser). */
const LEGACY_ALIGNMENT_MAP: Readonly<Record<string, string>> = { left: 'start', right: 'end' };

/** Known-safe direction values (defense-in-depth). `auto` is excluded — it's the default. */
export const VALID_DIRECTIONS: ReadonlySet<string> = new Set(['ltr', 'rtl']);

/** Creates an HTMLExportContext for inline style mode. */
function createInlineExportContext(): HTMLExportContext {
	return {
		styleAttr(declarations: string): string {
			if (!declarations) return '';
			return ` style="${declarations}"`;
		},
	};
}

/** Creates an HTMLExportContext for CSS class mode. */
function createClassExportContext(collector: CSSClassCollector): HTMLExportContext {
	return {
		styleAttr(declarations: string): string {
			if (!declarations) return '';
			const className: string = collector.getClassName(declarations);
			return ` class="${className}"`;
		},
	};
}

/**
 * Injects or merges an attribute into the first opening tag of an HTML fragment.
 * Values are expected to be pre-escaped by the caller.
 */
function injectAttrIntoFirstTag(html: string, attr: string, value: string): string {
	const firstTagRange: { start: number; end: number } | undefined = findFirstOpeningTagRange(html);
	if (!firstTagRange) return html;
	const firstTag: string = html.slice(firstTagRange.start, firstTagRange.end + 1);
	const pattern: RegExp = new RegExp(`\\s${attr}\\s*=\\s*(\"([^\"]*)\"|'([^']*)')`);
	const existing: RegExpMatchArray | null = firstTag.match(pattern);
	if (existing) {
		const existingValue: string = existing[2] ?? existing[3] ?? '';
		if (attr === 'style' && /(?:^|;)\s*text-align\s*:/i.test(existingValue)) {
			return html;
		}
		const sep: string = attr === 'style' ? '; ' : ' ';
		const mergedAttr: string = ` ${attr}="${existingValue}${sep}${value}"`;
		const nextFirstTag: string = firstTag.replace(pattern, mergedAttr);
		return `${html.slice(0, firstTagRange.start)}${nextFirstTag}${html.slice(firstTagRange.end + 1)}`;
	}
	const isSelfClosing: boolean = firstTag.endsWith('/>');
	const injectedFirstTag: string = isSelfClosing
		? `${firstTag.slice(0, -2)} ${attr}="${value}"/>`
		: `${firstTag.slice(0, -1)} ${attr}="${value}">`;
	return `${html.slice(0, firstTagRange.start)}${injectedFirstTag}${html.slice(firstTagRange.end + 1)}`;
}

/** Finds the first opening tag range, treating `>` inside quotes as attribute text. */
function findFirstOpeningTagRange(html: string): { start: number; end: number } | undefined {
	let start: number = html.indexOf('<');
	while (start >= 0) {
		const nextChar: string | undefined = html[start + 1];
		if (nextChar && /[A-Za-z]/.test(nextChar)) {
			let quote: '"' | "'" | undefined;
			for (let i = start + 2; i < html.length; i++) {
				const char: string = html[i] ?? '';
				if (quote) {
					if (char === quote) quote = undefined;
					continue;
				}
				if (char === '"' || char === "'") {
					quote = char;
					continue;
				}
				if (char === '>') {
					return { start, end: i };
				}
			}
			return undefined;
		}
		start = html.indexOf('<', start + 1);
	}
	return undefined;
}

/** Serializes a full document to sanitized HTML, wrapping list items in `<ul>`/`<ol>`. */
export function serializeDocumentToHTML(doc: Document, registry?: SchemaRegistry): string {
	const exportCtx: HTMLExportContext = createInlineExportContext();
	const ctx: SerializerContext = { registry, exportCtx };
	const html: string = serializeBlocks(doc.children, ctx);

	const allowedTags: string[] = registry ? registry.getAllowedTags() : ['p', 'br', 'div', 'span'];
	const allowedAttrs: string[] = registry ? registry.getAllowedAttrs() : ['style', 'dir'];

	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS: allowedTags,
		ALLOWED_ATTR: allowedAttrs,
		ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
	});
}

/**
 * Serializes a document to HTML with CSS class names instead of inline styles.
 * Returns the HTML and a collected stylesheet with only the rules actually used.
 */
export function serializeDocumentToCSS(doc: Document, registry?: SchemaRegistry): ContentCSSResult {
	const collector = new CSSClassCollector();
	const exportCtx: HTMLExportContext = createClassExportContext(collector);
	const ctx: SerializerContext = { registry, collector, exportCtx };
	const html: string = serializeBlocks(doc.children, ctx);

	const allowedTags: string[] = registry ? registry.getAllowedTags() : ['p', 'br', 'div', 'span'];
	const allowedAttrs: string[] = registry ? registry.getAllowedAttrs() : ['style', 'class', 'dir'];

	// In class mode, allow `class` attribute through DOMPurify
	if (!allowedAttrs.includes('class')) {
		allowedAttrs.push('class');
	}

	// Defense-in-depth: strip `style` attribute in class mode to guarantee
	// zero inline styles — even from third-party plugins that forgot to use ctx.styleAttr().
	const filteredAttrs: string[] = allowedAttrs.filter((a) => a !== 'style');

	const sanitizedHTML: string = DOMPurify.sanitize(html, {
		ALLOWED_TAGS: allowedTags,
		ALLOWED_ATTR: filteredAttrs,
		ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
	});

	return { html: sanitizedHTML, css: collector.toCSS(), styleMap: collector.toStyleMap() };
}

/** Serializes a sequence of blocks to HTML, grouping consecutive list items into wrappers. */
function serializeBlocks(blocks: readonly BlockNode[], ctx: SerializerContext): string {
	const parts: string[] = [];
	let i = 0;

	while (i < blocks.length) {
		const block: BlockNode | undefined = blocks[i];
		if (!block) {
			i++;
			continue;
		}

		if (isNodeOfType(block, 'list_item')) {
			// Collect consecutive list items
			const listItems: BlockNode[] = [];
			while (i < blocks.length) {
				const item: BlockNode | undefined = blocks[i];
				if (!item || !isNodeOfType(item, 'list_item')) break;
				listItems.push(item);
				i++;
			}
			parts.push(serializeListGroup(listItems, ctx));
		} else {
			parts.push(serializeBlock(block, ctx));
			i++;
		}
	}

	return parts.join('');
}

/**
 * Serializes a group of consecutive list items into properly nested `<ul>`/`<ol>` wrappers.
 * Uses a stack-based algorithm to handle indent-based nesting.
 * Produces valid HTML5: nested lists open *inside* the parent `<li>`.
 */
function serializeListGroup(items: readonly BlockNode[], ctx: SerializerContext): string {
	const parts: string[] = [];
	const stack: { tag: string; indent: number }[] = [];

	for (let idx = 0; idx < items.length; idx++) {
		const item: BlockNode | undefined = items[idx];
		if (!item) continue;

		const listType: string = (item.attrs?.listType as string) ?? 'bullet';
		const indent: number = (item.attrs?.indent as number) ?? 0;
		const tag: string = listType === 'ordered' ? 'ol' : 'ul';
		// Pop wrapper levels that are deeper than current indent,
		// or at the same level when the tag type changes
		while (stack.length > 0) {
			const top = stack[stack.length - 1];
			if (!top) break;

			if (top.indent > indent) {
				parts.push(`</${top.tag}></li>`);
				stack.pop();
			} else if (top.indent === indent && top.tag !== tag) {
				parts.push(`</${top.tag}></li>`);
				stack.pop();
			} else {
				break;
			}
		}

		if (stack.length === 0) {
			parts.push(`<${tag}>`);
			stack.push({ tag, indent });
		} else {
			const top = stack[stack.length - 1];
			if (top && indent > top.indent) {
				parts.push(`<${tag}>`);
				stack.push({ tag, indent });
			}
		}

		const content: string = serializeBlock(item, ctx);

		// Look ahead: if the next item is deeper, strip </li> so the nested
		// list opens inside this <li> (valid HTML5 nesting).
		const nextItem: BlockNode | undefined = items[idx + 1];
		const nextIndent: number | undefined = nextItem
			? ((nextItem.attrs?.indent as number) ?? 0)
			: undefined;

		if (nextIndent !== undefined && nextIndent > indent) {
			parts.push(stripTrailingLiClose(content));
		} else {
			parts.push(content);
		}
	}

	// Close all remaining open wrappers
	while (stack.length > 0) {
		const top = stack.pop();
		if (!top) break;
		parts.push(`</${top.tag}>`);
		if (stack.length > 0) {
			parts.push('</li>');
		}
	}

	return parts.join('');
}

/** Removes the trailing `</li>` from serialized list item HTML. */
function stripTrailingLiClose(html: string): string {
	const suffix = '</li>';
	if (html.endsWith(suffix)) {
		return html.slice(0, -suffix.length);
	}
	return html;
}

/** Serializes a single block to HTML using its NodeSpec. */
function serializeBlock(block: BlockNode, ctx: SerializerContext): string {
	const content: string = isLeafBlock(block)
		? serializeInlineContent(block, ctx)
		: serializeBlocks(getBlockChildren(block), ctx);
	const spec = ctx.registry?.getNodeSpec(block.type);

	let html: string;
	if (spec?.toHTML) {
		html = spec.toHTML(block, content, ctx.exportCtx);
	} else {
		html = `<p>${content || '<br>'}</p>`;
	}

	// Inject alignment into the first opening tag (validated against allowlist).
	const rawAlign: string | undefined = (block.attrs as Record<string, unknown>)?.align as
		| string
		| undefined;
	const align: string | undefined = rawAlign
		? (LEGACY_ALIGNMENT_MAP[rawAlign] ?? rawAlign)
		: undefined;
	if (align && align !== 'start' && VALID_ALIGNMENTS.has(align)) {
		const safeAlign: string = escapeAttr(align);
		if (ctx.collector) {
			const className: string = ctx.collector.getAlignmentClassName(align);
			html = injectAttrIntoFirstTag(html, 'class', escapeAttr(className));
		} else {
			html = injectAttrIntoFirstTag(html, 'style', `text-align: ${safeAlign}`);
		}
	}

	// Defense-in-depth: inject dir into the first opening tag if not already present.
	// NodeSpec toHTML may already inject it; this ensures it survives even without a plugin.
	const dir: string | undefined = (block.attrs as Record<string, unknown>)?.dir as
		| string
		| undefined;
	if (dir && VALID_DIRECTIONS.has(dir)) {
		const firstTagEnd: number = html.indexOf('>');
		const firstTag: string = html.slice(0, firstTagEnd + 1);
		if (!firstTag.includes(' dir=')) {
			html = injectAttrIntoFirstTag(html, 'dir', escapeAttr(dir));
		}
	}

	return html;
}

/** Serializes inline children (TextNode + InlineNode) of a block. */
function serializeInlineContent(block: BlockNode, ctx: SerializerContext): string {
	const children: readonly (TextNode | InlineNode)[] = getInlineChildren(block);
	const merged: readonly (TextNode | InlineNode)[] = mergeAdjacentTextNodes(children);
	const parts: string[] = [];
	const markOrder: Map<string, number> | undefined = ctx.registry
		? buildMarkOrder(ctx.registry)
		: undefined;

	for (const child of merged) {
		if (isInlineNode(child)) {
			const inlineSpec = ctx.registry?.getInlineNodeSpec(child.inlineType);
			if (inlineSpec?.toHTMLString) {
				parts.push(inlineSpec.toHTMLString(child));
			}
		} else if (ctx.registry && ctx.collector) {
			parts.push(
				serializeMarksToClassHTML(
					child.text,
					child.marks,
					ctx.registry,
					ctx.collector,
					markOrder,
					ctx.exportCtx,
				),
			);
		} else if (ctx.registry) {
			parts.push(
				serializeMarksToHTML(child.text, child.marks, ctx.registry, markOrder, ctx.exportCtx),
			);
		} else if (child.text !== '') {
			parts.push(escapeHTML(child.text));
		}
	}

	return parts.join('');
}

/**
 * Merges adjacent TextNodes that share identical mark sets.
 * InlineNodes act as merge boundaries.
 */
function mergeAdjacentTextNodes(
	children: readonly (TextNode | InlineNode)[],
): readonly (TextNode | InlineNode)[] {
	if (children.length <= 1) return children;

	const result: (TextNode | InlineNode)[] = [];

	for (const child of children) {
		if (isInlineNode(child)) {
			result.push(child);
			continue;
		}

		const prev: TextNode | InlineNode | undefined = result[result.length - 1];
		if (prev && isTextNode(prev) && markSetsEqual(prev.marks, child.marks)) {
			result[result.length - 1] = {
				type: 'text',
				text: prev.text + child.text,
				marks: prev.marks,
			};
		} else {
			result.push(child);
		}
	}

	return result;
}
