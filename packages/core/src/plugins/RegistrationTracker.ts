/**
 * Tracks per-plugin registrations and provides cleanup on plugin destroy.
 * Extracted from PluginManager for single-responsibility.
 */

import type { FileHandlerRegistry } from '../model/FileHandlerRegistry.js';
import type { InputRuleRegistry } from '../model/InputRuleRegistry.js';
import type { KeymapRegistry } from '../model/KeymapRegistry.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { NodeViewRegistry } from '../view/NodeViewRegistry.js';
import type { CommandRegistry } from './CommandRegistry.js';
import type { MiddlewareChain } from './MiddlewareChain.js';
import type { ServiceRegistry } from './ServiceRegistry.js';
import type { BlockTypePickerRegistry } from './heading/BlockTypePickerRegistry.js';
import type { ToolbarRegistry } from './toolbar/ToolbarRegistry.js';

import type { PluginRegistrations } from './PluginContextFactory.js';

/** Dependencies needed for cleaning up a plugin's registrations. */
export interface RegistrationCleanupDeps {
	readonly commandRegistry: CommandRegistry;
	readonly serviceRegistry: ServiceRegistry;
	readonly middlewareChain: MiddlewareChain;
	readonly schemaRegistry: SchemaRegistry;
	readonly keymapRegistry: KeymapRegistry;
	readonly inputRuleRegistry: InputRuleRegistry;
	readonly nodeViewRegistry: NodeViewRegistry;
	readonly toolbarRegistry: ToolbarRegistry;
	readonly fileHandlerRegistry: FileHandlerRegistry;
	readonly blockTypePickerRegistry: BlockTypePickerRegistry;
}

export class RegistrationTracker {
	private readonly registrations = new Map<string, PluginRegistrations>();
	private readonly pluginStyleSheets: CSSStyleSheet[] = [];

	constructor(private readonly deps: RegistrationCleanupDeps) {}

	/** Associates a plugin's registrations for later cleanup. */
	track(pluginId: string, registrations: PluginRegistrations): void {
		this.registrations.set(pluginId, registrations);
	}

	/** Removes all registrations for a plugin from their respective registries. */
	cleanup(pluginId: string): void {
		const reg = this.registrations.get(pluginId);
		if (!reg) return;

		for (const name of reg.commands) this.deps.commandRegistry.remove(name);
		for (const serviceId of reg.services) this.deps.serviceRegistry.remove(serviceId);
		for (const entry of reg.middlewares) this.deps.middlewareChain.removeMiddleware(entry);
		for (const entry of reg.pasteInterceptors) {
			this.deps.middlewareChain.removePasteInterceptor(entry);
		}
		for (const unsub of reg.unsubscribers) unsub();

		for (const type of reg.nodeSpecs) this.deps.schemaRegistry.removeNodeSpec(type);
		for (const type of reg.markSpecs) this.deps.schemaRegistry.removeMarkSpec(type);
		for (const type of reg.inlineNodeSpecs) {
			this.deps.schemaRegistry.removeInlineNodeSpec(type);
		}

		for (const type of reg.nodeViews) this.deps.nodeViewRegistry.removeNodeView(type);
		for (const keymap of reg.keymaps) this.deps.keymapRegistry.removeKeymap(keymap);
		for (const rule of reg.inputRules) this.deps.inputRuleRegistry.removeInputRule(rule);
		for (const itemId of reg.toolbarItems) {
			this.deps.toolbarRegistry.removeToolbarItem(itemId);
		}
		for (const handler of reg.fileHandlers) {
			this.deps.fileHandlerRegistry.removeFileHandler(handler);
		}
		for (const entryId of reg.blockTypePickerEntries) {
			this.deps.blockTypePickerRegistry.removeBlockTypePickerEntry(entryId);
		}
		for (const sheet of reg.stylesheets) {
			const idx = this.pluginStyleSheets.indexOf(sheet);
			if (idx !== -1) this.pluginStyleSheets.splice(idx, 1);
		}

		this.registrations.delete(pluginId);
	}

	clear(): void {
		this.registrations.clear();
		this.pluginStyleSheets.length = 0;
	}

	/** Exposes internal stylesheet array for ContextFactoryDeps assembly. */
	get rawStyleSheets(): CSSStyleSheet[] {
		return this.pluginStyleSheets;
	}
}
