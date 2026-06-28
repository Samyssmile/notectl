/**
 * Block-level Markdown serialization.
 *
 * Leaf/self-contained blocks (paragraph, heading, code_block, horizontal_rule,
 * image) have built-in emitters keyed by type name — the same centralized,
 * by-type-name mapping the importer uses, and the shape `prosemirror-markdown`
 * uses. Container/structural blocks (blockquote, list, table) are engine-owned
 * because their children need per-line prefixing/indentation that cannot be
 * composed from a wrapper (D12): each container serializes its own children and
 * applies its prefix to those known lines (never a post-hoc regex on assembled
 * output). Unknown/superset blocks defer to the per-spec `toMarkdown` hook, then
 * to a raw-HTML fallback via `toHTML` (D3, D4).
 */

import { isNodeOfType } from '../../model/AttrRegistry.js';
import type { BlockNode } from '../../model/Document.js';
import {
	getBlockChildren,
	getBlockText,
	getInlineChildren,
	isLeafBlock,
} from '../../model/Document.js';
import { serializeInlineContent } from './InlineSerializers.js';
import { type SerContext, exportContext } from './MarkdownContext.js';
import {
	escapeInline,
	escapeLineStart,
	escapeLinkDestination,
	escapeLinkTitle,
} from './MarkdownEscape.js';

/** Serializes a sequence of blocks, grouping consecutive list items, joined by blank lines. */
export function serializeBlocks(blocks: readonly BlockNode[], ctx: SerContext): string {
	const parts: string[] = [];
	let i = 0;
	while (i < blocks.length) {
		const block: BlockNode | undefined = blocks[i];
		if (!block) {
			i++;
			continue;
		}
		if (isNodeOfType(block, 'list_item')) {
			const items: BlockNode[] = [];
			while (i < blocks.length) {
				const item: BlockNode | undefined = blocks[i];
				if (!item || !isNodeOfType(item, 'list_item')) break;
				items.push(item);
				i++;
			}
			parts.push(serializeListGroup(items, ctx));
		} else {
			parts.push(serializeBlock(block, ctx));
			i++;
		}
	}
	return parts.filter((p) => p.length > 0).join('\n\n');
}

/** Serializes a single (non-list-item) block. */
export function serializeBlock(block: BlockNode, ctx: SerContext): string {
	const type: string = block.type;

	if (type === 'paragraph') return serializeParagraph(block, ctx);
	if (type === 'heading') return serializeHeading(block, ctx);
	if (type === 'code_block') return serializeCodeBlock(block, ctx);
	if (type === 'horizontal_rule') return '---';
	if (type === 'image') return serializeImage(block, ctx);
	if (type === 'blockquote') return serializeBlockquote(block, ctx);
	if (type === 'table') return serializeTable(block, ctx);
	if (type === 'title') return serializeTitleLike(block, ctx, 1);
	if (type === 'subtitle') return serializeTitleLike(block, ctx, 2);

	return serializeUnknownBlock(block, ctx);
}

/** Paragraph: inline content with leading block markers escaped per line. */
function serializeParagraph(block: BlockNode, ctx: SerContext): string {
	const content: string = serializeInlineContent(getInlineChildren(block), ctx);
	if (content.trim() === '') return '';
	return content.split('\n').map(escapeLineStart).join('\n');
}

/** Heading: ATX (`## h`) by default, setext for levels 1-2 when requested. */
function serializeHeading(block: BlockNode, ctx: SerContext): string {
	const level: number = clampLevel((block.attrs?.level as number | undefined) ?? 1);
	const content: string = serializeInlineContent(getInlineChildren(block), ctx).replace(/\n/g, ' ');

	if (ctx.opts.headingStyle === 'setext' && level <= 2 && content !== '') {
		const underline: string = level === 1 ? '=' : '-';
		return `${content}\n${underline.repeat(Math.max(3, content.length))}`;
	}
	const hashes: string = '#'.repeat(level);
	return content ? `${hashes} ${content}` : hashes;
}

