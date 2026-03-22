/**
 * Reconciler: diffs old and new state and applies minimal DOM patches.
 * Uses block-level granularity — changed blocks are re-rendered entirely.
 *
 * Orchestrates block rendering, wrapper management, and change detection.
 * Actual rendering logic is delegated to BlockRendering, DecorationRendering,
 * InlineRendering, and BlockWrapperManagement modules.
 */

import type { Decoration } from '../decorations/Decoration.js';
import { type DecorationSet, decorationArraysEqual } from '../decorations/Decoration.js';
import type { BlockNode } from '../model/Document.js';
import { isInlineNode, isLeafBlock, isTextNode, markSetsEqual } from '../model/Document.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { BlockId } from '../model/TypeBrands.js';
import { blockId as toBlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import { renderBlock, renderBlockContent } from './BlockRendering.js';
import {
	getRenderedBlockElements,
	insertAfterPreviousSibling,
	reconcileWrappers,
	removeBlockElement,
	replaceBlockElement,
} from './BlockWrapperManagement.js';
import type { NodeView } from './NodeView.js';
import type { NodeViewRegistry } from './NodeViewRegistry.js';

// Re-exports for backwards compatibility
export { renderBlock, renderBlockContent } from './BlockRendering.js';

export interface ReconcileOptions {
	registry?: SchemaRegistry;
	nodeViewRegistry?: NodeViewRegistry;
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
			removeBlockElement(el);
			oldBlockMap.delete(bid);
			// Destroy NodeView if exists
			const nv = nodeViews?.get(bid);
			if (nv) {
				nv.destroy?.();
				nodeViews?.delete(bid);
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
			replaceBlockElement(existingEl, newEl, container);
			previousSibling = newEl;
		} else {
			// New block — insert after previousSibling
			const newEl = renderBlock(block, registry, nodeViews, options);
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
