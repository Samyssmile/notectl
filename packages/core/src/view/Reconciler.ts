/**
 * Reconciler: diffs old and new state and applies minimal DOM patches.
 * Uses block-level granularity — changed blocks are re-rendered entirely.
 * Supports plugin-registered NodeSpecs, MarkSpecs, and NodeViews via SchemaRegistry.
 */

import type { Decoration, DecorationAttrs, InlineDecoration } from '../decorations/Decoration.js';
import { type DecorationSet, decorationArraysEqual } from '../decorations/Decoration.js';
import type { MarkAttrsFor, NodeAttrsFor } from '../model/AttrRegistry.js';
import type { BlockNode, InlineNode, Mark, TextNode } from '../model/Document.js';
import {
	getBlockChildren,
	getInlineChildren,
	isInlineNode,
	isLeafBlock,
	isTextNode,
	markSetsEqual,
} from '../model/Document.js';
import { createBlockElement } from '../model/NodeSpec.js';
import type { WrapperSpec } from '../model/NodeSpec.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { BlockId } from '../model/TypeBrands.js';
import { blockId as toBlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { NodeView } from './NodeView.js';

export interface ReconcileOptions {
	registry?: SchemaRegistry;
	nodeViews?: Map<string, NodeView>;
	getState?: () => EditorState;
	dispatch?: (tr: import('../state/Transaction.js').Transaction) => void;
	decorations?: DecorationSet;
	oldDecorations?: DecorationSet;
	selectedNodeId?: BlockId;
	previousSelectedNodeId?: BlockId;
	/** When set, the block with this ID is skipped during reconciliation to preserve IME composition. */
	compositionBlockId?: BlockId;
}

/** Reconciles the DOM container to match the new state. */
export function reconcile(
	container: HTMLElement,
	oldState: EditorState | null,
	newState: EditorState,
	options?: ReconcileOptions,
): void {
	const oldBlocks = oldState?.doc.children ?? [];
	const newBlocks = newState.doc.children;
	const registry = options?.registry;
	const nodeViews = options?.nodeViews;

	// Unwrap blocks from existing wrapper elements (e.g. <ul>/<ol>)
	// so the main reconciliation loop sees all blocks as direct children.
	unwrapBlocks(container);

	const oldBlockMap = new Map<BlockId, HTMLElement>();
	for (const child of Array.from(container.children)) {
		const el = child as HTMLElement;
		const bid = el.getAttribute('data-block-id');
		if (bid) {
			oldBlockMap.set(toBlockId(bid), el);
		}
	}

	// Build set of new block IDs for removal detection
	const newBlockIds = new Set(newBlocks.map((b) => b.id));

	// Remove blocks that no longer exist
	for (const [blockId, el] of oldBlockMap) {
		if (!newBlockIds.has(blockId)) {
			container.removeChild(el);
			oldBlockMap.delete(blockId);
			// Destroy NodeView if exists
			const nv = nodeViews?.get(blockId);
			if (nv) {
				nv.destroy?.();
				nodeViews?.delete(blockId);
			}
		}
	}

	// Mapping from old state for change detection
	const oldBlockById = new Map<string, BlockNode>();
	for (const block of oldBlocks) {
		oldBlockById.set(block.id, block);
	}

	// Insert/update blocks in order
	let previousSibling: Element | null = null;

	const selectedNodeId = options?.selectedNodeId;
	const previousSelectedNodeId = options?.previousSelectedNodeId;

	for (const block of newBlocks) {
		const existingEl = oldBlockMap.get(block.id);
		const oldBlock = oldBlockById.get(block.id);

		// Skip reconciliation for the block under active IME composition
		if (options?.compositionBlockId === block.id && existingEl) {
			previousSibling = existingEl;
			continue;
		}

		const oldDecos = options?.oldDecorations?.find(block.id);
		const newDecos = options?.decorations?.find(block.id);

		if (existingEl && oldBlock && !blockChanged(oldBlock, block, oldDecos, newDecos)) {
			// Block unchanged — keep existing DOM
			previousSibling = existingEl;
		} else if (existingEl) {
			// Block changed — try NodeView update first
			const existingNv = nodeViews?.get(block.id);
			if (existingNv) {
				const handled = existingNv.update?.(block) ?? false;
				if (handled) {
					// Re-render inline content into contentDOM for leaf blocks
					if (isLeafBlock(block) && existingNv.contentDOM) {
						existingNv.contentDOM.textContent = '';
						const updatedInlineDecos = options?.decorations?.findInline(block.id);
						renderBlockContent(existingNv.contentDOM, block, registry, updatedInlineDecos);
					}
					previousSibling = existingNv.dom;
					continue;
				}
				// Update not handled — destroy and re-create
				existingNv.destroy?.();
				nodeViews?.delete(block.id);
			}

			const newEl = renderBlock(block, registry, nodeViews, options);
			container.replaceChild(newEl, existingEl);
			previousSibling = newEl;
		} else {
			// New block — insert after previousSibling
			const newEl = renderBlock(block, registry, nodeViews, options);
			if (previousSibling?.nextSibling) {
				container.insertBefore(newEl, previousSibling.nextSibling);
			} else if (!previousSibling && container.firstChild) {
				container.insertBefore(newEl, container.firstChild);
			} else {
				container.appendChild(newEl);
			}
			previousSibling = newEl;
		}

		// Handle NodeSelection visual state (CSS class only — aria-selected is
		// invalid on generic block elements like <figure>, <pre>, etc.)
		if (selectedNodeId === block.id) {
			const nv = nodeViews?.get(block.id);
			if (nv) {
				nv.selectNode?.();
			} else {
				const el = oldBlockMap.get(block.id) ?? previousSibling;
				if (el instanceof HTMLElement) {
					el.classList.add('notectl-node-selected');
				}
			}
		} else if (previousSelectedNodeId === block.id) {
			const nv = nodeViews?.get(block.id);
			if (nv) {
				nv.deselectNode?.();
			} else {
				const el = oldBlockMap.get(block.id) ?? previousSibling;
				if (el instanceof HTMLElement) {
					el.classList.remove('notectl-node-selected');
				}
			}
		}
	}

	// Handle selection for nested NodeViews (e.g. images inside table cells)
	if (previousSelectedNodeId && previousSelectedNodeId !== selectedNodeId) {
		const nested = nodeViews?.get(previousSelectedNodeId);
		if (nested && !newBlockIds.has(previousSelectedNodeId)) {
			nested.deselectNode?.();
		}
	}
	if (selectedNodeId && !newBlockIds.has(selectedNodeId)) {
		const nested = nodeViews?.get(selectedNodeId);
		if (nested) {
			nested.selectNode?.();
		}
	}

	// Group consecutive blocks into wrapper elements (e.g. <ul>/<ol> for list items)
	wrapBlocks(container, newBlocks, registry);
}

/** Checks whether a block has changed by comparing its children, attrs, and decorations. */
function blockChanged(
	oldBlock: BlockNode,
	newBlock: BlockNode,
	oldDecos?: readonly Decoration[],
	newDecos?: readonly Decoration[],
): boolean {
	if (oldBlock.type !== newBlock.type) return true;
	if (oldBlock.children.length !== newBlock.children.length) return true;

	// Compare attrs
	const oldAttrs = oldBlock.attrs;
	const newAttrs = newBlock.attrs;
	if (oldAttrs !== newAttrs) {
		if (!oldAttrs || !newAttrs) return true;
		const oldKeys = Object.keys(oldAttrs);
		const newKeys = Object.keys(newAttrs);
		if (oldKeys.length !== newKeys.length) return true;
		for (const key of oldKeys) {
			if (oldAttrs[key] !== newAttrs[key]) return true;
		}
	}

	for (let i = 0; i < oldBlock.children.length; i++) {
		const oldChild = oldBlock.children[i];
		const newChild = newBlock.children[i];
		if (!oldChild || !newChild) return true;

		if (isTextNode(oldChild) && isTextNode(newChild)) {
			if (oldChild.text !== newChild.text) return true;
			if (!markSetsEqual(oldChild.marks, newChild.marks)) return true;
		} else if (isInlineNode(oldChild) && isInlineNode(newChild)) {
			if (oldChild.inlineType !== newChild.inlineType) return true;
			if (!inlineAttrsEqual(oldChild.attrs, newChild.attrs)) return true;
		} else if (
			!isTextNode(oldChild) &&
			!isTextNode(newChild) &&
			!isInlineNode(oldChild) &&
			!isInlineNode(newChild)
		) {
			// Both are BlockNodes — compare recursively
			if (blockChanged(oldChild as BlockNode, newChild as BlockNode)) return true;
		} else {
			// Different child types
			return true;
		}
	}

	// Compare decorations
	const oldArr = oldDecos ?? [];
	const newArr = newDecos ?? [];
	if (oldArr !== newArr && !decorationArraysEqual(oldArr, newArr)) return true;

	return false;
}

/** Renders a block node to a DOM element, using registry specs or NodeViews. */
export function renderBlock(
	block: BlockNode,
	registry?: SchemaRegistry,
	nodeViews?: Map<string, NodeView>,
	options?: ReconcileOptions,
): HTMLElement {
	const inlineDecos = options?.decorations?.findInline(block.id);

	// 1. Try NodeViewFactory
	if (registry && nodeViews && options?.getState && options?.dispatch) {
		const factory = registry.getNodeViewFactory(block.type);
		if (factory) {
			const nv = factory(block, options.getState, options.dispatch);
			nodeViews.set(block.id, nv);

			// Mark void blocks
			const nvSpec = registry.getNodeSpec(block.type);
			if (nvSpec?.isVoid) {
				nv.dom.setAttribute('data-void', 'true');
			}
			if (nvSpec?.selectable) {
				nv.dom.setAttribute('data-selectable', 'true');
			}

			// Mark contentDOM so SelectionSync can find it
			if (nv.contentDOM && nv.contentDOM !== nv.dom) {
				nv.contentDOM.setAttribute('data-content-dom', 'true');
			}

			// Render children into NodeView content area
			if (isLeafBlock(block) && nv.contentDOM) {
				// Leaf blocks: render inline content (TextNodes) into contentDOM
				renderBlockContent(nv.contentDOM, block, registry, inlineDecos);
			} else {
				// Container blocks: recursively render block children
				const blockChildren = getBlockChildren(block);
				const contentDOMChildren = new Map<HTMLElement, BlockNode[]>();
				for (const child of blockChildren) {
					const contentDOM = nv.getContentDOM?.(child.id) ?? nv.contentDOM;
					if (contentDOM) {
						const childEl = renderBlock(child, registry, nodeViews, options);
						contentDOM.appendChild(childEl);
						let arr = contentDOMChildren.get(contentDOM);
						if (!arr) {
							arr = [];
							contentDOMChildren.set(contentDOM, arr);
						}
						arr.push(child);
					}
				}
				// Wrap blocks in each contentDOM (e.g., list items in table cells → <ul>/<ol>)
				for (const [dom, children] of contentDOMChildren) {
					wrapBlocks(dom, children, registry);
				}
			}

			nv.dom.setAttribute('data-block-type', block.type);
			applyNodeDecorations(nv.dom, block.id, options);
			return nv.dom;
		}
	}

	// 2. Try NodeSpec
	if (registry) {
		const spec = registry.getNodeSpec(block.type);
		if (spec) {
			const el = spec.toDOM(
				block as Omit<BlockNode, 'attrs'> & { readonly attrs: NodeAttrsFor<string> },
			);
			if (spec.isVoid) {
				el.setAttribute('data-void', 'true');
			}
			if (spec.selectable) {
				el.setAttribute('data-selectable', 'true');
			}
			if (!spec.isVoid) {
				if (isLeafBlock(block)) {
					renderBlockContent(el, block, registry, inlineDecos);
				} else {
					// Render block children recursively
					const blockChildren = getBlockChildren(block);
					for (const child of blockChildren) {
						const childEl = renderBlock(child, registry, nodeViews, options);
						el.appendChild(childEl);
					}
					// Wrap blocks (e.g., list items → <ul>/<ol>)
					wrapBlocks(el, blockChildren, registry);
				}
			}
			el.setAttribute('data-block-type', block.type);
			applyNodeDecorations(el, block.id, options);
			return el;
		}
	}

	// 3. Fallback — render as paragraph
	return renderParagraphFallback(block, registry, inlineDecos);
}

/** Renders block content (inline children) into a container element. */
export function renderBlockContent(
	container: HTMLElement,
	block: BlockNode,
	registry?: SchemaRegistry,
	inlineDecos?: readonly InlineDecoration[],
): void {
	const inlineChildren = getInlineChildren(block);

	// Empty block: single empty text node → render <br> placeholder
	if (
		inlineChildren.length === 1 &&
		isTextNode(inlineChildren[0]) &&
		inlineChildren[0].text === ''
	) {
		container.appendChild(document.createElement('br'));
		return;
	}

	// Fast path: no inline decorations
	if (!inlineDecos || inlineDecos.length === 0) {
		for (const child of inlineChildren) {
			if (isTextNode(child)) {
				container.appendChild(renderTextNode(child, registry));
			} else {
				container.appendChild(renderInlineNode(child, registry));
			}
		}
	} else {
		// Decorated path: split content into micro-segments
		renderDecoratedContent(container, inlineChildren, inlineDecos, registry);
	}

	// Trailing <br> hack: when the last child is a hard_break InlineNode,
	// browsers won't render an empty line after a trailing <br>.
	// Append an extra plain <br> (without contenteditable="false") so the
	// cursor can be placed on the new line. SelectionSync skips non-
	// contenteditable, non-text elements, so offset counting stays correct.
	const lastChild = inlineChildren[inlineChildren.length - 1];
	if (lastChild && isInlineNode(lastChild) && lastChild.inlineType === 'hard_break') {
		container.appendChild(document.createElement('br'));
	}
}

/** Fallback paragraph rendering when no NodeSpec is found. */
function renderParagraphFallback(
	block: BlockNode,
	registry?: SchemaRegistry,
	inlineDecos?: readonly InlineDecoration[],
): HTMLElement {
	const p = createBlockElement('p', block.id);
	p.setAttribute('data-block-type', block.type);
	renderBlockContent(p, block, registry, inlineDecos);
	return p;
}

/**
 * Converts spaces for contenteditable rendering.
 * Trailing spaces and double spaces are replaced with \u00a0 (non-breaking space)
 * to prevent the browser from collapsing them.
 */
function preserveSpaces(text: string): string {
	// Replace consecutive spaces: alternate regular and non-breaking
	let result = text.replace(/ {2}/g, ' \u00a0');
	// If the text ends with a space, replace it with nbsp
	if (result.endsWith(' ')) {
		result = `${result.slice(0, -1)}\u00a0`;
	}
	// If the text starts with a space, replace it with nbsp
	if (result.startsWith(' ')) {
		result = `\u00a0${result.slice(1)}`;
	}
	return result;
}

/** Renders a text node with marks as nested inline elements. */
function renderTextNode(node: TextNode, registry?: SchemaRegistry): Node {
	if (node.text === '') {
		return document.createTextNode('');
	}

	const textNode = document.createTextNode(preserveSpaces(node.text));

	if (node.marks.length === 0) {
		return textNode;
	}

	// Sort marks: use MarkSpec.rank if available, otherwise fallback order
	const sortedMarks = [...node.marks].sort(
		(a, b) => markOrder(a, registry) - markOrder(b, registry),
	);

	let current: Node = textNode;

	// Wrap from inside out (last mark is outermost)
	for (let i = sortedMarks.length - 1; i >= 0; i--) {
		const mark = sortedMarks[i];
		if (!mark) continue;
		const el = createMarkElement(mark, registry);
		el.appendChild(current);
		current = el;
	}

	return current;
}

/** Renders an InlineNode, using InlineNodeSpec.toDOM() or a fallback element. */
function renderInlineNode(node: InlineNode, registry?: SchemaRegistry): HTMLElement {
	if (registry) {
		const spec = registry.getInlineNodeSpec(node.inlineType);
		if (spec) {
			const el = spec.toDOM(node);
			el.setAttribute('contenteditable', 'false');
			return el;
		}
	}
	// Fallback: generic non-editable span
	const el = document.createElement('span');
	el.setAttribute('data-inline-type', node.inlineType);
	el.setAttribute('contenteditable', 'false');
	return el;
}

/** Compares two InlineNode attr records for equality. */
function inlineAttrsEqual(
	a: Readonly<Record<string, string | number | boolean>>,
	b: Readonly<Record<string, string | number | boolean>>,
): boolean {
	const aKeys = Object.keys(a);
	const bKeys = Object.keys(b);
	if (aKeys.length !== bKeys.length) return false;
	for (const key of aKeys) {
		if (a[key] !== b[key]) return false;
	}
	return true;
}

function markOrder(mark: Mark, registry?: SchemaRegistry): number {
	if (registry) {
		const spec = registry.getMarkSpec(mark.type);
		if (spec) return spec.rank ?? 100;
	}
	// Fallback order for built-in marks
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

function createMarkElement(mark: Mark, registry?: SchemaRegistry): HTMLElement {
	if (registry) {
		const spec = registry.getMarkSpec(mark.type);
		if (spec)
			return spec.toDOM(mark as Omit<Mark, 'attrs'> & { readonly attrs: MarkAttrsFor<string> });
	}
	// Fallback for built-in marks
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

// --- Decoration Rendering ---

/**
 * Renders inline content with decorations. InlineNodes are width-1 split points
 * rendered as their own elements (not wrapped by decorations).
 *
 * For each child:
 * - TextNode: split by decoration boundaries, render text → marks → decorations
 * - InlineNode: render directly without decoration wrapping
 */
function renderDecoratedContent(
	container: HTMLElement,
	inlineChildren: readonly (TextNode | InlineNode)[],
	inlineDecos: readonly InlineDecoration[],
	registry?: SchemaRegistry,
): void {
	let globalOffset = 0;

	for (const child of inlineChildren) {
		if (isInlineNode(child)) {
			// InlineNodes are rendered directly, not wrapped by decorations
			container.appendChild(renderInlineNode(child, registry));
			globalOffset += 1;
			continue;
		}

		// TextNode: split by decoration boundaries within this node's range
		const textFrom = globalOffset;
		const textTo = globalOffset + child.text.length;

		if (child.text.length === 0) {
			globalOffset = textTo;
			continue;
		}

		// Find split points within this text range
		const splitSet = new Set<number>();
		splitSet.add(textFrom);
		splitSet.add(textTo);
		for (const deco of inlineDecos) {
			const dFrom = Math.max(textFrom, deco.from);
			const dTo = Math.min(textTo, deco.to);
			if (dFrom > textFrom && dFrom < textTo) splitSet.add(dFrom);
			if (dTo > textFrom && dTo < textTo) splitSet.add(dTo);
		}
		const splits = [...splitSet].sort((a, b) => a - b);

		// Render micro-segments
		for (let i = 0; i < splits.length - 1; i++) {
			const from = splits[i];
			const to = splits[i + 1];
			if (from === undefined || to === undefined || from >= to) continue;

			const localFrom = from - textFrom;
			const localTo = to - textFrom;
			const text = child.text.slice(localFrom, localTo);

			// Find decorations that fully cover this micro-segment
			const activeDecos: InlineDecoration[] = [];
			for (const deco of inlineDecos) {
				if (deco.from <= from && deco.to >= to) {
					activeDecos.push(deco);
				}
			}

			// Render: text → marks (inner) → decorations (outer)
			const textNode = document.createTextNode(preserveSpaces(text));
			let current: Node = textNode;

			// Wrap with marks (innermost to outermost)
			if (child.marks.length > 0) {
				const sortedMarks = [...child.marks].sort(
					(a, b) => markOrder(a, registry) - markOrder(b, registry),
				);
				for (let j = sortedMarks.length - 1; j >= 0; j--) {
					const mark = sortedMarks[j];
					if (!mark) continue;
					const el = createMarkElement(mark, registry);
					el.appendChild(current);
					current = el;
				}
			}

			// Wrap with decorations (outermost)
			for (const deco of activeDecos) {
				const el = createDecorationElement(deco.attrs);
				el.appendChild(current);
				current = el;
			}

			container.appendChild(current);
		}

		globalOffset = textTo;
	}
}

/** Creates a DOM element for an inline decoration. */
function createDecorationElement(attrs: DecorationAttrs): HTMLElement {
	const tagName = attrs.nodeName ?? 'span';
	const el = document.createElement(tagName);
	el.setAttribute('data-decoration', 'true');

	if (attrs.class) {
		for (const cls of attrs.class.split(' ')) {
			if (cls) el.classList.add(cls);
		}
	}
	if (attrs.style) {
		el.style.cssText = attrs.style;
	}

	// Apply any other custom attributes
	for (const [key, value] of Object.entries(attrs)) {
		if (key === 'class' || key === 'style' || key === 'nodeName') continue;
		if (value !== undefined) {
			el.setAttribute(key, value);
		}
	}

	return el;
}

/** Applies node decorations (CSS classes/styles) to a block element. */
function applyNodeDecorations(el: HTMLElement, bid: BlockId, options?: ReconcileOptions): void {
	const nodeDecos = options?.decorations?.findNode(bid);
	if (!nodeDecos || nodeDecos.length === 0) return;

	for (const deco of nodeDecos) {
		if (deco.attrs.class) {
			for (const cls of deco.attrs.class.split(' ')) {
				if (cls) el.classList.add(cls);
			}
		}
		if (deco.attrs.style) {
			const current: string = el.style.cssText;
			el.style.cssText = current ? `${current}; ${deco.attrs.style}` : deco.attrs.style;
		}
	}
}

// --- Block Wrapper Management ---

/**
 * Moves block elements out of wrapper elements (e.g. `<ul>`, `<ol>`) so the
 * main reconciliation loop sees all blocks as direct children of the container.
 */
function unwrapBlocks(container: HTMLElement): void {
	const wrappers: Element[] = Array.from(
		container.querySelectorAll(':scope > [data-block-wrapper]'),
	);
	for (const wrapper of wrappers) {
		while (wrapper.firstChild) {
			container.insertBefore(wrapper.firstChild, wrapper);
		}
		wrapper.remove();
	}
}

/**
 * Groups consecutive blocks that declare the same wrapper key into shared
 * wrapper elements (`<ul>`, `<ol>`, etc.). Called after the main reconcile loop.
 */
function wrapBlocks(
	container: HTMLElement,
	blocks: readonly BlockNode[],
	registry?: SchemaRegistry,
): void {
	if (!registry) return;

	// Compute wrapper groups from the block model
	interface WrapperGroup {
		readonly spec: WrapperSpec;
		readonly blockIds: readonly BlockId[];
	}

	const groups: WrapperGroup[] = [];
	let currentSpec: WrapperSpec | null = null;
	let currentIds: BlockId[] = [];

	for (const block of blocks) {
		const nodeSpec = registry.getNodeSpec(block.type);
		const wSpec: WrapperSpec | undefined = nodeSpec?.wrapper?.(block as never);

		if (wSpec && currentSpec && wSpec.key === currentSpec.key) {
			currentIds.push(block.id);
		} else if (wSpec) {
			if (currentSpec && currentIds.length > 0) {
				groups.push({ spec: currentSpec, blockIds: currentIds });
			}
			currentSpec = wSpec;
			currentIds = [block.id];
		} else {
			if (currentSpec && currentIds.length > 0) {
				groups.push({ spec: currentSpec, blockIds: currentIds });
			}
			currentSpec = null;
			currentIds = [];
		}
	}
	if (currentSpec && currentIds.length > 0) {
		groups.push({ spec: currentSpec, blockIds: currentIds });
	}

	// Apply wrapper elements to the DOM
	for (const group of groups) {
		const firstEl: HTMLElement | null = container.querySelector(
			`[data-block-id="${group.blockIds[0]}"]`,
		);
		if (!firstEl) continue;

		const wrapper: HTMLElement = document.createElement(group.spec.tag);
		wrapper.setAttribute('data-block-wrapper', group.spec.key);
		if (group.spec.className) {
			wrapper.className = group.spec.className;
		}
		if (group.spec.attrs) {
			for (const [key, value] of Object.entries(group.spec.attrs)) {
				wrapper.setAttribute(key, value);
			}
		}

		firstEl.before(wrapper);
		for (const bid of group.blockIds) {
			const el: HTMLElement | null = container.querySelector(`[data-block-id="${bid}"]`);
			if (el) {
				wrapper.appendChild(el);
			}
		}
	}
}
