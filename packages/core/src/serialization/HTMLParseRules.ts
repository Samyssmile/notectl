import type { Mark } from '../model/Document.js';
import type { ParseRule } from '../model/ParseRule.js';
import { markType } from '../model/TypeBrands.js';

type ParseRules = readonly { readonly rule: ParseRule; readonly type: string }[];

/** Structural tags handled by the document parser independently of schema rules. */
const BLOCK_TAGS: ReadonlySet<string> = new Set(['p', 'div', 'ul', 'ol', 'table', 'blockquote']);

/** Returns the first accepting rule in priority order, including its parsed attributes. */
export function matchHTMLParseRule(
	element: HTMLElement,
	rules: ParseRules,
): { readonly type: string; readonly attrs?: Record<string, unknown> } | null {
	const tag: string = element.tagName.toLowerCase();
	for (const { rule, type } of rules) {
		if (rule.tag !== tag) continue;
		const attrs = rule.getAttrs?.(element);
		if (attrs !== false) return { type, ...(attrs ? { attrs } : {}) };
	}
	return null;
}

/** Reads the element's own marks, shared by the inline walker and wrappers. */
export function parseHTMLMarks(
	el: HTMLElement,
	currentMarks: readonly Mark[],
	markRules: readonly { readonly rule: ParseRule; readonly type: string }[],
): Mark[] {
	const tag: string = el.tagName.toLowerCase();
	const marks: Mark[] = [...currentMarks];

	for (const { rule, type } of markRules) {
		if (rule.tag !== tag || marks.some((mark) => mark.type === type)) continue;
		const attrs = rule.getAttrs?.(el);
		if (attrs === false) continue;
		marks.push({
			type: markType(type),
			...(attrs && Object.keys(attrs).length > 0 ? { attrs } : {}),
		} as Mark);
	}

	return marks;
}

/** Inline node rules take precedence, just as they do when parsing inline content. */
export function isHTMLBlockElement(
	element: HTMLElement,
	blockRules: ParseRules,
	inlineRules: ParseRules,
	blockTags: ReadonlySet<string> = BLOCK_TAGS,
): boolean {
	if (matchHTMLParseRule(element, inlineRules)) return false;
	return (
		blockTags.has(element.tagName.toLowerCase()) || matchHTMLParseRule(element, blockRules) !== null
	);
}

/**
 * Looks through transparent intermediate wrappers for block content. Atomic
 * inline nodes own their markup, so their descendants must never be unwrapped.
 */
export function hasHTMLBlockDescendants(
	element: HTMLElement,
	blockRules: ParseRules,
	inlineRules: ParseRules,
	blockTags: ReadonlySet<string> = BLOCK_TAGS,
): boolean {
	if (matchHTMLParseRule(element, inlineRules)) return false;
	return Array.from(element.children).some((child) => {
		const el = child as HTMLElement;
		return (
			isHTMLBlockElement(el, blockRules, inlineRules, blockTags) ||
			hasHTMLBlockDescendants(el, blockRules, inlineRules, blockTags)
		);
	});
}
