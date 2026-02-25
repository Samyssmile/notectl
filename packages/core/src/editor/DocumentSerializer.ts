/**
 * DocumentSerializer: converts an immutable Document into sanitized HTML.
 * Pure functions — operates on Document/SchemaRegistry, no class state.
 */

import DOMPurify from 'dompurify';
import { isNodeOfType } from '../model/AttrRegistry.js';
import type { BlockNode, Document, InlineNode, Mark, TextNode } from '../model/Document.js';
import {
	getBlockChildren,
	getInlineChildren,
	isInlineNode,
	isLeafBlock,
} from '../model/Document.js';
import { escapeHTML } from '../model/HTMLUtils.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';

/** Known-safe alignment values accepted by the serializer (defense-in-depth). */
const VALID_ALIGNMENTS: ReadonlySet<string> = new Set(['left', 'center', 'right', 'justify']);

/** Serializes a full document to sanitized HTML, wrapping list items in `<ul>`/`<ol>`. */
export function serializeDocumentToHTML(doc: Document, registry?: SchemaRegistry): string {
	const html: string = serializeBlocks(doc.children, registry);

	const allowedTags: string[] = registry ? registry.getAllowedTags() : ['p', 'br', 'div', 'span'];
	const allowedAttrs: string[] = registry ? registry.getAllowedAttrs() : ['style'];

	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS: allowedTags,
		ALLOWED_ATTR: allowedAttrs,
	});
}

/** Serializes a sequence of blocks to HTML, grouping consecutive list items into wrappers. */
function serializeBlocks(blocks: readonly BlockNode[], registry?: SchemaRegistry): string {
	const parts: string[] = [];
	let currentListTag: string | null = null;

	for (const block of blocks) {
		if (isNodeOfType(block, 'list_item')) {
			const listType = block.attrs.listType;
			const tag: string = listType === 'ordered' ? 'ol' : 'ul';

			if (currentListTag !== tag) {
				if (currentListTag) parts.push(`</${currentListTag}>`);
				parts.push(`<${tag}>`);
				currentListTag = tag;
			}

			parts.push(serializeBlock(block, registry));
		} else {
			if (currentListTag) {
				parts.push(`</${currentListTag}>`);
				currentListTag = null;
			}
			parts.push(serializeBlock(block, registry));
		}
	}

	if (currentListTag) parts.push(`</${currentListTag}>`);

	return parts.join('');
}

/** Serializes a single block to HTML using its NodeSpec. */
function serializeBlock(block: BlockNode, registry?: SchemaRegistry): string {
	const content: string = isLeafBlock(block)
		? serializeInlineContent(block, registry)
		: serializeBlocks(getBlockChildren(block), registry);
	const spec = registry?.getNodeSpec(block.type);

	let html: string;
	if (spec?.toHTML) {
		html = spec.toHTML(block, content);
	} else {
		html = `<p>${content || '<br>'}</p>`;
	}

	// Inject align style into the first opening tag (validated against allowlist)
	const align: string | undefined = (block.attrs as Record<string, unknown>)?.align as
		| string
		| undefined;
	if (align && align !== 'left' && VALID_ALIGNMENTS.has(align)) {
		html = html.replace(/>/, ` style="text-align: ${align}">`);
	}

	return html;
}

/** Serializes inline children (TextNode + InlineNode) of a block. */
function serializeInlineContent(block: BlockNode, registry?: SchemaRegistry): string {
	const children: readonly (TextNode | InlineNode)[] = getInlineChildren(block);
	const parts: string[] = [];

	for (const child of children) {
		if (isInlineNode(child)) {
			const inlineSpec = registry?.getInlineNodeSpec(child.inlineType);
			if (inlineSpec?.toHTMLString) {
				parts.push(inlineSpec.toHTMLString(child));
			}
		} else {
			parts.push(serializeTextNode(child, registry));
		}
	}

	return parts.join('');
}

/** Serializes a text node, wrapping it with mark tags sorted by rank. */
function serializeTextNode(node: TextNode, registry?: SchemaRegistry): string {
	if (node.text === '') return '';

	let html: string = escapeHTML(node.text);

	const markOrder: Map<string, number> = getMarkOrder(registry);
	const sortedMarks: Mark[] = [...node.marks].sort(
		(a, b) => (markOrder.get(a.type) ?? 99) - (markOrder.get(b.type) ?? 99),
	);

	for (const mark of sortedMarks) {
		const markSpec = registry?.getMarkSpec(mark.type);
		if (markSpec?.toHTMLString) {
			html = markSpec.toHTMLString(mark, html);
		}
	}

	return html;
}

/** Builds a map of mark type name to rank from the registry. */
function getMarkOrder(registry?: SchemaRegistry): Map<string, number> {
	if (!registry) return new Map();
	const types = registry.getMarkTypes();
	const order = new Map<string, number>();
	for (const t of types) {
		const spec = registry.getMarkSpec(t);
		if (spec) order.set(t, spec.rank ?? 99);
	}
	return order;
}
