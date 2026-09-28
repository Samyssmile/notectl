/**
 * DocumentParser: converts sanitized HTML strings into immutable Document instances.
 * Pure functions — no class state, no DOM mutation beyond a temporary `<template>`.
 */

import type { BlockAlignment } from '../model/BlockAlignment.js';
import { hoistDisallowedBlocks } from '../model/ContentModel.js';
import type {
	BlockAttrValue,
	BlockNode,
	Document,
	InlineNode,
	Mark,
	TextNode,
} from '../model/Document.js';
import {
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
	getInlineChildren,
	isInlineNode,
} from '../model/Document.js';
import { SAFE_URI_REGEXP, normalizeHTMLId } from '../model/HTMLUtils.js';
import type { ParseRule } from '../model/ParseRule.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { type InlineTypeName, inlineType, nodeType } from '../model/TypeBrands.js';
import { readElementAlignment } from './AlignmentHTML.js';
import { adoptBlockId } from './BlockIdHTML.js';
import { VALID_DIRECTIONS } from './DocumentSerializer.js';
import { isHTMLBlockElement, matchHTMLParseRule, parseHTMLMarks } from './HTMLParseRules.js';
import { type HTMLParseSession, createHTMLParseSession } from './HTMLParseSession.js';
import { preserveHTMLIdSanitizeConfig, sanitizeHTML } from './HTMLSanitization.js';
import { normalizeHTMLWhitespace } from './HTMLWhitespace.js';
import {
	MAX_SERIALIZED_TABLE_COLUMNS,
	TABLE_COLUMN_WIDTH_DATA_ATTRIBUTE,
	TABLE_ROW_MIN_HEIGHT_DATA_ATTRIBUTE,
	normalizeTableColumnWidthsPx,
	parseTableColumnSpan,
	readTableDimensionPx,
} from './TableDimensions.js';

/** Options for `parseHTMLToDocument` when importing class-based HTML. */
export interface ParseHTMLOptions {
	/**
	 * Style map from a previous `getContentHTML({ cssMode: 'classes' })` call.
	 * Used to rehydrate class-based HTML back into styled content.
	 */
	readonly styleMap?: ReadonlyMap<string, string>;
}

/** Parses an HTML string into a Document, applying sanitization and schema parse rules. */
export function parseHTMLToDocument(
	html: string,
	registry?: SchemaRegistry,
	options?: ParseHTMLOptions,
): Document {
	const allowedTags: string[] = registry ? registry.getAllowedTags() : ['p', 'br', 'div', 'span'];
	const allowedAttrs: string[] = registry ? registry.getAllowedAttrs() : ['style', 'dir', 'id'];

	// `data-block-id` carries block identity across `setContentHTML(getContentHTML())`.
	// Whitelist it through DOMPurify so the adoption logic below sees it.
	if (!allowedAttrs.includes('data-block-id')) {
		allowedAttrs.push('data-block-id');
	}

	// When a styleMap is provided, also allow `class` through DOMPurify
	// so we can read class names and rehydrate styles before parsing.
	if (options?.styleMap && !allowedAttrs.includes('class')) {
		allowedAttrs.push('class');
	}

	const template = document.createElement('template');
	template.innerHTML = sanitizeHTML(
		html,
		{
			ALLOWED_TAGS: allowedTags,
			ALLOWED_ATTR: allowedAttrs,
			ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
			...preserveHTMLIdSanitizeConfig(),
		},
		registry,
	);
	const root: DocumentFragment = template.content;

	// Rehydrate class-based HTML: convert notectl class names back to inline styles
	if (options?.styleMap) {
		rehydrateClasses(root, options.styleMap);
	}

	// Collapse insignificant HTML whitespace so source-formatted/indented input does
	// not leave stray newlines and indentation inside block text content.
	normalizeHTMLWhitespace(root);

	const session: HTMLParseSession = createHTMLParseSession(registry);
	const blocks: BlockNode[] = [];

	for (const child of Array.from(root.childNodes)) {
		parseChildNode(child, blocks, session);
	}

	if (blocks.length === 0) return createDocument();
	const doc: Document = createDocument(blocks);
	// Repair schema-invalid nesting an importer may have produced (e.g. a `<table>`
	// inside an `<li>` builds `list_item > table`, which the flat-with-indent item
	// model forbids): the disallowed block is hoisted to a valid ancestor (#194).
	return registry ? hoistDisallowedBlocks(doc, registry) : doc;
}

