/**
 * DocumentParser: converts sanitized HTML strings into immutable Document instances.
 * Pure functions — no class state, no DOM mutation beyond a temporary `<template>`.
 */

import DOMPurify from 'dompurify';
import type { BlockNode, Document, InlineNode, Mark, TextNode } from '../model/Document.js';
import {
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
} from '../model/Document.js';
import type { ParseRule } from '../model/ParseRule.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { type InlineTypeName, inlineType, markType, nodeType } from '../model/TypeBrands.js';
import { VALID_ALIGNMENTS, VALID_DIRECTIONS } from './DocumentSerializer.js';

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
	const allowedAttrs: string[] = registry ? registry.getAllowedAttrs() : ['style', 'dir'];

	// When a styleMap is provided, also allow `class` through DOMPurify
	// so we can read class names and rehydrate styles before parsing.
	if (options?.styleMap && !allowedAttrs.includes('class')) {
		allowedAttrs.push('class');
	}

	const template = document.createElement('template');
	template.innerHTML = DOMPurify.sanitize(html, {
		ALLOWED_TAGS: allowedTags,
		ALLOWED_ATTR: allowedAttrs,
	});
	const root: DocumentFragment = template.content;

	// Rehydrate class-based HTML: convert notectl class names back to inline styles
	if (options?.styleMap) {
		rehydrateClasses(root, options.styleMap);
	}

	const blockRules = registry?.getBlockParseRules() ?? [];
	const blocks: BlockNode[] = [];

	for (const child of Array.from(root.childNodes)) {
		if (child.nodeType === Node.ELEMENT_NODE) {
			const el = child as HTMLElement;
			const tag: string = el.tagName.toLowerCase();

			// Lists need cross-element logic — handle before parse rules
			if (tag === 'ul' || tag === 'ol') {
				const listType: string = tag === 'ol' ? 'ordered' : 'bullet';
				const listDir: string | null = el.getAttribute('dir');
				const parentDir: string | undefined =
					listDir && VALID_DIRECTIONS.has(listDir) ? listDir : undefined;
				parseListElement(el, listType, 0, blocks, registry, parentDir);
				continue;
			}

			// Tables produce nested block structure: table > table_row > table_cell > paragraph
			if (tag === 'table') {
				parseTableElement(el, blocks, registry);
				continue;
			}

			// Try block parse rules
			const match = matchBlockParseRule(el, blockRules);
			if (match) {
				const inlineContent = parseElementToInlineContent(el, registry);
				const attrs: Record<string, string | number | boolean> = {
					...(match.attrs as Record<string, string | number | boolean> | undefined),
				};
				extractAlignment(el, attrs);
				extractDirection(el, attrs);
				blocks.push(
					createBlockNode(
						nodeType(match.type),
						inlineContent,
						undefined,
						Object.keys(attrs).length > 0 ? attrs : undefined,
					),
				);
				continue;
			}

			// Fallback to paragraph
			const inlineContent = parseElementToInlineContent(el, registry);
			const attrs: Record<string, string | number | boolean> = {};
			extractAlignment(el, attrs);
			extractDirection(el, attrs);
			blocks.push(
				createBlockNode(
					nodeType('paragraph'),
					inlineContent,
					undefined,
					Object.keys(attrs).length > 0 ? attrs : undefined,
				),
			);
		} else if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
			blocks.push(
				createBlockNode(nodeType('paragraph'), [createTextNode(child.textContent.trim())]),
			);
		}
	}

	if (blocks.length === 0) return createDocument();
	return createDocument(blocks);
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
	registry?: SchemaRegistry,
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

			const inlineContent = parseElementToInlineContent(li, registry, true);
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

			blocks.push(createBlockNode(nodeType('list_item'), inlineContent, undefined, attrs));

			// Check for nested lists inside this <li>
			for (const liChild of Array.from(li.children)) {
				const liChildTag: string = liChild.tagName.toLowerCase();
				if (liChildTag === 'ul' || liChildTag === 'ol') {
					const nestedType: string = liChildTag === 'ol' ? 'ordered' : 'bullet';
					const nestedDir: string | null = liChild.getAttribute('dir');
					const nestedEffectiveDir: string | undefined =
						nestedDir && VALID_DIRECTIONS.has(nestedDir) ? nestedDir : effectiveDir;
					parseListElement(liChild, nestedType, depth + 1, blocks, registry, nestedEffectiveDir);
				}
			}
		} else if (tag === 'ul' || tag === 'ol') {
			// Direct nested list without wrapping <li> — increment depth
			const nestedType: string = tag === 'ol' ? 'ordered' : 'bullet';
			const nestedDir: string | null = child.getAttribute('dir');
			const nestedEffectiveDir: string | undefined =
				nestedDir && VALID_DIRECTIONS.has(nestedDir) ? nestedDir : parentDir;
			parseListElement(child, nestedType, depth + 1, blocks, registry, nestedEffectiveDir);
		}
	}
}

