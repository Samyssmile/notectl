/**
 * NodeViewRegistry: manages plugin-registered custom NodeView factories
 * for block-level rendering.
 */

import type { PluginCallbackRegistration } from '../model/PluginCallbackExecutor.js';
import type { NodeViewFactory } from './NodeView.js';

export interface NodeViewEntry extends PluginCallbackRegistration {
	readonly factory: NodeViewFactory;
}

export class NodeViewRegistry {
	private readonly _nodeViews = new Map<string, NodeViewEntry>();

	registerNodeView(
		type: string,
		factory: NodeViewFactory,
		registration: PluginCallbackRegistration = { pluginId: 'unattributed', name: type },
	): void {
		if (this._nodeViews.has(type)) {
			throw new Error(`NodeView for type "${type}" is already registered.`);
		}
		this._nodeViews.set(type, { ...registration, factory });
	}

	getNodeViewFactory(type: string): NodeViewFactory | undefined {
		return this._nodeViews.get(type)?.factory;
	}

	/** Returns the factory together with its plugin ownership for runtime attribution. */
	getNodeViewEntry(type: string): NodeViewEntry | undefined {
		return this._nodeViews.get(type);
	}

	removeNodeView(type: string): void {
		this._nodeViews.delete(type);
	}

	clear(): void {
		this._nodeViews.clear();
	}
}