/**
 * Parses a single child node into block(s), handling all supported block types:
 * lists, tables, block parse rules (headings, blockquotes, code blocks, images, hr),
 * and fallback paragraphs. Used by both top-level parsing and table cell content parsing.
 */
function parseChildNode(child: ChildNode, blocks: BlockNode[], session: HTMLParseSession): void {
	const { adoptedIds, registry } = session;
	if (child.nodeType === Node.ELEMENT_NODE) {
		const el = child as HTMLElement;
		const tag: string = el.tagName.toLowerCase();

		// Lists need cross-element logic — handle before parse rules
		if (tag === 'ul' || tag === 'ol') {
			const listType: string = tag === 'ol' ? 'ordered' : 'bullet';
			const listDir: string | null = el.getAttribute('dir');
			const parentDir: string | undefined =
				listDir && VALID_DIRECTIONS.has(listDir) ? listDir : undefined;
			parseListElement(el, listType, 0, blocks, session, parentDir);
			return;
		}

		// Tables produce nested block structure: table > table_row > table_cell > paragraph
		if (tag === 'table') {
			parseTableElement(el, blocks, session);
			return;
		}

		// Blockquotes are container blocks (issue #136): parse their children
		// recursively into block nodes instead of flattening to inline content.
		if (tag === 'blockquote') {
			parseBlockquoteElement(el, blocks, session);
			return;
		}

		// Try block parse rules
		const match = matchHTMLParseRule(el, session.blockRules);

		// A paragraph cannot hold blocks. An element that resolves to `paragraph`
		// (the generic `<div>` rule or the fallback below) but wraps block-level
		// children is a transparent wrapper, the shape web pages, Google Docs and
		// Word put around their content: its children become sibling blocks
		// instead of being flattened into one inline run (#223).
		if ((match?.type ?? 'paragraph') === 'paragraph' && session.hasBlockDescendants(el)) {
			parseWrapperElement(el, blocks, session);
			return;
		}

		const spec = match ? registry?.getNodeSpec(match.type) : undefined;
		const children: (TextNode | InlineNode)[] = spec?.isVoid
			? [createTextNode('')]
			: parseElementToInlineContent(el, session);
		const attrs: Record<string, string | number | boolean> = {
			...(match?.attrs as Record<string, string | number | boolean> | undefined),
		};
		// Known block types only accept declared attributes. The paragraph
		// fallback retains the permissive behavior of registry-free import.
		if (!match || spec?.attrs?.align) extractAlignment(el, attrs, registry);
		if (!match || spec?.attrs?.dir) extractDirection(el, attrs);
		blocks.push(
			createBlockNode(
				nodeType(match?.type ?? 'paragraph'),
				children,
				adoptBlockId(el, adoptedIds),
				Object.keys(attrs).length > 0 ? attrs : undefined,
				extractHTMLId(el),
			),
		);
	} else if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
		blocks.push(createBlockNode(nodeType('paragraph'), [createTextNode(child.textContent.trim())]));
	}
}

/**
 * Recursively parses a list element (`<ul>` or `<ol>`), creating list_item blocks
 * with correct indent depth. Handles nested lists inside `<li>` elements.
 */
