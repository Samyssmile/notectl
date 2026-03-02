/**
 * Shared mark rendering utilities used by Reconciler and CursorWrapper.
 *
 * Provides mark rank ordering and DOM element creation for marks,
 * using the SchemaRegistry when available and falling back to
 * built-in defaults.
 */

import type { MarkAttrsFor } from '../model/AttrRegistry.js';
import type { Mark } from '../model/Document.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';

/** Returns the rank for a mark (lower = outermost in the DOM nesting). */
export function getMarkRank(mark: Mark, registry?: SchemaRegistry): number {
	if (registry) {
		const spec = registry.getMarkSpec(mark.type);
		if (spec) return spec.rank ?? 100;
	}
	switch (mark.type) {
		case 'bold':
			return 0;
		case 'italic':
			return 1;
		case 'underline':
			return 2;
		default:
			return 100;
	}
}

/**
 * Wraps an inner DOM node with mark elements from inside-out.
 * Marks are sorted by rank (lower = outermost) before wrapping.
 */
export function wrapNodeWithMarks(
	innerNode: Node,
	marks: readonly Mark[],
	registry?: SchemaRegistry,
): Node {
	if (marks.length === 0) return innerNode;

	const sortedMarks: readonly Mark[] = [...marks].sort(
		(a, b) => getMarkRank(a, registry) - getMarkRank(b, registry),
	);

	let current: Node = innerNode;
	for (let i: number = sortedMarks.length - 1; i >= 0; i--) {
		const mark: Mark | undefined = sortedMarks[i];
		if (!mark) continue;
		const el: HTMLElement = createMarkElement(mark, registry);
		el.appendChild(current);
		current = el;
	}
	return current;
}

/** Creates a DOM element for a mark, using the registry spec or a built-in fallback. */
export function createMarkElement(mark: Mark, registry?: SchemaRegistry): HTMLElement {
	if (registry) {
		const spec = registry.getMarkSpec(mark.type);
		if (spec) {
			return spec.toDOM(mark as Omit<Mark, 'attrs'> & { readonly attrs: MarkAttrsFor<string> });
		}
	}
	switch (mark.type) {
		case 'bold':
			return document.createElement('strong');
		case 'italic':
			return document.createElement('em');
		case 'underline':
			return document.createElement('u');
		default:
			return document.createElement('span');
	}
}
