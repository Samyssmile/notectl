import type { Mark } from '../model/Document.js';
import type { ParseRule } from '../model/ParseRule.js';
import { markType } from '../model/TypeBrands.js';

/** Parse rules with the node, mark or inline type they produce, in priority order. */
export type ParseRules = readonly { readonly rule: ParseRule; readonly type: string }[];

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
	return createBlockDescendantCheck(blockRules, inlineRules, blockTags)(element);
}

/**
 * Creates a {@link hasHTMLBlockDescendants} check that remembers every
 * element's answer. Parsers ask it for each level of nested wrappers, so
 * without the memo a deep wrapper chain rescans the same subtree at every
 * level (#263). Use one check per parse, while the DOM does not change.
 */
export function createBlockDescendantCheck(
	blockRules: ParseRules,
	inlineRules: ParseRules,
	blockTags: ReadonlySet<string> = BLOCK_TAGS,
): (element: HTMLElement) => boolean {
	const known = new WeakMap<Element, boolean>();
	const check = (element: HTMLElement): boolean => {
		const cached: boolean | undefined = known.get(element);
		if (cached !== undefined) return cached;
		const result: boolean =
			!matchHTMLParseRule(element, inlineRules) &&
			Array.from(element.children).some((child) => {
				const el = child as HTMLElement;
				return isHTMLBlockElement(el, blockRules, inlineRules, blockTags) || check(el);
			});
		known.set(element, result);
		return result;
	};
	return check;
}