function parseListElement(
	listEl: Element,
	listType: string,
	depth: number,
	blocks: BlockNode[],
	session: HTMLParseSession,
	parentDir?: string,
): void {
	for (const child of Array.from(listEl.children)) {
		const tag: string = child.tagName.toLowerCase();

		if (tag === 'li') {
			const li: HTMLElement = child as HTMLElement;

			// Check for checklist: <input type="checkbox">
			const checkbox: HTMLInputElement | null = li.querySelector(':scope > input[type="checkbox"]');
			const isChecklist: boolean = checkbox !== null;
			const checked: boolean = checkbox?.hasAttribute('checked') ?? false;

			const resolvedType: string = isChecklist ? 'checklist' : listType;

			const attrs: Record<string, string | number | boolean> = {
				listType: resolvedType,
				indent: depth,
				checked,
			};

			// Propagate direction: item's own dir > parent list dir
			const liDir: string | null = li.getAttribute('dir');
			const effectiveDir: string | undefined =
				liDir && VALID_DIRECTIONS.has(liDir) ? liDir : parentDir;
			if (effectiveDir) {
				attrs.dir = effectiveDir;
			}

			blocks.push(parseListItemBlock(li, attrs, checkbox, session));

			// Check for nested lists inside this <li>
			for (const liChild of Array.from(li.children)) {
				const liChildTag: string = liChild.tagName.toLowerCase();
				if (liChildTag === 'ul' || liChildTag === 'ol') {
					const nestedType: string = liChildTag === 'ol' ? 'ordered' : 'bullet';
					const nestedDir: string | null = liChild.getAttribute('dir');
					const nestedEffectiveDir: string | undefined =
						nestedDir && VALID_DIRECTIONS.has(nestedDir) ? nestedDir : effectiveDir;
					parseListElement(liChild, nestedType, depth + 1, blocks, session, nestedEffectiveDir);
				}
			}
		} else if (tag === 'ul' || tag === 'ol') {
			// Direct nested list without wrapping <li> — increment depth
			const nestedType: string = tag === 'ol' ? 'ordered' : 'bullet';
			const nestedDir: string | null = child.getAttribute('dir');
			const nestedEffectiveDir: string | undefined =
				nestedDir && VALID_DIRECTIONS.has(nestedDir) ? nestedDir : parentDir;
			parseListElement(child, nestedType, depth + 1, blocks, session, nestedEffectiveDir);
		}
	}
}

/**
 * Parses one `<li>` into its `list_item` block (#194). An item whose children
 * are inline-only stays a leaf; block-level children other than nested lists
 * (a second paragraph, code, a quote, a heading) make it a container with
 * block children. Nested `<ul>`/`<ol>` are excluded here — the caller hoists
 * them into flat siblings one indent deeper. A lone plain paragraph unwraps
 * back to a leaf so the common tight/loose single-paragraph item keeps its
 * inline shape.
 */
function parseListItemBlock(
	li: HTMLElement,
	attrs: Record<string, string | number | boolean>,
	checkbox: HTMLInputElement | null,
	session: HTMLParseSession,
): BlockNode {
	const { adoptedIds } = session;
	const htmlId: string | undefined = extractHTMLId(li);
	const isHoistedList = (node: ChildNode): boolean => {
		if (node.nodeType !== Node.ELEMENT_NODE) return false;
		const tag: string = (node as Element).tagName.toLowerCase();
		return tag === 'ul' || tag === 'ol';
	};
	const hasBlockContent: boolean = Array.from(li.childNodes).some(
		(node) => !isHoistedList(node) && isBlockLevelChild(node, session),
	);

	if (!hasBlockContent) {
		const inlineContent = parseElementToInlineContent(li, session, true);
		return createBlockNode(
			nodeType('list_item'),
			inlineContent,
			adoptBlockId(li, adoptedIds),
			attrs,
			htmlId,
		);
	}

	const skip = (node: ChildNode): boolean => isHoistedList(node) || node === checkbox;
	const innerBlocks: BlockNode[] = parseBlockContainerChildren(li, session, skip);

	// A lone attribute-less paragraph is the leaf shape in disguise.
	const only: BlockNode | undefined = innerBlocks.length === 1 ? innerBlocks[0] : undefined;
	if (only && only.type === 'paragraph' && !only.attrs && !only.htmlId) {
		return createBlockNode(
			nodeType('list_item'),
			getInlineChildren(only),
			adoptBlockId(li, adoptedIds),
			attrs,
			htmlId,
		);
	}

	if (innerBlocks.length === 0) {
		return createBlockNode(
			nodeType('list_item'),
			[createTextNode('')],
			adoptBlockId(li, adoptedIds),
			attrs,
			htmlId,
		);
	}

	return createBlockNode(
		nodeType('list_item'),
		innerBlocks,
		adoptBlockId(li, adoptedIds),
		attrs,
		htmlId,
	);
}

