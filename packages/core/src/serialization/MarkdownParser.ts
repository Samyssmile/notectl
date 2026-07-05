/**
 * MarkdownParser: converts a Markdown string into an immutable Document.
 *
 * Mirrors `DocumentParser.ts` (HTML) but is reached **only** via dynamic
 * `import()` so it stays code-split out of the core bundle (D13). The grammar is
 * centralized (CommonMark is a global, context-sensitive grammar that cannot be
 * decomposed into per-spec rules, D4); tokens map to schema node types by name
 * through the registry. Raw HTML blocks delegate to `parseHTMLToDocument` so the
 * superset round-trip stays lossless (D3). Plugin syntax (`$...$`) is contributed
 * via `options.syntaxExtensions`, never hard-coded here.
 */

import type { BlockNode, Document, InlineNode, TextNode } from '../model/Document.js';
import {
	createBlockNode,
	createDocument,
	createTextNode,
	isInlineNode,
} from '../model/Document.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { type NodeTypeName, nodeType } from '../model/TypeBrands.js';
import { parseHTMLToDocument } from './DocumentParser.js';
import type { MarkdownParseOptions } from './MarkdownTypes.js';
import type { BlockToken } from './markdown/BlockTokenizer.js';
import { tokenizeBlocks } from './markdown/BlockTokenizer.js';
import type { ColumnAlign } from './markdown/GfmTableParser.js';
import { parseInline } from './markdown/InlineTokenizer.js';
import { extractLinkReferences } from './markdown/LinkReferenceExtractor.js';
import { type ParseContext, resolveParseOptions } from './markdown/MarkdownParseContext.js';

/** Parses a Markdown string into a Document. */
export function parseMarkdownToDocument(
	markdown: string,
	registry?: SchemaRegistry,
	options?: MarkdownParseOptions,
): Document {
	const normalized: string = markdown.replace(/\r\n?/g, '\n');
	const { source, linkRefs } = extractLinkReferences(normalized);

	const ctx: ParseContext = {
		registry,
		opts: resolveParseOptions(options),
		linkRefs,
	};

	const tokens: BlockToken[] = tokenizeBlocks(source, ctx.opts.gfm, ctx.opts.syntaxExtensions);
	const blocks: BlockNode[] = tokensToBlocks(tokens, ctx);
	if (blocks.length === 0) return createDocument();
	return createDocument(blocks);
}

/** Converts a list of block tokens into Document block nodes. */
function tokensToBlocks(tokens: readonly BlockToken[], ctx: ParseContext): BlockNode[] {
	const blocks: BlockNode[] = [];
	for (const token of tokens) {
		appendToken(token, blocks, ctx);
	}
	return blocks;
}

/** Appends the block node(s) produced by a single token. */
function appendToken(token: BlockToken, blocks: BlockNode[], ctx: ParseContext): void {
	switch (token.type) {
		case 'heading':
			blocks.push(makeBlock('heading', parseInline(token.text, ctx), ctx, { level: token.level }));
			return;
		case 'paragraph': {
			const inline: (TextNode | InlineNode)[] = parseInline(token.text, ctx);
			const image: BlockNode | null = promoteStandaloneImage(inline, ctx);
			blocks.push(image ?? makeBlock('paragraph', inline, ctx));
			return;
		}
		case 'table':
			blocks.push(buildTable(token.aligns, token.header, token.rows, ctx));
			return;
		case 'extension_block':
			blocks.push(makeBlock(token.nodeType, [createTextNode('')], ctx, token.attrs));
			return;
		case 'code_block':
			blocks.push(
				makeBlock('code_block', [createTextNode(token.code)], ctx, { language: token.language }),
			);
			return;
		case 'hr':
			blocks.push(makeBlock('horizontal_rule', [createTextNode('')], ctx));
			return;
		case 'list_item': {
			const attrs: Record<string, string | number | boolean> = {
				listType: token.listType,
				indent: token.indent,
				checked: token.checked,
			};
			if (token.children && token.children.length > 0) {
				// Multi-block item (#194): a container whose children are blocks.
				const children: BlockNode[] = tokensToBlocks(token.children, ctx);
				if (ctx.registry && !ctx.registry.getNodeSpec('list_item')) {
					// Type unavailable: degrade to the children as top-level blocks.
					blocks.push(...children);
					return;
				}
				blocks.push(createBlockNode(nodeType('list_item'), children, undefined, attrs));
				return;
			}
			blocks.push(makeBlock('list_item', parseInline(token.text, ctx), ctx, attrs));
			return;
		}
		case 'blockquote': {
			const children: BlockNode[] = tokensToBlocks(token.children, ctx);
			if (children.length === 0) {
				children.push(createBlockNode(nodeType('paragraph'), [createTextNode('')]));
			}
			blocks.push(makeContainer('blockquote', children, ctx));
			return;
		}
		case 'html':
			// A comment-only block produces no content (and must not leave a stray
			// empty paragraph between blocks, e.g. two lists split by `<!-- -->`).
			if (isCommentOnly(token.html)) return;
			for (const block of parseHTMLToDocument(token.html, ctx.registry).children) {
				blocks.push(block);
			}
			return;
	}
}

