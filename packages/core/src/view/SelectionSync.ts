/**
 * Selection synchronization between editor state and DOM.
 */

import type { EditorSelection, Position, Selection } from '../model/Selection.js';
import {
	createPosition,
	createSelection,
	isGapCursor,
	isNodeSelection,
} from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import { blockId as toBlockId } from '../model/TypeBrands.js';
import { buildBlockPath, findBlockAncestor } from './DomUtils.js';

interface DOMPosition {
	node: Node;
	offset: number;
}

/** Gets the selection object for writing (collapse, setBaseAndExtent). */
export function getSelection(): globalThis.Selection | null {
	return window.getSelection();
}

/**
 * Endpoints returned by reading selection via getComposedRanges().
 * Used to correctly read selection inside Shadow DOM on Safari 17+,
 * Chrome 137+, and Firefox 142+.
 */
export interface SelectionEndpoints {
	anchorNode: Node;
	anchorOffset: number;
	focusNode: Node;
	focusOffset: number;
}

/**
 * Reads the selection endpoints using getComposedRanges() when inside a
 * Shadow DOM. Returns null if not in a shadow root or the API is unavailable.
 *
 * Handles two call signatures:
 * - Modern (Chrome 137+, Firefox 142+): sel.getComposedRanges({ shadowRoots: [root] })
 * - Legacy (Safari 17+): sel.getComposedRanges(root)
 *
 * StaticRange always uses document order. When `Selection.direction` is
 * `"backward"`, anchor/focus are swapped to reconstruct the correct
 * directional endpoints. When direction is `"none"` or absent the
 * forward (document-order) mapping is used.
 *
 * Note: Safari 17–18 supports getComposedRanges but not
 * Selection.direction — backward selections will be read as forward.
 */
export function readComposedSelection(
	container: HTMLElement,
	sel: globalThis.Selection,
): SelectionEndpoints | null {
	const root = container.getRootNode();
	if (!(root instanceof ShadowRoot)) return null;
	if (!('getComposedRanges' in sel)) return null;

	let ranges: StaticRange[];
	try {
		// Modern syntax (Chrome 137+, Firefox 142+)
		ranges = (
			sel as unknown as {
				getComposedRanges(opts: { shadowRoots: ShadowRoot[] }): StaticRange[];
			}
		).getComposedRanges({ shadowRoots: [root] });
	} catch {
		try {
			// Legacy syntax (Safari 17+)
			ranges = (
				sel as unknown as {
					getComposedRanges(...roots: ShadowRoot[]): StaticRange[];
				}
			).getComposedRanges(root);
		} catch {
			return null;
		}
	}

	const range = ranges[0];
	if (!range) return null;

	const isBackward: boolean =
		'direction' in sel && (sel as unknown as { direction: string }).direction === 'backward';

	return {
		anchorNode: isBackward ? range.endContainer : range.startContainer,
		anchorOffset: isBackward ? range.endOffset : range.startOffset,
		focusNode: isBackward ? range.startContainer : range.endContainer,
		focusOffset: isBackward ? range.startOffset : range.endOffset,
	};
}

/**
 * Reads the DOM selection endpoints, preferring `getComposedRanges()` when
 * the container is inside a Shadow DOM.
 *
 * Returns `null` when `anchorNode` is unavailable (no selection).
 *
 * In Shadow DOM mode the endpoints come from a `StaticRange` which uses
 * document order. `Selection.direction` is used to reconstruct anchor/focus
 * for backward selections.
 */
export function readDOMSelectionEndpoints(
	container: HTMLElement,
	domSel: globalThis.Selection,
): SelectionEndpoints | null {
	const composed: SelectionEndpoints | null = readComposedSelection(container, domSel);
	if (composed) return composed;

	const anchorNode: Node | null = domSel.anchorNode;
	if (!anchorNode) return null;
	const focusNode: Node | null = domSel.focusNode;
	if (!focusNode) return null;

	return {
		anchorNode,
		anchorOffset: domSel.anchorOffset,
		focusNode,
		focusOffset: domSel.focusOffset,
	};
}