function clampLevel(level: number): number {
	if (level < 1) return 1;
	if (level > 6) return 6;
	return Math.floor(level);
}

/** Fenced code block; the fence is grown to exceed any fence run inside the code. */
function serializeCodeBlock(block: BlockNode, ctx: SerContext): string {
	const lang: string = String(block.attrs?.language ?? '');
	const code: string = getBlockText(block);
	const fenceChar: string = ctx.opts.codeFence[0] ?? '`';
	const fence: string = fenceChar.repeat(Math.max(3, longestRun(code, fenceChar) + 1));
	return `${fence}${lang}\n${code}\n${fence}`;
}

/** Length of the longest consecutive run of `ch` in `text`. */
function longestRun(text: string, ch: string): number {
	let longest = 0;
	let current = 0;
	for (const c of text) {
		if (c === ch) {
			current++;
			longest = Math.max(longest, current);
		} else {
			current = 0;
		}
	}
	return longest;
}

/** Standalone image on its own line; styling-bearing images use HTML fallback (D3). */
function serializeImage(block: BlockNode, ctx: SerContext): string {
	const src: string = String(block.attrs?.src ?? '');
	const alt: string = String(block.attrs?.alt ?? '');
	const title: string = String(block.attrs?.title ?? '');
	const width = block.attrs?.width as number | undefined;
	const height = block.attrs?.height as number | undefined;
	const align = block.attrs?.align as string | undefined;
	const hasStyling: boolean =
		width !== undefined || height !== undefined || (align !== undefined && align !== 'center');

	if (hasStyling && ctx.opts.htmlFallback) {
		const html: string | undefined = ctx.registry?.getNodeSpec('image')?.toHTML?.(block, '');
		if (html) return html;
	}

	const titlePart: string = title ? ` "${escapeLinkTitle(title)}"` : '';
	return `![${escapeInline(alt, ctx.opts.gfm)}](${escapeLinkDestination(src)}${titlePart})`;
}

/** Blockquote container: serialize children, then prefix every line with `> `. */
function serializeBlockquote(block: BlockNode, ctx: SerContext): string {
	const inner: string = serializeBlocks(getBlockChildren(block), ctx);
	return inner
		.split('\n')
		.map((line) => (line === '' ? '>' : `> ${line}`))
		.join('\n');
}

/** title/subtitle: HTML fallback (`<h1 class>`) by default; degrade to `#`/`##` otherwise (D5). */
function serializeTitleLike(block: BlockNode, ctx: SerContext, level: number): string {
	if (ctx.opts.htmlFallback) {
		const content: string = serializeInlineContent(getInlineChildren(block), ctx);
		const html: string | undefined = ctx.registry
			?.getNodeSpec(block.type)
			?.toHTML?.(block, content);
		if (html) return html;
	}
	const content: string = serializeInlineContent(getInlineChildren(block), ctx).replace(/\n/g, ' ');
	const hashes: string = '#'.repeat(level);
	return content ? `${hashes} ${content}` : hashes;
}

/** Unknown / superset block: per-spec `toMarkdown` hook, then raw-HTML fallback, then degrade. */
function serializeUnknownBlock(block: BlockNode, ctx: SerContext): string {
	const spec = ctx.registry?.getNodeSpec(block.type);
	const content: string = isLeafBlock(block)
		? serializeInlineContent(getInlineChildren(block), ctx)
		: serializeBlocks(getBlockChildren(block), ctx);

	const md: string | null | undefined = spec?.toMarkdown?.(block, content, exportContext(ctx.opts));
	if (md != null) return md;

	if (ctx.opts.htmlFallback && spec?.toHTML) return spec.toHTML(block, content);

	// htmlFallback off: keep textual content, drop the unrepresentable wrapper.
	return content;
}