/** Whether an HTML block consists solely of comments (linear manual scan). */
function isCommentOnly(html: string): boolean {
	let rest: string = html.trim();
	while (rest.startsWith('<!--')) {
		const end: number = rest.indexOf('-->');
		if (end === -1) return false;
		rest = rest.slice(end + 3).trim();
	}
	return rest === '';
}

/** Builds a leaf block, falling back to a paragraph if the type is unavailable. */
function makeBlock(
	type: string,
	children: readonly (TextNode | InlineNode)[],
	ctx: ParseContext,
	attrs?: Record<string, string | number | boolean>,
): BlockNode {
	const resolved: NodeTypeName = resolveType(type, ctx);
	const childList: readonly (TextNode | InlineNode)[] =
		children.length > 0 ? children : [createTextNode('')];
	return createBlockNode(
		resolved,
		childList,
		undefined,
		attrs && resolved === nodeType(type) ? attrs : undefined,
	);
}

/** Builds a container block (block children), falling back to a paragraph if unavailable. */
function makeContainer(type: string, children: readonly BlockNode[], ctx: ParseContext): BlockNode {
	const resolved: NodeTypeName = resolveType(type, ctx);
	if (resolved !== nodeType(type)) {
		// Type unavailable: degrade to the container's children inline (best effort).
		return children[0] ?? createBlockNode(nodeType('paragraph'), [createTextNode('')]);
	}
	return createBlockNode(resolved, children);
}

/** Resolves a desired node type against the registry, falling back to paragraph. */
function resolveType(type: string, ctx: ParseContext): NodeTypeName {
	if (ctx.registry && !ctx.registry.getNodeSpec(type)) return nodeType('paragraph');
	return nodeType(type);
}

/**
 * Promotes a paragraph holding only a single inline image to a block `image`
 * node, matching the serializer (a standalone-image line becomes a block image).
 * Returns null when the paragraph is not a lone image or `image` is unavailable.
 * A marked image (e.g. a linked `[![alt](src)](url)`) is never promoted: the
 * block `image` node cannot hold a mark, so promotion would drop the link.
 */
function promoteStandaloneImage(
	inline: readonly (TextNode | InlineNode)[],
	ctx: ParseContext,
): BlockNode | null {
	if (inline.length !== 1) return null;
	const only = inline[0];
	if (!only || !isInlineNode(only) || only.inlineType !== 'image_inline') return null;
	if (only.marks.length > 0) return null;
	if (ctx.registry && !ctx.registry.getNodeSpec('image')) return null;

	const attrs: Record<string, string | number | boolean> = {
		src: String(only.attrs.src ?? ''),
		alt: String(only.attrs.alt ?? ''),
		align: 'center',
	};
	if (only.attrs.title) attrs.title = String(only.attrs.title);
	return createBlockNode(nodeType('image'), [createTextNode('')], undefined, attrs);
}

/** Builds a GFM table node (table → table_row → table_cell → paragraph). */
function buildTable(
	aligns: readonly ColumnAlign[],
	header: readonly string[],
	rows: readonly (readonly string[])[],
	ctx: ParseContext,
): BlockNode {
	if (ctx.registry && !ctx.registry.getNodeSpec('table')) {
		// No table support: degrade to a paragraph per row so content is never lost.
		const lines: string = [header, ...rows].map((r) => r.join(' | ')).join('\n');
		return makeBlock('paragraph', parseInline(lines, ctx), ctx);
	}

	const buildRow = (cells: readonly string[]): BlockNode => {
		const tableCells: BlockNode[] = cells.map((cell, col) => {
			const align: ColumnAlign = aligns[col] ?? null;
			const paragraph: BlockNode = createBlockNode(
				nodeType('paragraph'),
				parseInline(cell, ctx),
				undefined,
				align ? { align } : undefined,
			);
			return createBlockNode(nodeType('table_cell'), [paragraph]);
		});
		return createBlockNode(nodeType('table_row'), tableCells);
	};

	// GFM normalizes every body row to the header's column count: overlong rows
	// drop their extra cells, short rows are padded with empty cells. Keeping rows
	// ragged would break the per-column model invariant the table tools rely on
	// (column insert/delete and cell navigation index by a fixed colIndex per row).
	const columnCount: number = header.length;
	const normalizeRow = (cells: readonly string[]): readonly string[] => {
		if (cells.length === columnCount) return cells;
		const normalized: string[] = cells.slice(0, columnCount);
		while (normalized.length < columnCount) normalized.push('');
		return normalized;
	};

	const tableRows: BlockNode[] = [
		buildRow(header),
		...rows.map((row) => buildRow(normalizeRow(row))),
	];
	return createBlockNode(nodeType('table'), tableRows);
}