/**
 * Parses a `<table>` element into nested block structure:
 * table > table_row > table_cell > paragraph.
 * Handles `<thead>`, `<tbody>`, `<tfoot>` transparently.
 */
function parseTableElement(tableEl: Element, blocks: BlockNode[], session: HTMLParseSession): void {
	const { adoptedIds, registry } = session;
	const rows: BlockNode[] = [];
	const columnWidthsPx: readonly (number | null)[] | undefined =
		extractTableColumnWidthsPx(tableEl);
	// Like every other block, a cell takes alignment only when its spec declares it.
	const cellsAlign: boolean = !registry || !!registry.getNodeSpec('table_cell')?.attrs?.align;

	// Collect <tr> elements, handling <thead>/<tbody>/<tfoot> wrappers
	const rowElements: Element[] = collectTableRows(tableEl);

	for (const trEl of rowElements) {
		const cells: BlockNode[] = [];

		for (const cellChild of Array.from(trEl.children)) {
			const cellTag: string = cellChild.tagName.toLowerCase();
			if (cellTag !== 'td' && cellTag !== 'th') continue;

			const cellEl: HTMLElement = cellChild as HTMLElement;
			const cellContent: BlockNode[] = parseTableCellContent(cellEl, session);
			const cellAttrs: Record<string, string | number | boolean> = {};
			extractCellSpanAttrs(cellEl, cellAttrs);
			if (cellsAlign) extractAlignment(cellEl, cellAttrs, registry);
			const cellBlock: BlockNode = createBlockNode(
				nodeType('table_cell'),
				cellContent,
				adoptBlockId(cellEl, adoptedIds),
				Object.keys(cellAttrs).length > 0 ? cellAttrs : undefined,
				extractHTMLId(cellEl),
			);
			cells.push(cellBlock);
		}

		const rowAttrs: Record<string, string | number | boolean> = {};
		extractTableRowMinHeight(trEl as HTMLElement, rowAttrs);
		// Preserve empty rows. Besides retaining authored table structure, an empty
		// `<tr>` may carry the canonical minimum-height metadata by itself.
		rows.push(
			createBlockNode(
				nodeType('table_row'),
				cells,
				adoptBlockId(trEl, adoptedIds),
				Object.keys(rowAttrs).length > 0 ? rowAttrs : undefined,
				extractHTMLId(trEl as HTMLElement),
			),
		);
	}

	if (rows.length > 0) {
		const tableAttrs: Record<string, BlockAttrValue> = {};
		extractTableBorderColor(tableEl as HTMLElement, tableAttrs);
		if (columnWidthsPx) tableAttrs.columnWidthsPx = columnWidthsPx;
		blocks.push(
			createBlockNode(
				nodeType('table'),
				rows,
				adoptBlockId(tableEl, adoptedIds),
				Object.keys(tableAttrs).length > 0 ? tableAttrs : undefined,
				extractHTMLId(tableEl as HTMLElement),
			),
		);
	}
}

