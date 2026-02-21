/**
 * DocumentParser: converts sanitized HTML strings into immutable Document instances.
 * Pure functions — no class state, no DOM mutation beyond a temporary `<template>`.
 */

import DOMPurify from 'dompurify';
import type { BlockNode, Document, Mark, TextNode } from '../model/Document.js';
import { createBlockNode, createDocument, createTextNode } from '../model/Document.js';
import type { ParseRule } from '../model/ParseRule.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { markType, nodeType } from '../model/TypeBrands.js';

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
				for (const li of Array.from(el.querySelectorAll('li'))) {
					const textNodes: TextNode[] = parseElementToTextNodes(li as HTMLElement, registry);
					blocks.push(
						createBlockNode(nodeType('list_item'), textNodes, undefined, {
							listType,
							indent: 0,
							checked: false,
						}),
					);
				}
				continue;
			}

			// Try block parse rules
			const match = matchBlockParseRule(el, blockRules);
			if (match) {
				const textNodes: TextNode[] = parseElementToTextNodes(el, registry);
				blocks.push(
					createBlockNode(
						nodeType(match.type),
						textNodes,
						undefined,
						match.attrs as Record<string, string | number | boolean> | undefined,
					),
				);
				continue;
			}

			// Fallback to paragraph
			const textNodes: TextNode[] = parseElementToTextNodes(el, registry);
			blocks.push(createBlockNode(nodeType('paragraph'), textNodes));
		} else if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
			blocks.push(
				createBlockNode(nodeType('paragraph'), [createTextNode(child.textContent.trim())]),
			);
		}
	}

	if (blocks.length === 0) return createDocument();
	return createDocument(blocks);
}

/** Parses an HTML element's children into TextNode[], applying mark parse rules. */
function parseElementToTextNodes(el: HTMLElement, registry?: SchemaRegistry): TextNode[] {
	const result: TextNode[] = [];
	const markRules = registry?.getMarkParseRules() ?? [];
	walkElement(el, [], result, markRules);
	return result.length > 0 ? result : [createTextNode('')];
}

/** Recursively walks DOM nodes, collecting marks from parse rules and producing TextNodes. */
function walkElement(
	node: Node,
	currentMarks: Mark[],
	result: TextNode[],
	markRules: readonly { readonly rule: ParseRule; readonly type: string }[],
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
		walkElement(child, marks, result, markRules);
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
