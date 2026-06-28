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
import {
	ATX_HEADING,
	FENCE_OPEN,
	THEMATIC_BREAK,
	tokenizeBlocks,
} from './markdown/BlockTokenizer.js';
import type { ColumnAlign } from './markdown/GfmTableParser.js';
import { parseInline } from './markdown/InlineTokenizer.js';
import { type ParseContext, resolveParseOptions } from './markdown/MarkdownParseContext.js';

/** A link reference definition target. */
interface LinkRef {
	readonly href: string;
	readonly title?: string;
}

const LINK_REF_DEF =
	/^ {0,3}\[([^\]]+)\]:[ \t]*(?:<([^>]*)>|(\S+))(?:[ \t]+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?[ \t]*$/;

/** A bare closing fence (no info string). */
const FENCE_CLOSE_LINE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

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

/** Removes link reference definitions from the source and returns them as a map. */
function extractLinkReferences(source: string): {
	source: string;
	linkRefs: Map<string, LinkRef>;
} {
	const linkRefs = new Map<string, LinkRef>();
	const kept: string[] = [];
	// Track fenced-code state: a reference-definition-shaped line inside a code
	// fence is code, not a definition, and must survive verbatim (D3 data loss).
	let fence: { char: string; len: number } | null = null;
	// Whether a paragraph is open above the next line. CommonMark forbids a link
	// reference definition from interrupting a paragraph, so a def-shaped line that
	// lazily continues an open paragraph is paragraph text and must not be stripped.
	// A definition is only recognized at a block boundary: document start, after a
	// blank line, a heading, a thematic break, a fence, or another definition.
	let openParagraph = false;
	for (const line of source.split('\n')) {
		if (fence) {
			kept.push(line);
			const close: RegExpMatchArray | null = line.match(FENCE_CLOSE_LINE);
			const run: string | undefined = close?.[1];
			if (run && run[0] === fence.char && run.length >= fence.len) fence = null;
			openParagraph = false;
			continue;
		}
		const open: RegExpMatchArray | null = line.match(FENCE_OPEN);
		if (open?.[1]) {
			fence = { char: open[1][0] ?? '`', len: open[1].length };
			kept.push(line);
			openParagraph = false;
			continue;
		}
		const match: RegExpMatchArray | null = line.match(LINK_REF_DEF);
		if (match) {
			// Inside an open paragraph this is a lazy continuation, not a definition:
			// keep it as text and leave the paragraph open.
			if (openParagraph) {
				kept.push(line);
				continue;
			}
			const label: string = (match[1] ?? '').trim().toLowerCase();
			const href: string = match[2] ?? match[3] ?? '';
			const title: string | undefined = match[4] ?? match[5] ?? match[6];
			if (label && !linkRefs.has(label)) {
				linkRefs.set(label, title ? { href, title } : { href });
			}
			continue;
		}
		kept.push(line);
		// A blank line or a complete block (heading, thematic break) closes any open
		// paragraph; every other non-blank line keeps one open. Deliberate keep-bias:
		// a def-shaped line after, e.g., a table row or setext underline is preserved
		// as text rather than registered, which never drops content (D3).
		openParagraph = line.trim() !== '' && !ATX_HEADING.test(line) && !THEMATIC_BREAK.test(line);
	}
	return { source: kept.join('\n'), linkRefs };
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
		case 'list_item':
			blocks.push(
				makeBlock('list_item', parseInline(token.text, ctx), ctx, {
					listType: token.listType,
					indent: token.indent,
					checked: token.checked,
				}),
			);
			return;
		case 'blockquote': {
			const children: BlockNode[] = tokensToBlocks(token.children, ctx);
			if (children.length === 0) {
				children.push(createBlockNode(nodeType('paragraph'), [createTextNode('')]));
			}
			blocks.push(makeContainer('blockquote', children, ctx));
			return;
		}
		case 'html':
			for (const block of parseHTMLToDocument(token.html, ctx.registry).children) {
				blocks.push(block);
			}
			return;
	}
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
 */
function promoteStandaloneImage(
	inline: readonly (TextNode | InlineNode)[],
	ctx: ParseContext,
): BlockNode | null {
	if (inline.length !== 1) return null;
	const only = inline[0];
	if (!only || !isInlineNode(only) || only.inlineType !== 'image_inline') return null;
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

	const tableRows: BlockNode[] = [buildRow(header), ...rows.map(buildRow)];
	return createBlockNode(nodeType('table'), tableRows);
}