/** Collects canonical logical column widths from direct `<colgroup>/<col>` children. */
function extractTableColumnWidthsPx(tableEl: Element): readonly (number | null)[] | undefined {
	const widths: (number | null)[] = [];

	for (const child of Array.from(tableEl.children)) {
		const tag: string = child.tagName.toLowerCase();
		if (tag === 'col') {
			appendColumnElementWidths(child as HTMLElement, undefined, widths);
			continue;
		}
		if (tag !== 'colgroup') continue;

		const groupEl: HTMLElement = child as HTMLElement;
		const groupWidth: number | undefined = readTableColumnWidthPx(groupEl);
		const columns: HTMLElement[] = Array.from(groupEl.children).filter(
			(element): element is HTMLElement => element.tagName.toLowerCase() === 'col',
		);
		if (columns.length === 0) {
			appendRepeatedWidth(groupWidth, parseTableColumnSpan(groupEl.getAttribute('span')), widths);
			continue;
		}

		for (const column of columns) appendColumnElementWidths(column, groupWidth, widths);
	}

	return normalizeTableColumnWidthsPx(widths);
}

function appendColumnElementWidths(
	column: HTMLElement,
	inheritedWidth: number | undefined,
	widths: (number | null)[],
): void {
	const width: number | undefined = readTableColumnWidthPx(column) ?? inheritedWidth;
	appendRepeatedWidth(width, parseTableColumnSpan(column.getAttribute('span')), widths);
}

function appendRepeatedWidth(
	width: number | undefined,
	span: number,
	widths: (number | null)[],
): void {
	const remaining: number = MAX_SERIALIZED_TABLE_COLUMNS - widths.length;
	const count: number = Math.min(span, Math.max(0, remaining));
	for (let index = 0; index < count; index++) widths.push(width ?? null);
}

function readTableColumnWidthPx(element: HTMLElement): number | undefined {
	return readTableDimensionPx(element, TABLE_COLUMN_WIDTH_DATA_ATTRIBUTE, ['width'], 'width');
}

/** Extracts one row's validated minimum height from canonical or conventional HTML. */
function extractTableRowMinHeight(
	row: HTMLElement,
	attrs: Record<string, string | number | boolean>,
): void {
	const minHeightPx: number | undefined = readTableDimensionPx(
		row,
		TABLE_ROW_MIN_HEIGHT_DATA_ATTRIBUTE,
		['min-height', 'height'],
		'height',
	);
	if (minHeightPx !== undefined) attrs.minHeightPx = minHeightPx;
}

/** Collects `<tr>` elements from a table, traversing through `<thead>`/`<tbody>`/`<tfoot>`. */
function collectTableRows(tableEl: Element): Element[] {
	const rows: Element[] = [];
	for (const child of Array.from(tableEl.children)) {
		const tag: string = child.tagName.toLowerCase();
		if (tag === 'tr') {
			rows.push(child);
		} else if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
			for (const nested of Array.from(child.children)) {
				if (nested.tagName.toLowerCase() === 'tr') {
					rows.push(nested);
				}
			}
		}
	}
	return rows;
}