/** Syncs the editor state selection to the DOM. */
export function syncSelectionToDOM(container: HTMLElement, selection: EditorSelection): void {
	const domSel = getSelection();
	if (!domSel) return;

	// GapCursor: clear browser selection (gap cursor has no DOM equivalent)
	if (isGapCursor(selection)) {
		domSel.removeAllRanges();
		return;
	}

	// NodeSelection: select the entire block element
	if (isNodeSelection(selection)) {
		const blockEl = container.querySelector(`[data-block-id="${selection.nodeId}"]`);
		if (!blockEl) return;
		const parent = blockEl.parentNode;
		if (!parent) return;
		const childIdx = childIndexOf(parent, blockEl);
		try {
			domSel.setBaseAndExtent(parent, childIdx, parent, childIdx + 1);
		} catch {
			// Selection may fail if DOM is not yet rendered
		}
		return;
	}

	const anchorPos = statePositionToDOM(container, selection.anchor);
	const headPos = statePositionToDOM(container, selection.head);

	if (!anchorPos || !headPos) return;

	try {
		domSel.setBaseAndExtent(anchorPos.node, anchorPos.offset, headPos.node, headPos.offset);
	} catch {
		// Selection may fail if DOM is not yet rendered
	}
}

/** Reads the current DOM selection and converts it to a state selection. */
export function readSelectionFromDOM(container: HTMLElement): Selection | null {
	const domSel = getSelection();
	if (!domSel || domSel.rangeCount === 0) return null;

	const endpoints: SelectionEndpoints | null = readDOMSelectionEndpoints(container, domSel);
	if (!endpoints) return null;

	if (!container.contains(endpoints.anchorNode) || !container.contains(endpoints.focusNode)) {
		return null;
	}

	const anchor = domPositionToState(container, endpoints.anchorNode, endpoints.anchorOffset);
	const head = domPositionToState(container, endpoints.focusNode, endpoints.focusOffset);

	if (!anchor || !head) return null;

	return createSelection(anchor, head);
}

/** Converts a state position (blockId + offset) to a DOM position (node + offset). */
function statePositionToDOM(container: HTMLElement, pos: Position): DOMPosition | null {
	// If path is available, navigate directly to the leaf block
	let blockEl: Element | null = null;
	if (pos.path && pos.path.length > 0) {
		let current: Element = container;
		for (const id of pos.path) {
			const found = current.querySelector(`:scope [data-block-id="${id}"]`);
			if (!found) break;
			current = found;
		}
		if (current !== container && current.getAttribute('data-block-id') === pos.blockId) {
			blockEl = current;
		}
	}
	blockEl ??= container.querySelector(`[data-block-id="${pos.blockId}"]`);
	if (!blockEl) return null;

	// Use contentDOM if available (NodeView blocks like code_block)
	const contentEl: Element = resolveContentRoot(blockEl);

	// Handle empty paragraphs with <br>
	if (contentEl.childNodes.length === 1 && contentEl.firstChild?.nodeName === 'BR') {
		return { node: contentEl, offset: 0 };
	}

	// Walk through text nodes and inline elements to find the correct position
	let remaining = pos.offset;
	const walker = createInlineContentWalker(contentEl);

	let current = walker.nextNode();
	while (current) {
		if (current.nodeType === Node.TEXT_NODE) {
			const len = current.textContent?.length ?? 0;
			if (remaining <= len) {
				return { node: current, offset: remaining };
			}
			remaining -= len;
		} else if (
			current instanceof HTMLElement &&
			current.getAttribute('contenteditable') === 'false'
		) {
			// InlineNode element — width 1 in state offset space
			if (remaining === 0) {
				// Position before this inline element
				const parent = current.parentNode;
				if (parent) {
					const childIndex = childIndexOf(parent, current);
					return { node: parent, offset: childIndex };
				}
			}
			remaining -= 1;
		}
		current = walker.nextNode();
	}

	// Fallback: position at end of block
	const lastChild = contentEl.lastChild;
	if (lastChild) {
		if (lastChild.nodeType === Node.TEXT_NODE) {
			return { node: lastChild, offset: lastChild.textContent?.length ?? 0 };
		}
		return { node: contentEl, offset: contentEl.childNodes.length };
	}

	return { node: contentEl, offset: 0 };
}