/** Serializes a run of consecutive list items into Markdown list lines. */
function serializeListGroup(items: readonly BlockNode[], ctx: SerContext): string {
	const lines: string[] = [];
	const counters: number[] = [];

	for (const item of items) {
		const listType: string = String(item.attrs?.listType ?? 'bullet');
		const indent: number = Math.max(0, (item.attrs?.indent as number | undefined) ?? 0);
		const content: string = serializeInlineContent(getInlineChildren(item), ctx).replace(
			/\n/g,
			' ',
		);
		const pad: string = ' '.repeat(indent * ctx.opts.listIndent);

		// Reset deeper counters when we step back out.
		counters.length = indent + 1;

		let marker: string;
		if (listType === 'ordered') {
			counters[indent] = (counters[indent] ?? 0) + 1;
			marker = `${counters[indent]}.`;
		} else if (listType === 'checklist') {
			const checked: boolean = item.attrs?.checked === true;
			marker = `${ctx.opts.bullet} [${checked ? 'x' : ' '}]`;
		} else {
			marker = ctx.opts.bullet;
		}

		lines.push(`${pad}${marker} ${content}`);
	}

	return lines.join('\n');
}

/** GFM table; tables with colspan/rowspan fall back to raw HTML (D3, no GFM equivalent). */
function serializeTable(block: BlockNode, ctx: SerContext): string {
	const rows: readonly BlockNode[] = getBlockChildren(block);
	if (rows.length === 0) return '';

	if (ctx.opts.htmlFallback && hasSpannedCells(rows)) {
		const html: string | undefined = ctx.registry?.getNodeSpec('table')?.toHTML?.(block, '');
		if (html) return html;
	}

	const matrix: string[][] = rows.map((row) =>
		getBlockChildren(row).map((cell) => serializeCell(cell, ctx)),
	);
	const columns: number = matrix.reduce((max, row) => Math.max(max, row.length), 0);
	if (columns === 0) return '';

	const renderRow = (cells: string[]): string => {
		const padded: string[] = [...cells];
		while (padded.length < columns) padded.push('');
		return `| ${padded.join(' | ')} |`;
	};

	const headerRow: BlockNode | undefined = rows[0];
	const delimiters: string[] = Array.from({ length: columns }, (_v, col) =>
		alignMarker(columnAlign(headerRow, col)),
	);

	const out: string[] = [];
	out.push(renderRow(matrix[0] ?? []));
	out.push(`| ${delimiters.join(' | ')} |`);
	for (let i = 1; i < matrix.length; i++) {
		out.push(renderRow(matrix[i] ?? []));
	}
	return out.join('\n');
}

/** Reads the column alignment from a header cell's paragraph `align` attribute. */
function columnAlign(headerRow: BlockNode | undefined, col: number): string | undefined {
	if (!headerRow) return undefined;
	const cell: BlockNode | undefined = getBlockChildren(headerRow)[col];
	if (!cell) return undefined;
	const paragraph: BlockNode | undefined = getBlockChildren(cell)[0];
	return paragraph?.attrs?.align as string | undefined;
}

/** Maps a logical alignment to its GFM delimiter marker. */
function alignMarker(align: string | undefined): string {
	if (align === 'start') return ':---';
	if (align === 'center') return ':---:';
	if (align === 'end') return '---:';
	return '---';
}

/** Whether any cell in the rows carries a colspan/rowspan > 1. */
function hasSpannedCells(rows: readonly BlockNode[]): boolean {
	for (const row of rows) {
		for (const cell of getBlockChildren(row)) {
			const colspan = cell.attrs?.colspan as number | undefined;
			const rowspan = cell.attrs?.rowspan as number | undefined;
			if ((colspan ?? 1) > 1 || (rowspan ?? 1) > 1) return true;
		}
	}
	return false;
}

/** Serializes a table cell to single-line inline Markdown, escaping pipes. */
function serializeCell(cell: BlockNode, ctx: SerContext): string {
	const blocks: readonly BlockNode[] = getBlockChildren(cell);
	const inline: string = blocks
		.map((b) => serializeInlineContent(getInlineChildren(b), ctx))
		.join(' ')
		.replace(/\n/g, ' ');
	return inline.replace(/\|/g, '\\|').trim();
}
