/**
 * Block and inline content rendering.
 *
 * Renders block nodes to DOM elements using NodeSpec, NodeView,
 * or a fallback paragraph. Renders inline content (text nodes,
 * inline nodes) into block containers.
 */

import {
	type Decoration,
	type InlineDecoration,
	type WidgetDecoration,
	decorationArraysEqual,
} from '../decorations/Decoration.js';
import type { NodeAttrsFor } from '../model/AttrRegistry.js';
import type { BlockNode } from '../model/Document.js';
import { getBlockChildren, getInlineChildren, isLeafBlock } from '../model/Document.js';
import { normalizeHTMLId } from '../model/HTMLUtils.js';
import type { PluginCallbackExecutor } from '../model/PluginCallbackExecutor.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { wrapBlocks } from './BlockWrapperManagement.js';
import {
	type WidgetDOMPool,
	applyNodeDecorations,
	renderDecoratedContent,
} from './DecorationRendering.js';
import { createBlockElement } from './DomUtils.js';
import type { NodeView } from './NodeView.js';
import { createGuardedNodeView } from './NodeViewCallbackBoundary.js';
import { registerNodeView } from './NodeViewOwnership.js';
import type { ReconcileOptions } from './Reconciler.js';

const renderedContentDecorations = new WeakMap<HTMLElement, readonly Decoration[]>();

/** Renders a block node to a DOM element, using registry specs or NodeViews. */
export function renderBlock(
	block: BlockNode,
	registry?: SchemaRegistry,
	nodeViews?: Map<string, NodeView>,
	options?: ReconcileOptions,
): HTMLElement {
	const inlineDecos = options?.decorations?.findInline(block.id);
	const widgetDecos = options?.decorations?.findWidget(block.id);

	// 1. Try NodeViewFactory
	const nodeViewRegistry = options?.nodeViewRegistry;
	if (nodeViewRegistry && registry && nodeViews && options?.getState && options?.dispatch) {
		const entry = nodeViewRegistry.getNodeViewEntry(block.type);
		if (entry) {
			const nv = createGuardedNodeView(
				entry,
				block,
				options.getState,
				options.dispatch,
				options.callbackExecutor,
			);
			if (!nv) return renderNodeSpecOrFallback(block, registry, nodeViews, options);

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
				renderBlockContent(
					nv.contentDOM,
					block,
					registry,
					inlineDecos,
					widgetDecos,
					options?.widgetDOMPool,
					options?.callbackExecutor,
				);
			} else {
				renderBlockChildren(
					block,
					(child) => nv.getContentDOM?.(child.id) ?? nv.contentDOM,
					registry,
					nodeViews,
					options,
				);
			}

			syncBlockHTMLId(nv.dom, block);
			nv.dom.setAttribute('data-block-type', block.type);
			applyNodeDecorations(nv.dom, block.id, options);
			// Register after descendants so a moved/replaced subtree releases old
			// child owners before replacing the old parent registration.
			registerNodeView(nodeViews, block.id, nv);
			return nv.dom;
		}
	}

	return renderNodeSpecOrFallback(block, registry, nodeViews, options);
}

/** Renders through the schema callback, then the core paragraph fallback. */
function renderNodeSpecOrFallback(
	block: BlockNode,
	registry?: SchemaRegistry,
	nodeViews?: Map<string, NodeView>,
	options?: ReconcileOptions,
): HTMLElement {
	const inlineDecos = options?.decorations?.findInline(block.id);
	const widgetDecos = options?.decorations?.findWidget(block.id);

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
					renderBlockContent(
						el,
						block,
						registry,
						inlineDecos,
						widgetDecos,
						options?.widgetDOMPool,
						options?.callbackExecutor,
					);
				} else {
					renderBlockChildren(block, () => el, registry, nodeViews, options);
				}
			}
			syncBlockHTMLId(el, block);
			el.setAttribute('data-block-type', block.type);
			applyNodeDecorations(el, block.id, options);
			return el;
		}
	}

	// 3. Fallback — render as paragraph
	return renderParagraphFallback(
		block,
		registry,
		inlineDecos,
		widgetDecos,
		options?.widgetDOMPool,
		options?.callbackExecutor,
	);
}

/**
 * Synchronizes the semantic HTML ID owned by a block without disturbing an
 * unrelated ID a third-party NodeView may put on a freshly created element.
 */
export function syncBlockHTMLId(
	el: HTMLElement,
	block: BlockNode,
	previousBlock?: BlockNode,
): void {
	const htmlId: string | undefined = normalizeHTMLId(block.htmlId);
	if (htmlId) {
		el.setAttribute('id', htmlId);
		return;
	}

	const previousHTMLId: string | undefined = normalizeHTMLId(previousBlock?.htmlId);
	if (previousHTMLId && el.getAttribute('id') === previousHTMLId) {
		el.removeAttribute('id');
	}
}

