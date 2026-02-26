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
 * Resolves a DOM position from screen coordinates using the best available API.
 *
 * Tries `caretPositionFromPoint` first (standard), then `caretRangeFromPoint`
 * (WebKit fallback), and finally tries the ownerDocument when the root is
 * a ShadowRoot and the first two returned nothing.
 */
export function domPositionFromPoint(
	root: Document | ShadowRoot,
	x: number,
	y: number,
	ownerDoc?: Document,
): DomPoint | null {
	let domNode: Node | null = null;
	let domOffset = 0;

	// Standard API
	if ('caretPositionFromPoint' in root) {
		const cp = (root as Document).caretPositionFromPoint(x, y);
		if (cp) {
			domNode = cp.offsetNode;
			domOffset = cp.offset;
		}
	}

	// Fallback
	if (!domNode && 'caretRangeFromPoint' in root) {
		const range = (root as Document).caretRangeFromPoint(x, y);
		if (range) {
			domNode = range.startContainer;
			domOffset = range.startOffset;
		}
	}

	// Also try on the document when the root is a ShadowRoot and returned nothing
	if (!domNode && ownerDoc && root !== ownerDoc) {
		if ('caretRangeFromPoint' in ownerDoc) {
			const range = ownerDoc.caretRangeFromPoint(x, y);
			if (range) {
				domNode = range.startContainer;
				domOffset = range.startOffset;
			}
		}
	}

	if (!domNode) return null;
	return { node: domNode, offset: domOffset };
}
