/**
 * Block and inline content rendering.
 *
 * Renders block nodes to DOM elements using NodeSpec, NodeView,
 * or a fallback paragraph. Renders inline content (text nodes,
 * inline nodes) into block containers.
 */

import type { InlineDecoration } from '../decorations/Decoration.js';
import type { NodeAttrsFor } from '../model/AttrRegistry.js';
import type { BlockNode, TextNode } from '../model/Document.js';
import {
	getBlockChildren,
	getInlineChildren,
	isInlineNode,
	isLeafBlock,
	isTextNode,
} from '../model/Document.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { wrapBlocks } from './BlockWrapperManagement.js';
import { applyNodeDecorations, renderDecoratedContent } from './DecorationRendering.js';
import { createBlockElement } from './DomUtils.js';
import { preserveSpaces, renderInlineNode } from './InlineRendering.js';
import { wrapNodeWithMarks } from './MarkRendering.js';
import type { NodeView } from './NodeView.js';
import type { ReconcileOptions } from './Reconciler.js';

/** Renders a block node to a DOM element, using registry specs or NodeViews. */
export function renderBlock(
	block: BlockNode,
	registry?: SchemaRegistry,
	nodeViews?: Map<string, NodeView>,
	options?: ReconcileOptions,
): HTMLElement {
	const inlineDecos = options?.decorations?.findInline(block.id);

	// 1. Try NodeViewFactory
	const nodeViewRegistry = options?.nodeViewRegistry;
	if (nodeViewRegistry && registry && nodeViews && options?.getState && options?.dispatch) {
		const factory = nodeViewRegistry.getNodeViewFactory(block.type);
		if (factory) {
			const nv: NodeView = factory(block, options.getState, options.dispatch);
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
						const childEl: HTMLElement = renderBlock(child, registry, nodeViews, options);
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
			const el: HTMLElement = spec.toDOM(
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
						const childEl: HTMLElement = renderBlock(child, registry, nodeViews, options);
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
	// Remove stale CursorWrapper spans that may survive into reconciliation
	for (const el of container.querySelectorAll('[data-cursor-wrapper]')) {
		el.remove();
	}

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
	// Append an extra plain <br> so the cursor can be placed on the new line.
	const lastChild = inlineChildren[inlineChildren.length - 1];
	if (lastChild && isInlineNode(lastChild) && lastChild.inlineType === 'hard_break') {
		container.appendChild(document.createElement('br'));
	}
}

/** Renders a text node with marks as nested inline elements. */
function renderTextNode(node: TextNode, registry?: SchemaRegistry): Node {
	if (node.text === '') {
		return document.createTextNode('');
	}
	const textNode: Text = document.createTextNode(preserveSpaces(node.text));
	return wrapNodeWithMarks(textNode, node.marks, registry);
}

/** Fallback paragraph rendering when no NodeSpec is found. */
function renderParagraphFallback(
	block: BlockNode,
	registry?: SchemaRegistry,
	inlineDecos?: readonly InlineDecoration[],
): HTMLElement {
	const p: HTMLElement = createBlockElement('p', block.id);
	p.setAttribute('data-block-type', block.type);
	renderBlockContent(p, block, registry, inlineDecos);
	return p;
}