/** Regex to extract the `--ntbl-bc` CSS custom property from inline styles. */
const BORDER_COLOR_RE = /--ntbl-bc:\s*(#[0-9a-fA-F]{3,8}|transparent)/;

/** Extracts `borderColor` from a table element's inline style (`--ntbl-bc` CSS variable). */
function extractTableBorderColor(el: HTMLElement, attrs: Record<string, BlockAttrValue>): void {
	const style: string = el.getAttribute('style') ?? '';
	const match: RegExpMatchArray | null = BORDER_COLOR_RE.exec(style);
	if (!match?.[1]) return;
	attrs.borderColor = match[1] === 'transparent' ? 'none' : match[1];
}

/** Extracts `colspan` and `rowspan` attributes from a table cell element. */
function extractCellSpanAttrs(
	el: HTMLElement,
	attrs: Record<string, string | number | boolean>,
): void {
	const colspan: string | null = el.getAttribute('colspan');
	if (colspan) {
		const value: number = parseTableColumnSpan(colspan);
		if (value > 1) attrs.colspan = value;
	}
	const rowspan: string | null = el.getAttribute('rowspan');
	if (rowspan) {
		const value: number = parseTableColumnSpan(rowspan);
		if (value > 1) attrs.rowspan = value;
	}
}

/**
 * Parses a `<blockquote>` into a container block whose children are block nodes
 * (issue #136). Block-level children (lists, paragraphs, headings, nested quotes)
 * are parsed recursively; a quote holding only inline content becomes a single
 * paragraph child so the container invariant (block children only) always holds.
 */
function parseBlockquoteElement(
	el: HTMLElement,
	blocks: BlockNode[],
	session: HTMLParseSession,
): void {
	const innerBlocks: BlockNode[] = parseBlockContainerChildren(el, session);

	// Empty or whitespace-only blockquote: keep a single empty paragraph so the
	// container always holds editable content.
	if (innerBlocks.length === 0) {
		innerBlocks.push(createBlockNode(nodeType('paragraph'), [createTextNode('')]));
	}

	// Preserve direction/alignment on the container so the HTML round-trip is stable.
	const attrs: Record<string, string | number | boolean> = {};
	extractAlignment(el, attrs, session.registry);
	extractDirection(el, attrs);

	blocks.push(
		createBlockNode(
			nodeType('blockquote'),
			innerBlocks,
			adoptBlockId(el, session.adoptedIds),
			Object.keys(attrs).length > 0 ? attrs : undefined,
			extractHTMLId(el),
		),
	);
}

/** Parses a table cell's content into blocks, supporting all block types (lists, quotes, etc.). */
function parseTableCellContent(cellEl: HTMLElement, session: HTMLParseSession): BlockNode[] {
	const cellBlocks: BlockNode[] = parseBlockContainerChildren(cellEl, session);

	// No blocks produced: treat the cell as one empty paragraph.
	if (cellBlocks.length === 0) {
		cellBlocks.push(createBlockNode(nodeType('paragraph'), [createTextNode('')]));
	}

	return cellBlocks;
}

/**
 * Parses the children of a block container (blockquote, table cell, multi-block
 * list item, transparent wrapper) into block nodes. Consecutive inline content
 * (text nodes and inline elements such as
 * `<em>`, `<strong>`, `<a>`) is coalesced into a single paragraph with its marks
 * intact, while genuine block children (paragraphs, headings, lists, tables,
 * nested blockquotes) are parsed recursively. This preserves the common quote
 * shape that mixes text with inline marks as one paragraph (issue #141).
 */
function parseBlockContainerChildren(
	el: HTMLElement,
	session: HTMLParseSession,
	skip?: (node: ChildNode) => boolean,
): BlockNode[] {
	const blocks: BlockNode[] = [];
	let inlineRun: ChildNode[] = [];

	const flushInlineRun = (): void => {
		if (inlineRunHasContent(inlineRun)) {
			blocks.push(
				createBlockNode(nodeType('paragraph'), parseNodesToInlineContent(inlineRun, session)),
			);
		}
		inlineRun = [];
	};

	for (const child of Array.from(el.childNodes)) {
		if (skip?.(child)) continue;
		if (isBlockLevelChild(child, session)) {
			flushInlineRun();
			parseChildNode(child, blocks, session);
		} else {
			inlineRun.push(child);
		}
	}
	flushInlineRun();

	return blocks;
}

/**
 * Both blocks and transparent wrappers around blocks end an inline run.
 * Ordinary inline elements and atomic inline nodes stay inside that run.
 */
function isBlockLevelChild(node: ChildNode, session: HTMLParseSession): boolean {
	if (node.nodeType !== Node.ELEMENT_NODE) return false;
	const el = node as HTMLElement;
	return (
		isHTMLBlockElement(el, session.blockRules, session.inlineRules) ||
		session.hasBlockDescendants(el)
	);
}

/**
 * Parses a transparent wrapper (a `<div>` or an unknown element around
 * block-level children) into the blocks it wraps (#223). The wrapper itself
 * yields no block, so its `id` is not adopted as an `htmlId` (wrapper-only
 * elements never own one). Its `dir` and `text-align`, which CSS inherits into
 * every child, are carried onto child blocks that accept the attribute but do
 * not set their own.
 */
function parseWrapperElement(
	el: HTMLElement,
	blocks: BlockNode[],
	session: HTMLParseSession,
): void {
	const inherited: Record<string, string | number | boolean> = {};
	extractAlignment(el, inherited, session.registry);
	extractDirection(el, inherited);

	const innerBlocks: BlockNode[] = parseBlockContainerChildren(el, session);
	for (const block of innerBlocks) {
		blocks.push(inheritBlockAttrs(block, inherited, session.registry));
	}
}

/**
 * Returns the block extended with every inherited attribute it accepts but does
 * not set itself. With a registry, a block accepts an attribute only when its
 * NodeSpec declares it (mirroring the block parse rule path); without one, all
 * attributes are accepted (mirroring the paragraph fallback path).
 */
function inheritBlockAttrs(
	block: BlockNode,
	inherited: Record<string, string | number | boolean>,
	registry?: SchemaRegistry,
): BlockNode {
	const spec = registry?.getNodeSpec(block.type);
	const attrs: Record<string, BlockAttrValue> = { ...block.attrs };
	let changed = false;
	for (const [name, value] of Object.entries(inherited)) {
		if (attrs[name] !== undefined) continue;
		if (registry && !spec?.attrs?.[name]) continue;
		attrs[name] = value;
		changed = true;
	}
	if (!changed) return block;
	return createBlockNode(block.type, block.children, block.id, attrs, block.htmlId);
}

/** Whether an inline run carries meaningful content (non-whitespace text or any element). */
function inlineRunHasContent(nodes: readonly ChildNode[]): boolean {
	for (const node of nodes) {
		if (node.nodeType === Node.ELEMENT_NODE) return true;
		if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) return true;
	}
	return false;
}

