/**
 * Utilities for resolving a DOM position from screen coordinates.
 *
 * Provides a fallback chain: `caretPositionFromPoint` → `caretRangeFromPoint`
 * → document fallback (when root is a ShadowRoot).
 */

/** Result of resolving a DOM position from screen coordinates. */
export interface DomPoint {
	readonly node: Node;
	readonly offset: number;
}

/**
 * Tries `caretPositionFromPoint` (standard) then `caretRangeFromPoint`
 * (WebKit fallback) on a single target to resolve a DOM position.
 */
function tryCaretFromPoint(target: Document | ShadowRoot, x: number, y: number): DomPoint | null {
	if ('caretPositionFromPoint' in target) {
		const cp = (target as Document).caretPositionFromPoint(x, y);
		if (cp) {
			return { node: cp.offsetNode, offset: cp.offset };
		}
	}

	if ('caretRangeFromPoint' in target) {
		const range = (target as Document).caretRangeFromPoint(x, y);
		if (range) {
			return { node: range.startContainer, offset: range.startOffset };
		}
	}

	return null;
}

/**
 * Resolves a DOM position from screen coordinates using the best available API.
 *
 * Tries the given root first, then falls back to the ownerDocument when the
 * root is a ShadowRoot and the first attempt returned nothing.
 */
export function domPositionFromPoint(
	root: Document | ShadowRoot,
	x: number,
	y: number,
	ownerDoc?: Document,
): DomPoint | null {
	return (
		tryCaretFromPoint(root, x, y) ??
		(ownerDoc && root !== ownerDoc ? tryCaretFromPoint(ownerDoc, x, y) : null)
	);
}
