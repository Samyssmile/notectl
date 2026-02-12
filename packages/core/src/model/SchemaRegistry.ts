/**
 * SchemaRegistry: central registry for node specs, mark specs, node views,
 * keymaps, input rules, and toolbar items registered by plugins.
 */

import type { InputRule } from '../input/InputRule.js';
import type { Keymap } from '../input/Keymap.js';
import type { ToolbarItem } from '../plugins/toolbar/ToolbarItem.js';
import type { NodeViewFactory } from '../view/NodeView.js';
import type { InlineNodeSpec } from './InlineNodeSpec.js';
import type { MarkSpec } from './MarkSpec.js';
import type { NodeSpec } from './NodeSpec.js';

export class SchemaRegistry {
	private readonly _nodeSpecs = new Map<string, NodeSpec>();
	private readonly _markSpecs = new Map<string, MarkSpec>();
	private readonly _inlineNodeSpecs = new Map<string, InlineNodeSpec>();
	private readonly _nodeViews = new Map<string, NodeViewFactory>();
	private readonly _keymaps: Keymap[] = [];
	private readonly _inputRules: InputRule[] = [];
	private readonly _toolbarItems = new Map<string, ToolbarItem>();
	private readonly _toolbarItemPluginMap = new Map<string, string[]>();

	// --- NodeSpec ---

	registerNodeSpec<T extends string>(spec: NodeSpec<T>): void {
		if (this._nodeSpecs.has(spec.type)) {
			throw new Error(`NodeSpec for type "${spec.type}" is already registered.`);
		}
		this._nodeSpecs.set(spec.type, spec);
	}

	getNodeSpec(type: string): NodeSpec | undefined {
		return this._nodeSpecs.get(type);
	}

	removeNodeSpec(type: string): void {
		this._nodeSpecs.delete(type);
	}

	getNodeTypes(): string[] {
		return [...this._nodeSpecs.keys()];
	}

	// --- MarkSpec ---

	registerMarkSpec<T extends string>(spec: MarkSpec<T>): void {
		if (this._markSpecs.has(spec.type)) {
			throw new Error(`MarkSpec for type "${spec.type}" is already registered.`);
		}
		this._markSpecs.set(spec.type, spec);
	}

	getMarkSpec(type: string): MarkSpec | undefined {
		return this._markSpecs.get(type);
	}

	removeMarkSpec(type: string): void {
		this._markSpecs.delete(type);
	}

	getMarkTypes(): string[] {
		return [...this._markSpecs.keys()];
	}

	// --- InlineNodeSpec ---

	registerInlineNodeSpec<T extends string>(spec: InlineNodeSpec<T>): void {
		if (this._inlineNodeSpecs.has(spec.type)) {
			throw new Error(`InlineNodeSpec for type "${spec.type}" is already registered.`);
		}
		this._inlineNodeSpecs.set(spec.type, spec);
	}

	getInlineNodeSpec(type: string): InlineNodeSpec | undefined {
		return this._inlineNodeSpecs.get(type);
	}

	removeInlineNodeSpec(type: string): void {
		this._inlineNodeSpecs.delete(type);
	}

	getInlineNodeTypes(): string[] {
		return [...this._inlineNodeSpecs.keys()];
	}

	// --- NodeView ---

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

	// --- Keymap ---

	registerKeymap(keymap: Keymap): void {
		for (const key of Object.keys(keymap)) {
			for (const existing of this._keymaps) {
				if (key in existing) {
					console.warn(
						`[notectl] Keymap shortcut "${key}" is already registered and will be overridden.`,
					);
					break;
				}
			}
		}
		this._keymaps.push(keymap);
	}

	getKeymaps(): readonly Keymap[] {
		return this._keymaps;
	}

	removeKeymap(keymap: Keymap): void {
		const idx = this._keymaps.indexOf(keymap);
		if (idx !== -1) this._keymaps.splice(idx, 1);
	}

	// --- InputRule ---

	registerInputRule(rule: InputRule): void {
		this._inputRules.push(rule);
	}

	getInputRules(): readonly InputRule[] {
		return this._inputRules;
	}

	removeInputRule(rule: InputRule): void {
		const idx = this._inputRules.indexOf(rule);
		if (idx !== -1) this._inputRules.splice(idx, 1);
	}

	// --- ToolbarItem ---

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

	// --- Bulk ---

	clear(): void {
		this._nodeSpecs.clear();
		this._markSpecs.clear();
		this._inlineNodeSpecs.clear();
		this._nodeViews.clear();
		this._keymaps.length = 0;
		this._inputRules.length = 0;
		this._toolbarItems.clear();
		this._toolbarItemPluginMap.clear();
	}
}
