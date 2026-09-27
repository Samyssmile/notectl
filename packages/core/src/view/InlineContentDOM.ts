/**
 * Classification of the DOM that renders a block's inline content.
 *
 * Shared by selection mapping and rendered-text reading so both agree on
 * which DOM nodes are document content: text nodes count their length, inline
 * node elements count one position, and view chrome counts nothing.
 */

/** Attribute marking the temporary IME cursor wrapper (see `CursorWrapper`). */
export const CURSOR_WRAPPER_ATTR = 'data-cursor-wrapper';

/** Zero-width space the cursor wrapper holds so the browser can compose into it. */
export const ZERO_WIDTH_SPACE = '​';

/**
 * True when `node` is an InlineNode element — rendered `contenteditable="false"`
 * and counted as width 1 in state offset space.
 */
export function isInlineNodeEl(node: Node | null | undefined): node is HTMLElement {
	return node instanceof HTMLElement && node.getAttribute('contenteditable') === 'false';
}

/**
 * True when `node` is a view-chrome widget (`data-widget`), such as the checklist
 * checkbox marker. Widgets are rendered into the editable DOM for accessibility
 * but are not document content, so they count as zero width in offset space.
 */
export function isWidgetEl(node: Node | null | undefined): node is HTMLElement {
	return node instanceof HTMLElement && node.hasAttribute('data-widget');
}

/** True when `node` is the temporary IME cursor wrapper element. */
export function isCursorWrapperEl(node: Node | null | undefined): node is HTMLElement {
	return node instanceof HTMLElement && node.hasAttribute(CURSOR_WRAPPER_ATTR);
}

/**
 * Resolves the content root for inline content walking.
 * If the block element has a contentDOM (marked with data-content-dom),
 * returns it so the walker skips NodeView structural elements (headers, etc.).
 */
export function resolveContentRoot(blockEl: Element): Element {
	const contentDOM: Element | null = blockEl.querySelector('[data-content-dom]');
	return contentDOM ?? blockEl;
}

export interface InlineContentWalkerOptions {
	/**
	 * Descend into the IME cursor wrapper instead of skipping it. Selection
	 * mapping skips it because its zero-width space is not content; reading
	 * composed text needs it because the browser composes inside it.
	 */
	readonly includeCursorWrapper?: boolean;
}

/**
 * Creates a TreeWalker that visits text nodes and contentEditable="false"
 * inline elements within a block, skipping mark wrappers and nested blocks.
 */
export function createInlineContentWalker(
	blockEl: Element,
	options: InlineContentWalkerOptions = {},
): TreeWalker {
	const includeCursorWrapper: boolean = options.includeCursorWrapper ?? false;
	return document.createTreeWalker(blockEl, NodeFilter.SHOW_ALL, {
		acceptNode: (n: Node) => {
			// The cursor wrapper holds a ZWS for stored marks during IME composition
			if (isCursorWrapperEl(n)) {
				return includeCursorWrapper ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_REJECT;
			}
			// Skip view-chrome widgets (e.g. the checklist checkbox marker). They are
			// contentEditable="false" but not document content, so they carry zero
			// width in offset space and must never become a caret position.
			if (isWidgetEl(n)) return NodeFilter.FILTER_REJECT;
			// Skip anything inside an inline element (contentEditable="false")
			if (isInsideInlineElement(n, blockEl)) return NodeFilter.FILTER_REJECT;
			// Skip nested block elements and their descendants
			if (n instanceof HTMLElement && n.hasAttribute('data-block-id') && n !== blockEl) {
				return NodeFilter.FILTER_REJECT;
			}
			// Accept text nodes
			if (n.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
			// Accept inline elements (contentEditable="false")
			if (isInlineNodeEl(n)) {
				return NodeFilter.FILTER_ACCEPT;
			}
			// Skip other elements (mark wrappers, decoration wrappers) — descend
			return NodeFilter.FILTER_SKIP;
		},
	});
}

/** Checks if a node is inside a contentEditable="false" inline element. */
function isInsideInlineElement(node: Node, root: Element): boolean {
	let parent: Node | null = node.parentNode;
	while (parent && parent !== root) {
		if (isInlineNodeEl(parent)) {
			return true;
		}
		parent = parent.parentNode;
	}
	return false;
}
