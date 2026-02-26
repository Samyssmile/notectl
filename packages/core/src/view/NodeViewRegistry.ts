/**
 * NodeViewRegistry: manages plugin-registered custom NodeView factories
 * for block-level rendering.
 */

import type { NodeViewFactory } from './NodeView.js';

export class NodeViewRegistry {
	private readonly _nodeViews = new Map<string, NodeViewFactory>();

	registerNodeView(type: string, factory: NodeViewFactory): void {
		if (this._nodeViews.has(type)) {
			throw new Error(`NodeView for type "${type}" is already registered.`);
		}
		this._nodeViews.set(type, factory);
	}

	getNodeViewFactory(type: string): NodeViewFactory | undefined {
		return this._nodeViews.get(type);
	}

	removeNodeView(type: string): void {
		this._nodeViews.delete(type);
	}

	clear(): void {
		this._nodeViews.clear();
	}
}