/**
 * Parses a `<table>` element into nested block structure:
 * table > table_row > table_cell > paragraph.
 * Handles `<thead>`, `<tbody>`, `<tfoot>` transparently.
 */
function parseTableElement(tableEl: Element, blocks: BlockNode[], registry?: SchemaRegistry): void {
	const rows: BlockNode[] = [];

	// Collect <tr> elements, handling <thead>/<tbody>/<tfoot> wrappers
	const rowElements: Element[] = collectTableRows(tableEl);

	for (const trEl of rowElements) {
		const cells: BlockNode[] = [];

		for (const cellChild of Array.from(trEl.children)) {
			const cellTag: string = cellChild.tagName.toLowerCase();
			if (cellTag !== 'td' && cellTag !== 'th') continue;

			const cellEl: HTMLElement = cellChild as HTMLElement;
			const cellContent: BlockNode[] = parseTableCellContent(cellEl, registry);
			const cellAttrs: Record<string, string | number | boolean> = {};
			extractCellSpanAttrs(cellEl, cellAttrs);
			const cellBlock: BlockNode = createBlockNode(
				nodeType('table_cell'),
				cellContent,
				undefined,
				Object.keys(cellAttrs).length > 0 ? cellAttrs : undefined,
			);
			cells.push(cellBlock);
		}

		if (cells.length > 0) {
			rows.push(createBlockNode(nodeType('table_row'), cells));
		}
	}

	if (rows.length > 0) {
		const tableAttrs: Record<string, string | number | boolean> = {};
		extractTableBorderColor(tableEl as HTMLElement, tableAttrs);
		blocks.push(
			createBlockNode(
				nodeType('table'),
				rows,
				undefined,
				Object.keys(tableAttrs).length > 0 ? tableAttrs : undefined,
			),
		);
	}
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
function extractTableBorderColor(
	el: HTMLElement,
	attrs: Record<string, string | number | boolean>,
): void {
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
		const value: number = Number.parseInt(colspan, 10);
		if (value > 1) attrs.colspan = value;
	}
	const rowspan: string | null = el.getAttribute('rowspan');
	if (rowspan) {
		const value: number = Number.parseInt(rowspan, 10);
		if (value > 1) attrs.rowspan = value;
	}
}

/** Parses a table cell's content into paragraph blocks. */
function parseTableCellContent(cellEl: HTMLElement, registry?: SchemaRegistry): BlockNode[] {
	const cellBlocks: BlockNode[] = [];

	// Check for block-level children (paragraphs, etc.)
	let hasBlockChildren = false;
	for (const child of Array.from(cellEl.children)) {
		const tag: string = child.tagName.toLowerCase();
		if (tag === 'p' || tag === 'div' || tag === 'h1' || tag === 'h2' || tag === 'h3') {
			hasBlockChildren = true;
			break;
		}
	}

	if (hasBlockChildren) {
		for (const child of Array.from(cellEl.childNodes)) {
			if (child.nodeType === Node.ELEMENT_NODE) {
				const el = child as HTMLElement;
				const inlineContent = parseElementToInlineContent(el, registry);
				const attrs: Record<string, string | number | boolean> = {};
				extractAlignment(el, attrs);
				extractDirection(el, attrs);
				cellBlocks.push(
					createBlockNode(
						nodeType('paragraph'),
						inlineContent,
						undefined,
						Object.keys(attrs).length > 0 ? attrs : undefined,
					),
				);
			} else if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
				cellBlocks.push(
					createBlockNode(nodeType('paragraph'), [createTextNode(child.textContent.trim())]),
				);
			}
		}
	}

	// No block children or empty: treat entire cell content as one paragraph
	if (cellBlocks.length === 0) {
		const inlineContent = parseElementToInlineContent(cellEl, registry);
		cellBlocks.push(createBlockNode(nodeType('paragraph'), inlineContent));
	}

	return cellBlocks;
}

