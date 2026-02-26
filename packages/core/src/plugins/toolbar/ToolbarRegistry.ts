/**
 * ToolbarRegistry: manages plugin-registered toolbar items
 * with per-plugin tracking for clean teardown.
 */

import type { ToolbarItem } from './ToolbarItem.js';

export class ToolbarRegistry {
	private readonly _toolbarItems = new Map<string, ToolbarItem>();
	private readonly _toolbarItemPluginMap = new Map<string, string[]>();

	registerToolbarItem(item: ToolbarItem, pluginId?: string): void {
		if (this._toolbarItems.has(item.id)) {
			throw new Error(`ToolbarItem with id "${item.id}" is already registered.`);
		}
		this._toolbarItems.set(item.id, item);
		if (pluginId) {
			const ids = this._toolbarItemPluginMap.get(pluginId) ?? [];
			ids.push(item.id);
			this._toolbarItemPluginMap.set(pluginId, ids);
		}
	}

	getToolbarItemsByPlugin(pluginId: string): ToolbarItem[] {
		const ids = this._toolbarItemPluginMap.get(pluginId) ?? [];
		const items: ToolbarItem[] = [];
		for (const id of ids) {
			const item = this._toolbarItems.get(id);
			if (item) items.push(item);
		}
		return items;
	}

	getToolbarItem(id: string): ToolbarItem | undefined {
		return this._toolbarItems.get(id);
	}

	getToolbarItems(): ToolbarItem[] {
		return [...this._toolbarItems.values()];
	}

	removeToolbarItem(id: string): void {
		this._toolbarItems.delete(id);
		for (const [pluginId, ids] of this._toolbarItemPluginMap) {
			const idx = ids.indexOf(id);
			if (idx !== -1) {
				ids.splice(idx, 1);
				if (ids.length === 0) this._toolbarItemPluginMap.delete(pluginId);
				break;
			}
		}
	}

	clear(): void {
		this._toolbarItems.clear();
		this._toolbarItemPluginMap.clear();
	}
}
