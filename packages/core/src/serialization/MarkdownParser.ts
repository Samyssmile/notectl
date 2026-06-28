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
import { createBlockNode, createDocument, createTextNode } from '../model/Document.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { type NodeTypeName, nodeType } from '../model/TypeBrands.js';
import { parseHTMLToDocument } from './DocumentParser.js';
import type { MarkdownParseOptions } from './MarkdownTypes.js';
import type { BlockToken } from './markdown/BlockTokenizer.js';
import { tokenizeBlocks } from './markdown/BlockTokenizer.js';
import { parseInline } from './markdown/InlineTokenizer.js';
import { type ParseContext, resolveParseOptions } from './markdown/MarkdownParseContext.js';

/** A link reference definition target. */
interface LinkRef {
	readonly href: string;
	readonly title?: string;
}

const LINK_REF_DEF =
	/^ {0,3}\[([^\]]+)\]:[ \t]*(?:<([^>]*)>|(\S+))(?:[ \t]+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?[ \t]*$/;

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

	const tokens: BlockToken[] = tokenizeBlocks(source);
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
	for (const line of source.split('\n')) {
		const match: RegExpMatchArray | null = line.match(LINK_REF_DEF);
		if (match) {
			const label: string = (match[1] ?? '').trim().toLowerCase();
			const href: string = match[2] ?? match[3] ?? '';
			const title: string | undefined = match[4] ?? match[5] ?? match[6];
			if (label && !linkRefs.has(label)) {
				linkRefs.set(label, title ? { href, title } : { href });
			}
			continue;
		}
		kept.push(line);
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
		case 'paragraph':
			blocks.push(makeBlock('paragraph', parseInline(token.text, ctx), ctx));
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
