/**
 * State shared by one HTML import: the registry's parse rules, read once, the
 * block ids adopted so far, and per-element answers the parser needs again and
 * again. Transparent wrappers (#223) make the parser ask about the same
 * elements at every nesting level, so each answer is computed once per element
 * instead of once per level (#263).
 */

import type { Mark } from '../model/Document.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { type ParseRules, createBlockDescendantCheck, parseHTMLMarks } from './HTMLParseRules.js';

export interface HTMLParseSession {
	readonly registry?: SchemaRegistry;
	readonly blockRules: ParseRules;
	readonly inlineRules: ParseRules;
	readonly markRules: ParseRules;
	/** HTML block ids adopted so far, so a repeated id gets a fresh one. */
	readonly adoptedIds: Set<string>;
	/** Whether `element` wraps block-level content, looking through transparent wrappers. */
	hasBlockDescendants(element: HTMLElement): boolean;
	/** The marks the ancestors of `node` apply to it, such as a wrapper's link or color. */
	ancestorMarks(node: Node): readonly Mark[];
}

/**
 * Creates the session for one parse. The DOM must not change while it is in
 * use, because answers are remembered per element.
 */
export function createHTMLParseSession(registry?: SchemaRegistry): HTMLParseSession {
	const blockRules: ParseRules = registry?.getBlockParseRules() ?? [];
	const inlineRules: ParseRules = registry?.getInlineParseRules() ?? [];
	const markRules: ParseRules = registry?.getMarkParseRules() ?? [];
	const ownMarks = new WeakMap<Element, readonly Mark[]>();

	const marksOf = (element: HTMLElement): readonly Mark[] => {
		const cached: readonly Mark[] | undefined = ownMarks.get(element);
		if (cached) return cached;
		const parent: HTMLElement | null = element.parentElement;
		const marks: readonly Mark[] = parseHTMLMarks(
			element,
			parent ? marksOf(parent) : [],
			markRules,
		);
		ownMarks.set(element, marks);
		return marks;
	};

	return {
		registry,
		blockRules,
		inlineRules,
		markRules,
		adoptedIds: new Set<string>(),
		hasBlockDescendants: createBlockDescendantCheck(blockRules, inlineRules),
		ancestorMarks: (node: Node): readonly Mark[] =>
			node.parentElement ? marksOf(node.parentElement) : [],
	};
}