/**
 * Parses an HTML element's inline children into (TextNode | InlineNode)[].
 * Applies mark parse rules and inline node parse rules.
 */
function parseElementToInlineContent(
	el: HTMLElement,
	session: HTMLParseSession,
	skipNestedLists?: boolean,
): (TextNode | InlineNode)[] {
	return parseNodesToInlineContent([el], session, skipNestedLists);
}

/**
 * Walks a list of sibling DOM nodes into inline content, applying mark and
 * inline-node parse rules. DOM ancestors retain the formatting of transparent
 * wrappers even after those wrappers cease to be model blocks. Mixed text and
 * inline elements still coalesce into one sequence with their own marks intact.
 */
function parseNodesToInlineContent(
	nodes: readonly ChildNode[],
	session: HTMLParseSession,
	skipNestedLists?: boolean,
): (TextNode | InlineNode)[] {
	const result: (TextNode | InlineNode)[] = [];
	for (const node of nodes) {
		walkElement(
			node,
			session.ancestorMarks(node),
			result,
			session.markRules,
			session.inlineRules,
			skipNestedLists,
		);
	}

	// A lone <br> as the only content of a block is a placeholder for an empty
	// paragraph (e.g. `<p><br></p>`), not a real hard break. Normalize to empty text.
	if (result.length === 1 && isInlineNode(result[0]) && result[0].inlineType === 'hard_break') {
		return [createTextNode('')];
	}

	return result.length > 0 ? result : [createTextNode('')];
}

/**
 * Recursively walks DOM nodes, collecting marks from parse rules,
 * matching inline node parse rules, and producing TextNodes/InlineNodes.
 */
