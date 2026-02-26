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
import { VALID_ALIGNMENTS } from './DocumentSerializer.js';

/** Parses an HTML string into a Document, applying sanitization and schema parse rules. */
export function parseHTMLToDocument(html: string, registry?: SchemaRegistry): Document {
	const allowedTags: string[] = registry ? registry.getAllowedTags() : ['p', 'br', 'div', 'span'];
	const allowedAttrs: string[] = registry ? registry.getAllowedAttrs() : ['style'];

	const template = document.createElement('template');
	template.innerHTML = DOMPurify.sanitize(html, {
		ALLOWED_TAGS: allowedTags,
		ALLOWED_ATTR: allowedAttrs,
	});
	const root: DocumentFragment = template.content;

	const blockRules = registry?.getBlockParseRules() ?? [];
	const blocks: BlockNode[] = [];

	for (const child of Array.from(root.childNodes)) {
		if (child.nodeType === Node.ELEMENT_NODE) {
			const el = child as HTMLElement;
			const tag: string = el.tagName.toLowerCase();

			// Lists need cross-element logic — handle before parse rules
			if (tag === 'ul' || tag === 'ol') {
				const listType: string = tag === 'ol' ? 'ordered' : 'bullet';
				parseListElement(el, listType, 0, blocks, registry);
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

			blocks.push(createBlockNode(nodeType('list_item'), inlineContent, undefined, attrs));

			// Check for nested lists inside this <li>
			for (const liChild of Array.from(li.children)) {
				const liChildTag: string = liChild.tagName.toLowerCase();
				if (liChildTag === 'ul' || liChildTag === 'ol') {
					const nestedType: string = liChildTag === 'ol' ? 'ordered' : 'bullet';
					parseListElement(liChild, nestedType, depth + 1, blocks, registry);
				}
			}
		} else if (tag === 'ul' || tag === 'ol') {
			// Direct nested list without wrapping <li> — increment depth
			const nestedType: string = tag === 'ol' ? 'ordered' : 'bullet';
			parseListElement(child, nestedType, depth + 1, blocks, registry);
		}
	}
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

/** Extracts validated `text-align` from an element's style and adds it to attrs. */
function extractAlignment(el: HTMLElement, attrs: Record<string, string | number | boolean>): void {
	const align: string = el.style?.textAlign ?? '';
	if (align && VALID_ALIGNMENTS.has(align)) {
		attrs.align = align;
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
