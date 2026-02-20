/**
 * SchemaRegistry: central registry for node specs, mark specs, node views,
 * keymaps, input rules, and toolbar items registered by plugins.
 */

import type { InputRule } from '../input/InputRule.js';
import type { Keymap } from '../input/Keymap.js';
import type { BlockTypePickerEntry } from '../plugins/heading/BlockTypePickerEntry.js';
import type { ToolbarItem } from '../plugins/toolbar/ToolbarItem.js';
import type { NodeViewFactory } from '../view/NodeView.js';
import type { InlineNodeSpec } from './InlineNodeSpec.js';
import type { MarkSpec } from './MarkSpec.js';
import type { NodeSpec } from './NodeSpec.js';
import type { ParseRule } from './ParseRule.js';

/** Handler for files pasted or dropped into the editor. */
export type FileHandler = (
	files: readonly File[],
	position: import('./Selection.js').Position | null,
) => boolean | Promise<boolean>;

export interface FileHandlerEntry {
	readonly pattern: string;
	readonly handler: FileHandler;
}

export class SchemaRegistry {
	private readonly _nodeSpecs = new Map<string, NodeSpec>();
	private readonly _markSpecs = new Map<string, MarkSpec>();
	private readonly _inlineNodeSpecs = new Map<string, InlineNodeSpec>();
	private readonly _nodeViews = new Map<string, NodeViewFactory>();
	private readonly _keymaps: Keymap[] = [];
	private readonly _inputRules: InputRule[] = [];
	private readonly _toolbarItems = new Map<string, ToolbarItem>();
	private readonly _toolbarItemPluginMap = new Map<string, string[]>();
	private readonly _fileHandlers: FileHandlerEntry[] = [];
	private readonly _blockTypePickerEntries = new Map<string, BlockTypePickerEntry>();

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

	// --- FileHandler ---

	registerFileHandler(pattern: string, handler: FileHandler): void {
		this._fileHandlers.push({ pattern, handler });
	}

	getFileHandlers(): readonly FileHandlerEntry[] {
		return this._fileHandlers;
	}

	matchFileHandlers(mimeType: string): FileHandler[] {
		const handlers: FileHandler[] = [];
		for (const entry of this._fileHandlers) {
			if (matchMimePattern(entry.pattern, mimeType)) {
				handlers.push(entry.handler);
			}
		}
		return handlers;
	}

	removeFileHandler(handler: FileHandler): void {
		const idx = this._fileHandlers.findIndex((e) => e.handler === handler);
		if (idx !== -1) this._fileHandlers.splice(idx, 1);
	}

	// --- BlockTypePickerEntry ---

	registerBlockTypePickerEntry(entry: BlockTypePickerEntry): void {
		if (this._blockTypePickerEntries.has(entry.id)) {
			throw new Error(`BlockTypePickerEntry with id "${entry.id}" is already registered.`);
		}
		this._blockTypePickerEntries.set(entry.id, entry);
	}

	getBlockTypePickerEntries(): readonly BlockTypePickerEntry[] {
		return [...this._blockTypePickerEntries.values()].sort((a, b) => a.priority - b.priority);
	}

	removeBlockTypePickerEntry(id: string): void {
		this._blockTypePickerEntries.delete(id);
	}

	// --- Parse Rules & Sanitize Config ---

	/** Returns all NodeSpec parseHTML rules, sorted by priority descending. */
	getBlockParseRules(): readonly { readonly rule: ParseRule; readonly type: string }[] {
		const results: { readonly rule: ParseRule; readonly type: string }[] = [];
		for (const [type, spec] of this._nodeSpecs) {
			if (spec.parseHTML) {
				for (const rule of spec.parseHTML) {
					results.push({ rule, type });
				}
			}
		}
		return results.sort((a, b) => (b.rule.priority ?? 50) - (a.rule.priority ?? 50));
	}

	/** Returns all InlineNodeSpec parseHTML rules, sorted by priority descending. */
	getInlineParseRules(): readonly { readonly rule: ParseRule; readonly type: string }[] {
		const results: { readonly rule: ParseRule; readonly type: string }[] = [];
		for (const [type, spec] of this._inlineNodeSpecs) {
			if (spec.parseHTML) {
				for (const rule of spec.parseHTML) {
					results.push({ rule, type });
				}
			}
		}
		return results.sort((a, b) => (b.rule.priority ?? 50) - (a.rule.priority ?? 50));
	}

	/** Returns all MarkSpec parseHTML rules, sorted by priority descending. */
	getMarkParseRules(): readonly { readonly rule: ParseRule; readonly type: string }[] {
		const results: { readonly rule: ParseRule; readonly type: string }[] = [];
		for (const [type, spec] of this._markSpecs) {
			if (spec.parseHTML) {
				for (const rule of spec.parseHTML) {
					results.push({ rule, type });
				}
			}
		}
		return results.sort((a, b) => (b.rule.priority ?? 50) - (a.rule.priority ?? 50));
	}

	/** Returns all allowed HTML tags from base defaults + all spec sanitize configs. */
	getAllowedTags(): string[] {
		const tags = new Set<string>(['p', 'br', 'div', 'span']);
		for (const spec of this._nodeSpecs.values()) {
			if (spec.sanitize?.tags) {
				for (const tag of spec.sanitize.tags) tags.add(tag);
			}
		}
		for (const spec of this._inlineNodeSpecs.values()) {
			if (spec.sanitize?.tags) {
				for (const tag of spec.sanitize.tags) tags.add(tag);
			}
		}
		for (const spec of this._markSpecs.values()) {
			if (spec.sanitize?.tags) {
				for (const tag of spec.sanitize.tags) tags.add(tag);
			}
		}
		return [...tags];
	}

	/** Returns all allowed HTML attributes from base defaults + all spec sanitize configs. */
	getAllowedAttrs(): string[] {
		const attrs = new Set<string>(['style']);
		for (const spec of this._nodeSpecs.values()) {
			if (spec.sanitize?.attrs) {
				for (const attr of spec.sanitize.attrs) attrs.add(attr);
			}
		}
		for (const spec of this._inlineNodeSpecs.values()) {
			if (spec.sanitize?.attrs) {
				for (const attr of spec.sanitize.attrs) attrs.add(attr);
			}
		}
		for (const spec of this._markSpecs.values()) {
			if (spec.sanitize?.attrs) {
				for (const attr of spec.sanitize.attrs) attrs.add(attr);
			}
		}
		return [...attrs];
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
		this._fileHandlers.length = 0;
		this._blockTypePickerEntries.clear();
	}
}

/** Matches a MIME pattern (e.g. 'image/*') against a concrete MIME type. */
function matchMimePattern(pattern: string, mimeType: string): boolean {
	if (pattern === '*' || pattern === '*/*') return true;
	if (pattern === mimeType) return true;
	if (pattern.endsWith('/*')) {
		const prefix = pattern.slice(0, -1);
		return mimeType.startsWith(prefix);
	}
	return false;
}