function walkElement(
	node: Node,
	currentMarks: readonly Mark[],
	result: (TextNode | InlineNode)[],
	markRules: readonly { readonly rule: ParseRule; readonly type: string }[],
	inlineRules: readonly { readonly rule: ParseRule; readonly type: string }[],
	skipNestedLists?: boolean,
): void {
	if (node.nodeType === Node.TEXT_NODE) {
		const text: string = node.textContent ?? '';
		if (text) {
			result.push(createTextNode(text, [...currentMarks]));
		}
		return;
	}

	if (node.nodeType !== Node.ELEMENT_NODE) return;

	const el = node as HTMLElement;
	const tag: string = el.tagName.toLowerCase();

	// Skip nested lists inside <li> (handled by parseListElement)
	if (skipNestedLists && (tag === 'ul' || tag === 'ol')) return;

	// Skip checkbox inputs inside list items (already handled by parseListElement)
	if (skipNestedLists && tag === 'input' && el.getAttribute('type') === 'checkbox') return;

	// Inline nodes are atomic and take precedence over descendant markup.
	const inlineMatch = matchHTMLParseRule(el, inlineRules);
	if (inlineMatch) {
		result.push(
			createInlineNode(
				inlineType(inlineMatch.type) as InlineTypeName,
				inlineMatch.attrs as Readonly<Record<string, string | number | boolean>> | undefined,
				currentMarks,
			),
		);
		return;
	}

	const marks: Mark[] = parseHTMLMarks(el, currentMarks, markRules);
	for (const child of Array.from(el.childNodes)) {
		walkElement(child, marks, result, markRules, inlineRules, skipNestedLists);
	}
}

/** Extracts a validated `dir` attribute or inline `direction` style from an element. */
function extractDirection(el: HTMLElement, attrs: Record<string, string | number | boolean>): void {
	const dir: string | null = el.getAttribute('dir');
	if (dir && VALID_DIRECTIONS.has(dir)) {
		attrs.dir = dir;
		return;
	}

	// Fallback: check inline style `direction: rtl/ltr` (common in paste from Word/Docs)
	const styleDir: string = el.style?.direction ?? '';
	if (styleDir && VALID_DIRECTIONS.has(styleDir)) {
		attrs.dir = styleDir;
	}
}

/** Reads a conforming document-local HTML target from a block element. */
function extractHTMLId(el: HTMLElement): string | undefined {
	return normalizeHTMLId(el.getAttribute('id'));
}

/**
 * Adds the element's validated alignment to attrs: an inline `text-align`
 * (also produced by `styleMap` rehydration), an alignment class registered by
 * the application, or one of notectl's `notectl-align-*` classes.
 */
function extractAlignment(
	el: HTMLElement,
	attrs: Record<string, string | number | boolean>,
	registry?: SchemaRegistry,
): void {
	const align: BlockAlignment | undefined = readElementAlignment(
		el,
		registry?.getAlignmentClassNames(),
	);
	if (align) attrs.align = align;
}

/**
 * Rehydrates class-based HTML by converting notectl class names back to inline styles.
 * This allows existing parse rules (which read inline styles) to work unchanged.
 */
function rehydrateClasses(root: DocumentFragment, styleMap: ReadonlyMap<string, string>): void {
	const elements: NodeListOf<Element> = root.querySelectorAll('[class]');
	for (const el of Array.from(elements)) {
		const htmlEl = el as HTMLElement;
		const classes: string[] = Array.from(htmlEl.classList);
		const toRemove: string[] = [];

		for (const cls of classes) {
			const declarations: string | undefined = styleMap.get(cls);
			if (declarations) {
				// Append declarations to existing inline style
				const existing: string = htmlEl.getAttribute('style') ?? '';
				const separator: string = existing && !existing.endsWith(';') ? '; ' : '';
				htmlEl.setAttribute('style', existing + separator + declarations);
				toRemove.push(cls);
			}
		}

		// Remove rehydrated class names
		for (const cls of toRemove) {
			htmlEl.classList.remove(cls);
		}
	}
}
