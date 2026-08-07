/**
 * Recursive ownership helpers for NodeViews created while rendering a block subtree.
 *
 * Every NodeView is registered by the ID of the block it renders. A rendered parent
 * owns all NodeViews created for its descendants, so replacing or removing that
 * parent must tear down the complete old subtree before any replacement factories
 * can overwrite entries in the registry.
 */

import type { BlockNode } from '../model/Document.js';
import { getBlockChildren } from '../model/Document.js';
import type { NodeView } from './NodeView.js';

/** Destroys all registered NodeViews in a block subtree, children before parent. */
export function destroyNodeViewSubtree(
	block: BlockNode,
	nodeViews: Map<string, NodeView> | undefined,
	options?: { readonly includeRoot?: boolean; readonly ownerDOM?: HTMLElement },
): void {
	if (!nodeViews) return;

	const destroyed = new Set<NodeView>();
	const includeRoot = options?.includeRoot ?? true;

	const destroy = (node: BlockNode, isRoot: boolean): void => {
		for (const child of getBlockChildren(node)) destroy(child, false);
		if (isRoot && !includeRoot) return;

		const nodeView = nodeViews.get(node.id);
		if (!nodeView) return;
		if (
			options?.ownerDOM &&
			nodeView.dom !== options.ownerDOM &&
			!options.ownerDOM.contains(nodeView.dom)
		) {
			return;
		}
		deleteNodeViewRegistrations(nodeViews, nodeView);
		if (destroyed.has(nodeView)) return;
		destroyed.add(nodeView);
		nodeView.destroy?.();
	};

	destroy(block, true);
}

/** Registers a NodeView, releasing an older owner of the same block ID first. */
export function registerNodeView(
	nodeViews: Map<string, NodeView>,
	blockId: string,
	nodeView: NodeView,
): void {
	const previous: NodeView | undefined = nodeViews.get(blockId);
	if (previous && previous !== nodeView) {
		deleteNodeViewRegistrations(nodeViews, previous);
		previous.destroy?.();
	}
	nodeViews.set(blockId, nodeView);
}

/** Destroys every registered NodeView exactly once and clears the registry. */
export function destroyAllNodeViews(nodeViews: Map<string, NodeView>): void {
	const destroyed = new Set<NodeView>();
	for (const nodeView of nodeViews.values()) {
		if (destroyed.has(nodeView)) continue;
		destroyed.add(nodeView);
		nodeView.destroy?.();
	}
	nodeViews.clear();
}

function deleteNodeViewRegistrations(nodeViews: Map<string, NodeView>, nodeView: NodeView): void {
	for (const [blockId, registered] of nodeViews) {
		if (registered === nodeView) nodeViews.delete(blockId);
	}
}
