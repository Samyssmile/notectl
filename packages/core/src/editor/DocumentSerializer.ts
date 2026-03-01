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
import { escapeHTML } from '../model/HTMLUtils.js';
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
}

/** Known-safe alignment values accepted by the serializer (defense-in-depth). */
export const VALID_ALIGNMENTS: ReadonlySet<string> = new Set([
	'left',
	'center',
	'right',
	'justify',
]);

/** Serializes a full document to sanitized HTML, wrapping list items in `<ul>`/`<ol>`. */
export function serializeDocumentToHTML(doc: Document, registry?: SchemaRegistry): string {
	const ctx: SerializerContext = { registry };
	const html: string = serializeBlocks(doc.children, ctx);

	const allowedTags: string[] = registry ? registry.getAllowedTags() : ['p', 'br', 'div', 'span'];
	const allowedAttrs: string[] = registry ? registry.getAllowedAttrs() : ['style'];

	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS: allowedTags,
		ALLOWED_ATTR: allowedAttrs,
	});
}

/**
 * Serializes a document to HTML with CSS class names instead of inline styles.
 * Returns the HTML and a collected stylesheet with only the rules actually used.
 */
export function serializeDocumentToCSS(doc: Document, registry?: SchemaRegistry): ContentCSSResult {
	const collector = new CSSClassCollector();
	const ctx: SerializerContext = { registry, collector };
	const html: string = serializeBlocks(doc.children, ctx);

	const allowedTags: string[] = registry ? registry.getAllowedTags() : ['p', 'br', 'div', 'span'];
	const allowedAttrs: string[] = registry ? registry.getAllowedAttrs() : ['style', 'class'];

	// In class mode, allow `class` attribute through DOMPurify
	if (!allowedAttrs.includes('class')) {
		allowedAttrs.push('class');
	}

	const sanitizedHTML: string = DOMPurify.sanitize(html, {
		ALLOWED_TAGS: allowedTags,
		ALLOWED_ATTR: allowedAttrs,
	});

	return { html: sanitizedHTML, css: collector.toCSS() };
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
			const top: { tag: string; indent: number } | undefined = stack[stack.length - 1];
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
			const top: { tag: string; indent: number } | undefined = stack[stack.length - 1];
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
		const top: { tag: string; indent: number } | undefined = stack.pop();
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
		html = spec.toHTML(block, content);
	} else {
		html = `<p>${content || '<br>'}</p>`;
	}

	// Inject alignment into the first opening tag (validated against allowlist).
	const align: string | undefined = (block.attrs as Record<string, unknown>)?.align as
		| string
		| undefined;
	if (align && align !== 'left' && VALID_ALIGNMENTS.has(align)) {
		if (ctx.collector) {
			// Class mode: use semantic alignment class on the outer element only
			const firstTagEnd: number = html.indexOf('>');
			const firstTag: string = html.slice(0, firstTagEnd + 1);
			const alreadyHasClass: boolean = /class="/.test(firstTag);
			if (!alreadyHasClass) {
				const className: string = ctx.collector.getAlignmentClassName(align);
				html = html.replace(/>/, ` class="${className}">`);
			}
		} else {
			// Inline mode: inject style attribute
			const alreadyHasAlign: boolean = /style="[^"]*text-align:/.test(html);
			if (!alreadyHasAlign) {
				html = html.replace(/>/, ` style="text-align: ${align}">`);
			}
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
				serializeMarksToClassHTML(child.text, child.marks, ctx.registry, ctx.collector, markOrder),
			);
		} else if (ctx.registry) {
			parts.push(serializeMarksToHTML(child.text, child.marks, ctx.registry, markOrder));
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