/** Renders block content (inline children) into a container element. */
export function renderBlockContent(
	container: HTMLElement,
	block: BlockNode,
	registry?: SchemaRegistry,
	inlineDecos?: readonly InlineDecoration[],
	widgetDecos?: readonly WidgetDecoration[],
	widgetDOMPool?: WidgetDOMPool,
	callbackExecutor?: PluginCallbackExecutor,
): void {
	const inlineChildren = getInlineChildren(block);
	const desiredDecorations: readonly Decoration[] = [
		...(inlineDecos ?? []),
		...(widgetDecos ?? []),
	];
	renderDecoratedContent(
		container,
		inlineChildren,
		inlineDecos ?? [],
		registry,
		widgetDecos ?? [],
		{
			blockId: block.id,
			pool: widgetDOMPool,
			callbackExecutor,
		},
	);
	renderedContentDecorations.set(container, desiredDecorations);
}

/** Updates only the decoration-owned inline DOM when its rendered snapshot is stale. */
export function syncBlockContentDecorations(
	container: HTMLElement,
	block: BlockNode,
	registry: SchemaRegistry | undefined,
	inlineDecos: readonly InlineDecoration[],
	widgetDecos: readonly WidgetDecoration[],
	callbackExecutor?: PluginCallbackExecutor,
): void {
	const desiredDecorations: readonly Decoration[] = [...inlineDecos, ...widgetDecos];
	const renderedDecorations: readonly Decoration[] | undefined =
		renderedContentDecorations.get(container);
	if (renderedDecorations && decorationArraysEqual(renderedDecorations, desiredDecorations)) {
		return;
	}
	renderBlockContent(
		container,
		block,
		registry,
		inlineDecos,
		widgetDecos,
		undefined,
		callbackExecutor,
	);
}

/** Returns all content areas currently owned by a container NodeView. */
export function getNodeViewContentDOMs(
	nodeView: NodeView,
	block: BlockNode,
): readonly HTMLElement[] {
	const contentDOMs = new Set<HTMLElement>();
	if (nodeView.contentDOM) contentDOMs.add(nodeView.contentDOM);
	for (const child of getBlockChildren(block)) {
		const childContentDOM = nodeView.getContentDOM?.(child.id);
		if (childContentDOM) contentDOMs.add(childContentDOM);
	}
	return [...contentDOMs];
}

/**
 * Replaces the child DOM owned by a container NodeView after its descendants
 * have been torn down. The parent NodeView itself remains mounted.
 */
export function replaceNodeViewChildren(
	nodeView: NodeView,
	block: BlockNode,
	previousContentDOMs: readonly HTMLElement[],
	registry?: SchemaRegistry,
	nodeViews?: Map<string, NodeView>,
	options?: ReconcileOptions,
): void {
	const contentDOMs = new Set<HTMLElement>([
		...previousContentDOMs,
		...getNodeViewContentDOMs(nodeView, block),
	]);
	for (const contentDOM of contentDOMs) contentDOM.replaceChildren();
	renderBlockChildren(
		block,
		(child) => nodeView.getContentDOM?.(child.id) ?? nodeView.contentDOM,
		registry,
		nodeViews,
		options,
	);
}

/** Renders direct block children into their owner-provided content areas. */
function renderBlockChildren(
	block: BlockNode,
	resolveContentDOM: (child: BlockNode) => HTMLElement | null,
	registry?: SchemaRegistry,
	nodeViews?: Map<string, NodeView>,
	options?: ReconcileOptions,
): void {
	const contentDOMChildren = new Map<HTMLElement, BlockNode[]>();
	for (const child of getBlockChildren(block)) {
		const contentDOM = resolveContentDOM(child);
		if (!contentDOM) continue;
		contentDOM.appendChild(renderBlock(child, registry, nodeViews, options));
		const children = contentDOMChildren.get(contentDOM) ?? [];
		children.push(child);
		contentDOMChildren.set(contentDOM, children);
	}
	for (const [contentDOM, children] of contentDOMChildren) {
		wrapBlocks(contentDOM, children, registry);
	}
}

/** Fallback paragraph rendering when no NodeSpec is found. */
function renderParagraphFallback(
	block: BlockNode,
	registry?: SchemaRegistry,
	inlineDecos?: readonly InlineDecoration[],
	widgetDecos?: readonly WidgetDecoration[],
	widgetDOMPool?: WidgetDOMPool,
	callbackExecutor?: PluginCallbackExecutor,
): HTMLElement {
	const p: HTMLElement = createBlockElement('p', block.id);
	syncBlockHTMLId(p, block);
	p.setAttribute('data-block-type', block.type);
	renderBlockContent(p, block, registry, inlineDecos, widgetDecos, widgetDOMPool, callbackExecutor);
	return p;
}
