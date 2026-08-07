/**
 * Reconciler: diffs old and new state and applies minimal DOM patches.
 * Uses block-level granularity — changed blocks are re-rendered entirely.
 *
 * Orchestrates block rendering, wrapper management, and change detection.
 * Actual rendering logic is delegated to BlockRendering, DecorationRendering,
 * InlineRendering, and BlockWrapperManagement modules.
 */

import type { DecorationSet } from '../decorations/Decoration.js';
import type { BlockNode, ChildNode } from '../model/Document.js';
import {
	blockAttrsEqual,
	isInlineNode,
	isLeafBlock,
	isTextNode,
	markSetsEqual,
} from '../model/Document.js';
import type { PluginCallbackExecutor } from '../model/PluginCallbackExecutor.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { BlockId } from '../model/TypeBrands.js';
import { blockId as toBlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import {
	getNodeViewContentDOMs,
	renderBlock,
	renderBlockContent,
	replaceNodeViewChildren,
	syncBlockContentDecorations,
	syncBlockHTMLId,
} from './BlockRendering.js';
import {
	getRenderedBlockElements,
	insertAfterPreviousSibling,
	reconcileWrappers,
	removeBlockElement,
	replaceBlockElement,
} from './BlockWrapperManagement.js';
import {
	type WidgetDOMPool,
	clearNodeDecorations,
	collectWidgetDOMPool,
	syncNodeDecorations,
} from './DecorationRendering.js';
import type { NodeView } from './NodeView.js';
import { destroyNodeViewSubtree } from './NodeViewOwnership.js';
import type { NodeViewRegistry } from './NodeViewRegistry.js';

// Re-exports for backwards compatibility
export { renderBlock, renderBlockContent } from './BlockRendering.js';

export interface ReconcileOptions {
	registry?: SchemaRegistry;
	nodeViewRegistry?: NodeViewRegistry;
	nodeViews?: Map<string, NodeView>;
	getState?: () => EditorState;
	dispatch?: (tr: import('../state/Transaction.js').Transaction) => void;
	/** Shared boundary for callbacks owned by plugin renderers and NodeViews. */
	callbackExecutor?: PluginCallbackExecutor;
	decorations?: DecorationSet;
	oldDecorations?: DecorationSet;
	selectedNodeId?: BlockId;
	previousSelectedNodeId?: BlockId;
	/** When set, the block with this ID is skipped during reconciliation to preserve IME composition. */
	compositionBlockId?: BlockId;
	/** Reconciliation-scoped keyed widget DOM available while block elements are replaced. @internal */
	widgetDOMPool?: WidgetDOMPool;
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
	const renderingOptions: ReconcileOptions = {
		...options,
		widgetDOMPool: collectWidgetDOMPool(container),
	};
	const oldBlockById = new Map<string, BlockNode>();
	for (const block of oldBlocks) oldBlockById.set(block.id, block);

	// Skip wrapper reconciliation during active IME composition — moving DOM
	// nodes breaks the browser's composition session. Wrappers are structural
	// (based on block types) and don't change during text composition; the next
	// non-composing reconcile will fix them.
	const isComposing = options?.compositionBlockId != null;

	const oldBlockMap = new Map<BlockId, HTMLElement>();
	for (const el of getRenderedBlockElements(container)) {
		const bid = el.getAttribute('data-block-id');
		if (bid) oldBlockMap.set(toBlockId(bid), el);
	}

	// Build set of new block IDs for removal detection
	const newBlockIds = new Set(newBlocks.map((b) => b.id));

	// Remove blocks that no longer exist
	for (const [bid, el] of oldBlockMap) {
		if (!newBlockIds.has(bid)) {
			const oldBlock = oldBlockById.get(bid);
			if (oldBlock) {
				destroyNodeViewSubtree(oldBlock, nodeViews, { ownerDOM: el });
			} else {
				const nodeView = nodeViews?.get(bid);
				nodeView?.destroy?.();
				nodeViews?.delete(bid);
			}
			removeBlockElement(el);
			oldBlockMap.delete(bid);
		}
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

		if (existingEl && oldBlock && !blockChanged(oldBlock, block)) {
			// Block unchanged — keep existing DOM
			previousSibling = existingEl;
		} else if (existingEl) {
			// Block changed — try NodeView update first
			const existingNv = nodeViews?.get(block.id);
			let updatedInPlace = false;
			if (existingNv && oldBlock) {
				const previousContentDOMs = getNodeViewContentDOMs(existingNv, oldBlock);
				clearNodeDecorations(existingNv.dom);
				const handled = existingNv.update?.(block) ?? false;
				if (handled) {
					syncBlockHTMLId(existingNv.dom, block, oldBlock);
					const childrenChanged = blockChildrenChanged(oldBlock, block);
					if (childrenChanged) {
						destroyNodeViewSubtree(oldBlock, nodeViews, {
							includeRoot: false,
							ownerDOM: existingEl,
						});
					}
					// Re-render inline content into contentDOM for leaf blocks
					if (isLeafBlock(block) && existingNv.contentDOM) {
						// A composite-to-leaf transition changes ownership from descendant
						// NodeViews to inline rendering. Release every old content area before
						// creating inline DOM so no stale subtree remains mounted.
						if (!isLeafBlock(oldBlock)) {
							for (const contentDOM of previousContentDOMs) contentDOM.replaceChildren();
						}
						const updatedInlineDecos = options?.decorations?.findInline(block.id);
						const updatedWidgetDecos = options?.decorations?.findWidget(block.id);
						renderBlockContent(
							existingNv.contentDOM,
							block,
							registry,
							updatedInlineDecos,
							updatedWidgetDecos,
							renderingOptions.widgetDOMPool,
							renderingOptions.callbackExecutor,
						);
					} else if (childrenChanged) {
						replaceNodeViewChildren(
							existingNv,
							block,
							previousContentDOMs,
							registry,
							nodeViews,
							renderingOptions,
						);
					}
					previousSibling = existingNv.dom;
					updatedInPlace = true;
				}
			}

			if (!updatedInPlace) {
				// The old subtree must be released before replacement factories can
				// register new NodeViews under the same descendant IDs.
				if (oldBlock) {
					destroyNodeViewSubtree(oldBlock, nodeViews, { ownerDOM: existingEl });
				} else if (existingNv) {
					existingNv.destroy?.();
					nodeViews?.delete(block.id);
				}
				const newEl = renderBlock(block, registry, nodeViews, renderingOptions);
				replaceBlockElement(existingEl, newEl, container);
				previousSibling = newEl;
			}
		} else {
			// New block — insert after previousSibling
			const newEl = renderBlock(block, registry, nodeViews, renderingOptions);
			insertAfterPreviousSibling(container, previousSibling, newEl);
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

	// Reconcile wrapper elements (e.g. <ul>/<ol> for list items) with minimal
	// DOM mutations. When wrapper structure is unchanged, this is a no-op.
	if (!isComposing && registry) {
		reconcileWrappers(container, newBlocks, registry);
	}

	// Decorations may target descendants of an unchanged composite root.
	// Synchronize node presentation and leaf-content decorations in place so
	// nested NodeViews do not require destructive parent renders.
	for (const element of container.querySelectorAll<HTMLElement>('[data-block-id]')) {
		const rawId: string | null = element.getAttribute('data-block-id');
		if (!rawId) continue;
		const blockId = toBlockId(rawId);
		syncNodeDecorations(element, blockId, options);

		const renderedBlock = newState.getBlock(blockId);
		if (!renderedBlock || !isLeafBlock(renderedBlock)) continue;
		if (options?.compositionBlockId === blockId) continue;
		const contentDOM = resolveLeafContentDOM(element, renderedBlock, registry, nodeViews);
		if (!contentDOM) continue;
		syncBlockContentDecorations(
			contentDOM,
			renderedBlock,
			registry,
			options?.decorations?.findInline(blockId) ?? [],
			options?.decorations?.findWidget(blockId) ?? [],
			options?.callbackExecutor,
		);
	}
}

/**
 * Resolves the DOM region owned by inline content without treating an atomic
 * node's presentation DOM as editable content. A null NodeView contentDOM and
 * a void NodeSpec are explicit ownership boundaries, not missing values that
 * should fall back to the block root.
 */
function resolveLeafContentDOM(
	element: HTMLElement,
	block: BlockNode,
	registry: SchemaRegistry | undefined,
	nodeViews: Map<string, NodeView> | undefined,
): HTMLElement | null {
	const nodeView = nodeViews?.get(block.id);
	if (nodeView) return nodeView.contentDOM;
	if (registry?.getNodeSpec(block.type)?.isVoid) return null;
	return element;
}

/** Checks whether a block's persistent model content has changed. */
function blockChanged(oldBlock: BlockNode, newBlock: BlockNode): boolean {
	if (oldBlock.id !== newBlock.id) return true;
	if (oldBlock.type !== newBlock.type) return true;
	if (oldBlock.htmlId !== newBlock.htmlId) return true;
	if (oldBlock.children.length !== newBlock.children.length) return true;

	// Compare attrs
	if (!blockAttrsEqual(oldBlock.attrs, newBlock.attrs)) return true;
	return blockChildrenChanged(oldBlock, newBlock);
}

/** Checks whether a container NodeView's reconciler-owned descendants changed. */
function blockChildrenChanged(oldBlock: BlockNode, newBlock: BlockNode): boolean {
	if (oldBlock.children.length !== newBlock.children.length) return true;
	for (let index = 0; index < oldBlock.children.length; index++) {
		const oldChild = oldBlock.children[index];
		const newChild = newBlock.children[index];
		if (!oldChild || !newChild) return true;
		if (childChanged(oldChild, newChild)) return true;
	}
	return false;
}

/** Compares one child position without weakening the child-kind invariants. */
function childChanged(oldChild: ChildNode, newChild: ChildNode): boolean {
	if (isTextNode(oldChild) && isTextNode(newChild)) {
		return oldChild.text !== newChild.text || !markSetsEqual(oldChild.marks, newChild.marks);
	}
	if (isInlineNode(oldChild) && isInlineNode(newChild)) {
		return (
			oldChild.inlineType !== newChild.inlineType ||
			!inlineAttrsEqual(oldChild.attrs, newChild.attrs) ||
			!markSetsEqual(oldChild.marks, newChild.marks)
		);
	}
	if (
		!isTextNode(oldChild) &&
		!isTextNode(newChild) &&
		!isInlineNode(oldChild) &&
		!isInlineNode(newChild)
	) {
		return blockChanged(oldChild, newChild);
	}
	return true;
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