/**
 * Parses an HTML element's inline children into (TextNode | InlineNode)[].
 * Applies mark parse rules and inline node parse rules.
 */
function parseElementToInlineContent(
	el: HTMLElement,
	registry?: SchemaRegistry,
	skipNestedLists?: boolean,
): (TextNode | InlineNode)[] {
	const result: (TextNode | InlineNode)[] = [];
	const markRules = registry?.getMarkParseRules() ?? [];
	const inlineRules = registry?.getInlineParseRules() ?? [];
	walkElement(el, [], result, markRules, inlineRules, skipNestedLists);
	return result.length > 0 ? result : [createTextNode('')];
}

/**
 * Recursively walks DOM nodes, collecting marks from parse rules,
 * matching inline node parse rules, and producing TextNodes/InlineNodes.
 */
function walkElement(
	node: Node,
	currentMarks: Mark[],
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

	// Try inline node parse rules first (atomic — no recursion)
	for (const entry of inlineRules) {
		if (entry.rule.tag !== tag) continue;

		if (entry.rule.getAttrs) {
			const attrs = entry.rule.getAttrs(el);
			if (attrs === false) continue;
			result.push(
				createInlineNode(
					inlineType(entry.type) as InlineTypeName,
					attrs as Readonly<Record<string, string | number | boolean>>,
				),
			);
			return;
		}

		result.push(createInlineNode(inlineType(entry.type) as InlineTypeName));
		return;
	}

	const marks: Mark[] = [...currentMarks];

	// Try mark parse rules — collect all matching marks for this element
	const matchedTypes = new Set<string>();
	for (const entry of markRules) {
		if (entry.rule.tag !== tag) continue;
		if (matchedTypes.has(entry.type)) continue;

		if (entry.rule.getAttrs) {
			const attrs = entry.rule.getAttrs(el);
			if (attrs === false) continue;
			if (!marks.some((m) => m.type === entry.type)) {
				marks.push({
					type: markType(entry.type),
					...(Object.keys(attrs).length > 0 ? { attrs } : {}),
				} as Mark);
				matchedTypes.add(entry.type);
			}
		} else {
			if (!marks.some((m) => m.type === entry.type)) {
				marks.push({ type: markType(entry.type) });
				matchedTypes.add(entry.type);
			}
		}
	}

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

/** Legacy physical → logical alignment mapping for backward-compatible parsing. */
const LEGACY_ALIGNMENT_MAP: Readonly<Record<string, string>> = { left: 'start', right: 'end' };

/** Extracts validated `text-align` from an element's style or class and adds it to attrs. */
function extractAlignment(el: HTMLElement, attrs: Record<string, string | number | boolean>): void {
	// Check inline style first (works for both normal and rehydrated HTML)
	let align: string = el.style?.textAlign ?? '';
	const mappedAlign: string | undefined = LEGACY_ALIGNMENT_MAP[align];
	if (mappedAlign) align = mappedAlign;
	if (align && VALID_ALIGNMENTS.has(align)) {
		attrs.align = align;
		return;
	}

	// Check for notectl-align-* class names (from class-based HTML)
	for (const cls of Array.from(el.classList)) {
		const match: RegExpMatchArray | null = cls.match(/^notectl-align-(\w+)$/);
		let alignValue: string | undefined = match?.[1];
		const mappedAlignValue: string | undefined = LEGACY_ALIGNMENT_MAP[alignValue ?? ''];
		if (mappedAlignValue) alignValue = mappedAlignValue;
		if (alignValue && VALID_ALIGNMENTS.has(alignValue)) {
			attrs.align = alignValue;
			return;
		}
	}
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

/** Matches an element against block parse rules. Returns matched type and attrs. */
function matchBlockParseRule(
	el: HTMLElement,
	rules: readonly { readonly rule: ParseRule; readonly type: string }[],
): { readonly type: string; readonly attrs?: Record<string, unknown> } | null {
	const tag: string = el.tagName.toLowerCase();
	for (const entry of rules) {
		if (entry.rule.tag !== tag) continue;
		if (entry.rule.getAttrs) {
			const attrs = entry.rule.getAttrs(el);
			if (attrs === false) continue;
			return { type: entry.type, attrs };
		}
		return { type: entry.type };
	}
	return null;
}