/** Converts a DOM position to a state position, including nested path. */
export function domPositionToState(
	container: HTMLElement,
	node: Node,
	domOffset: number,
): Position | null {
	// Find the innermost block element
	const blockEl = findBlockAncestor(container, node);
	if (!blockEl) return null;

	const rawBlockId = blockEl.getAttribute('data-block-id');
	if (!rawBlockId) return null;
	const bid = toBlockId(rawBlockId);

	// Build path by collecting all data-block-id ancestors from leaf to root
	const path = buildBlockPath(container, blockEl);

	// Use contentDOM if available (NodeView blocks like code_block)
	const contentEl: Element = resolveContentRoot(blockEl);

	// Handle clicks on the block or content element itself (e.g. empty paragraph with <br>)
	if (node === blockEl || node === contentEl) {
		const targetEl: Element = node === contentEl ? contentEl : blockEl;
		let childOffset = 0;
		let childIdx = 0;
		for (const child of Array.from(targetEl.childNodes)) {
			if (childIdx >= domOffset) break;
			childOffset += inlineContentWidth(child);
			childIdx++;
		}
		return createPosition(bid, childOffset, path.length > 1 ? path : undefined);
	}

	// If node is outside the contentDOM (e.g. in NodeView header), map to offset 0
	if (contentEl !== blockEl && !contentEl.contains(node)) {
		return createPosition(bid, 0, path.length > 1 ? path : undefined);
	}

	// Calculate offset by walking text nodes and inline elements
	let offset = 0;
	const walker = createInlineContentWalker(contentEl);

	let walkerNode = walker.nextNode();
	while (walkerNode) {
		if (walkerNode === node) {
			if (walkerNode.nodeType === Node.TEXT_NODE) {
				return createPosition(bid, offset + domOffset, path.length > 1 ? path : undefined);
			}
			// Node is an inline element — return offset at its start
			return createPosition(bid, offset, path.length > 1 ? path : undefined);
		}
		if (walkerNode.nodeType === Node.TEXT_NODE) {
			offset += walkerNode.textContent?.length ?? 0;
		} else if (
			walkerNode instanceof HTMLElement &&
			walkerNode.getAttribute('contenteditable') === 'false'
		) {
			offset += 1;
		}
		walkerNode = walker.nextNode();
	}

	// If the node is not a text node, try to find the offset from element context
	if (node.nodeType === Node.ELEMENT_NODE) {
		let childOffset = 0;
		let childIdx = 0;

		for (const child of Array.from(node.childNodes)) {
			if (childIdx >= domOffset) break;
			childOffset += inlineContentWidth(child);
			childIdx++;
		}

		return createPosition(bid, childOffset, path.length > 1 ? path : undefined);
	}

	return createPosition(bid, 0, path.length > 1 ? path : undefined);
}


/** Checks if a node is inside a contentEditable="false" inline element. */
function isInsideInlineElement(node: Node, root: Element): boolean {
	let parent: Node | null = node.parentNode;
	while (parent && parent !== root) {
		if (parent instanceof HTMLElement && parent.getAttribute('contenteditable') === 'false') {
			return true;
		}
		parent = parent.parentNode;
	}
	return false;
}

/**
 * Creates a TreeWalker that visits text nodes and contentEditable="false"
 * inline elements within a block, skipping mark wrappers and nested blocks.
 */
function createInlineContentWalker(blockEl: Element): TreeWalker {
	return document.createTreeWalker(blockEl, NodeFilter.SHOW_ALL, {
		acceptNode: (n: Node) => {
			// Skip cursor wrapper (ZWS for stored marks during IME composition)
			if (n instanceof HTMLElement && n.hasAttribute('data-cursor-wrapper')) {
				return NodeFilter.FILTER_REJECT;
			}
			// Skip anything inside an inline element (contentEditable="false")
			if (isInsideInlineElement(n, blockEl)) return NodeFilter.FILTER_REJECT;
			// Skip nested block elements and their descendants
			if (n instanceof HTMLElement && n.hasAttribute('data-block-id') && n !== blockEl) {
				return NodeFilter.FILTER_REJECT;
			}
			// Accept text nodes
			if (n.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
			// Accept inline elements (contentEditable="false")
			if (n instanceof HTMLElement && n.getAttribute('contenteditable') === 'false') {
				return NodeFilter.FILTER_ACCEPT;
			}
			// Skip other elements (mark wrappers, decoration wrappers) — descend
			return NodeFilter.FILTER_SKIP;
		},
	});
}

/** Returns the child index of a node within its parent. */
function childIndexOf(parent: Node, child: Node): number {
	let idx = 0;
	for (const c of Array.from(parent.childNodes)) {
		if (c === child) return idx;
		idx++;
	}
	return idx;
}

/**
 * Resolves the content root for inline content walking.
 * If the block element has a contentDOM (marked with data-content-dom),
 * returns it so the walker skips NodeView structural elements (headers, etc.).
 */
function resolveContentRoot(blockEl: Element): Element {
	const contentDOM: Element | null = blockEl.querySelector('[data-content-dom]');
	return contentDOM ?? blockEl;
}

/** Counts the inline content width of a DOM node (text length + 1 per inline element). */
function inlineContentWidth(node: Node): number {
	if (node.nodeType === Node.TEXT_NODE) {
		return node.textContent?.length ?? 0;
	}
	if (node instanceof HTMLElement && node.getAttribute('contenteditable') === 'false') {
		return 1;
	}
	// Mark wrapper or other element — sum children
	let width = 0;
	for (const child of Array.from(node.childNodes)) {
		width += inlineContentWidth(child);
	}
	return width;
}
