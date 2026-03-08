/**
 * Plugin manager: handles plugin lifecycle, dependency resolution,
 * middleware chain, command/service registries, and error isolation.
 *
 * Per-plugin registration tracking ensures clean teardown —
 * commands, services, middleware, event subscriptions, and schema
 * registrations are automatically cleaned up when a plugin is destroyed.
 */

import { DecorationSet } from '../decorations/Decoration.js';
import { FileHandlerRegistry } from '../model/FileHandlerRegistry.js';
import { InputRuleRegistry } from '../model/InputRuleRegistry.js';
import { KeymapRegistry } from '../model/KeymapRegistry.js';
import type { PasteInterceptorEntry } from '../model/PasteInterceptor.js';
import { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { NodeViewRegistry } from '../view/NodeViewRegistry.js';
import { EventBus } from './EventBus.js';
import type {
	CommandEntry,
	EventKey,
	MiddlewareNext,
	Plugin,
	PluginConfig,
	PluginContext,
	PluginEventCallback,
	ServiceKey,
} from './Plugin.js';
import {
	type ContextFactoryDeps,
	type MiddlewareEntry,
	type PluginRegistrations,
	createPluginContext,
} from './PluginContextFactory.js';
import { BlockTypePickerRegistry } from './heading/BlockTypePickerRegistry.js';
import { ToolbarRegistry } from './toolbar/ToolbarRegistry.js';

const DEFAULT_PRIORITY = 100;

/** Describes a registered middleware for introspection. */
export interface MiddlewareInfo {
	readonly name: string;
	readonly priority: number;
	readonly pluginId: string;
}

export type { PasteInterceptorEntry } from '../model/PasteInterceptor.js';
export type { MiddlewareEntry, PluginRegistrations } from './PluginContextFactory.js';

export interface PluginManagerInitOptions {
	getState(): EditorState;
	dispatch(transaction: Transaction): void;
	getContainer(): HTMLElement;
	getPluginContainer(position: 'top' | 'bottom'): HTMLElement;
	/** Pushes a screen reader announcement via the editor's aria-live region. */
	announce?(text: string): void;
	/** Returns whether the announcer live region currently has content. */
	hasAnnouncement?(): boolean;
	/** Called after all plugin init() calls complete, before onReady(). */
	onBeforeReady?(): void | Promise<void>;
	/** Returns whether initialization should stop early. */
	isCancelled?(): boolean;
}

export class PluginManager {
	private readonly plugins = new Map<string, Plugin>();
	private readonly commands = new Map<string, CommandEntry>();
	private readonly services = new Map<string, unknown>();
	private readonly middlewares: MiddlewareEntry[] = [];
	private readonly pasteInterceptors: PasteInterceptorEntry[] = [];
	private readonly registrations = new Map<string, PluginRegistrations>();
	private readonly eventBus = new EventBus();
	private readonly pluginStyleSheets: CSSStyleSheet[] = [];
	readonly schemaRegistry = new SchemaRegistry();
	readonly keymapRegistry = new KeymapRegistry();
	readonly inputRuleRegistry = new InputRuleRegistry();
	readonly fileHandlerRegistry = new FileHandlerRegistry();
	readonly nodeViewRegistry = new NodeViewRegistry();
	readonly toolbarRegistry = new ToolbarRegistry();
	readonly blockTypePickerRegistry = new BlockTypePickerRegistry();
	private middlewareSorted: MiddlewareEntry[] | null = null;
	private pasteInterceptorsSorted: PasteInterceptorEntry[] | null = null;
	private initOrder: string[] = [];
	private startedInitOrder: string[] = [];
	private initialized = false;
	private initializing = false;
	private readOnly = false;
	private readonlyBypassActive = false;

	/**
	 * Registers a system-level service before plugin init.
	 * Used by the editor to provide global services (e.g. LocaleService).
	 */
	registerService<T>(key: ServiceKey<T>, service: T): void {
		if (this.services.has(key.id)) {
			throw new Error(`Service "${key.id}" is already registered.`);
		}
		this.services.set(key.id, service);
	}

	/** Registers a plugin. Must be called before init(). */
	register(plugin: Plugin): void {
		if (this.initialized || this.initializing) {
			throw new Error(`Cannot register plugin "${plugin.id}" after initialization.`);
		}
		if (this.plugins.has(plugin.id)) {
			throw new Error(`Plugin "${plugin.id}" is already registered.`);
		}
		this.plugins.set(plugin.id, plugin);
	}

	/** Initializes all registered plugins in dependency/priority order. */
	async init(options: PluginManagerInitOptions): Promise<void> {
		if (this.initialized || this.initializing) return;
		this.initializing = true;
		try {
			this.initOrder = this.resolveOrder();

			for (const id of this.initOrder) {
				if (options.isCancelled?.()) return;
				const plugin = this.plugins.get(id);
				if (!plugin) continue;
				this.startedInitOrder.push(id);
				const context = this.createContext(id, options);
				try {
					await plugin.init(context);
				} catch (err) {
					await this.rollbackStartedPlugins();
					throw err;
				}
			}

			if (options.isCancelled?.()) return;

			// Hook between init and onReady — lets the host rebuild schema/state
			// after all plugins have registered their specs but before plugins render.
			if (options.onBeforeReady) {
				await options.onBeforeReady();
			}

			if (options.isCancelled?.()) return;

			// Call onReady on all plugins after all init() calls have completed
			for (const id of this.initOrder) {
				if (options.isCancelled?.()) return;
				const plugin = this.plugins.get(id);
				if (!plugin?.onReady) continue;
				try {
					await plugin.onReady();
				} catch (err) {
					console.error(`[PluginManager] Plugin "${id}" error in onReady:`, err);
				}
			}

			this.initialized = true;
		} finally {
			this.initializing = false;
		}
	}

	/** Notifies all plugins of a state change, in init order. */
	notifyStateChange(oldState: EditorState, newState: EditorState, tr: Transaction): void {
		for (const id of this.initOrder) {
			const plugin = this.plugins.get(id);
			if (!plugin?.onStateChange) continue;
			try {
				plugin.onStateChange(oldState, newState, tr);
			} catch (err) {
				console.error(`[PluginManager] Plugin "${id}" error in onStateChange:`, err);
			}
		}
	}

	/** Collects and merges decorations from all plugins. */
	collectDecorations(state: EditorState, tr?: Transaction): DecorationSet {
		let result: DecorationSet = DecorationSet.empty;
		for (const id of this.initOrder) {
			const plugin = this.plugins.get(id);
			if (!plugin?.decorations) continue;
			try {
				const decos = plugin.decorations(state, tr);
				if (!decos.isEmpty) {
					result = result.merge(decos);
				}
			} catch (err) {
				console.error(`[PluginManager] Plugin "${id}" error in decorations():`, err);
			}
		}
		return result;
	}

	/**
	 * Dispatches a transaction through the middleware chain, then calls the final dispatch.
	 * If no middleware is registered, calls finalDispatch directly.
	 */
	dispatchWithMiddleware(
		tr: Transaction,
		state: EditorState,
		finalDispatch: (tr: Transaction) => void,
	): void {
		if (this.middlewares.length === 0) {
			finalDispatch(tr);
			return;
		}

		const sorted = this.getSortedMiddleware();
		let index = 0;
		let dispatched = false;

		const next: MiddlewareNext = (currentTr) => {
			if (index < sorted.length) {
				const entry = sorted[index++];
				if (!entry) return;
				let called = false;
				const guardedNext: MiddlewareNext = (tr) => {
					if (called) return;
					called = true;
					next(tr);
				};
				try {
					entry.middleware(currentTr, state, guardedNext);
				} catch (err) {
					console.error(`[PluginManager] Middleware "${entry.name}" error:`, err);
					guardedNext(currentTr);
				}
			} else if (!dispatched) {
				dispatched = true;
				finalDispatch(currentTr);
			}
		};

		next(tr);
	}

	/** Returns whether a named command can be executed (registered and not blocked by readonly). */
	canExecuteCommand(name: string): boolean {
		const entry = this.commands.get(name);
		if (!entry) return false;
		if (this.readOnly && !entry.readonlyAllowed) return false;
		return true;
	}

	/** Executes a named command. Returns false if command not found or editor is read-only. */
	executeCommand(name: string): boolean {
		const entry = this.commands.get(name);
		if (!entry) return false;
		if (this.readOnly && !entry.readonlyAllowed) return false;

		const enableBypass: boolean = this.readOnly && entry.readonlyAllowed;
		if (enableBypass) this.readonlyBypassActive = true;
		try {
			return entry.handler();
		} catch (err) {
			console.error(`[PluginManager] Command "${name}" error:`, err);
			return false;
		} finally {
			if (enableBypass) this.readonlyBypassActive = false;
		}
	}

	/** Returns true when a readonlyAllowed command is currently executing. */
	isReadonlyBypassed(): boolean {
		return this.readonlyBypassActive;
	}

	/** Configures a plugin at runtime via onConfigure(). */
	configurePlugin(pluginId: string, config: PluginConfig): void {
		const plugin = this.plugins.get(pluginId);
		if (!plugin) {
			throw new Error(`Plugin "${pluginId}" not found.`);
		}
		if (!plugin.onConfigure) return;
		try {
			plugin.onConfigure(config);
		} catch (err) {
			console.error(`[PluginManager] Plugin "${pluginId}" error in onConfigure:`, err);
		}
	}

	/** Returns the current read-only state. */
	isReadOnly(): boolean {
		return this.readOnly;
	}

	/** Updates read-only state and notifies all plugins. */
	setReadOnly(readonly: boolean): void {
		if (this.readOnly === readonly) return;
		this.readOnly = readonly;
		for (const id of this.initOrder) {
			const plugin = this.plugins.get(id);
			if (!plugin?.onReadOnlyChange) continue;
			try {
				plugin.onReadOnlyChange(readonly);
			} catch (err) {
				console.error(`[PluginManager] Plugin "${id}" error in onReadOnlyChange:`, err);
			}
		}
	}

	/** Returns all registered plugin IDs. */
	getPluginIds(): string[] {
		return [...this.plugins.keys()];
	}

	/** Returns the middleware chain in execution order, for debugging and introspection. */
	getMiddlewareChain(): readonly MiddlewareInfo[] {
		return this.getSortedMiddleware().map((entry) => ({
			name: entry.name,
			priority: entry.priority,
			pluginId: entry.pluginId,
		}));
	}

	/** Returns paste interceptors in priority order. */
	getPasteInterceptors(): readonly PasteInterceptorEntry[] {
		return this.getSortedPasteInterceptors();
	}

	/** Gets a plugin by ID. */
	get(id: string): Plugin | undefined {
		return this.plugins.get(id);
	}

	/** Gets a registered service by typed key. */
	getService<T>(key: ServiceKey<T>): T | undefined {
		return this.services.get(key.id) as T | undefined;
	}

	/** Subscribes to a plugin event from outside the plugin system. Returns an unsubscribe function. */
	onEvent<T>(key: EventKey<T>, callback: PluginEventCallback<T>): () => void {
		return this.eventBus.on(key, callback);
	}

	/** Returns all plugin-registered stylesheets. */
	getPluginStyleSheets(): readonly CSSStyleSheet[] {
		return this.pluginStyleSheets;
	}

	/** Destroys all plugins in reverse init order. */
	async destroy(): Promise<void> {
		const reversed = [...this.startedInitOrder].reverse();
		for (const id of reversed) {
			await this.destroyPlugin(id);
		}
		this.plugins.clear();
		this.commands.clear();
		this.services.clear();
		this.middlewares.length = 0;
		this.middlewareSorted = null;
		this.pasteInterceptors.length = 0;
		this.pasteInterceptorsSorted = null;
		this.pluginStyleSheets.length = 0;
		this.eventBus.clear();
		this.registrations.clear();
		this.schemaRegistry.clear();
		this.keymapRegistry.clear();
		this.inputRuleRegistry.clear();
		this.fileHandlerRegistry.clear();
		this.nodeViewRegistry.clear();
		this.toolbarRegistry.clear();
		this.blockTypePickerRegistry.clear();
		this.initOrder = [];
		this.startedInitOrder = [];
		this.initialized = false;
		this.initializing = false;
	}

	// --- Private ---

	private async destroyPlugin(id: string): Promise<void> {
		const plugin = this.plugins.get(id);
		if (plugin?.destroy) {
			try {
				await plugin.destroy();
			} catch (err) {
				console.error(`[PluginManager] Plugin "${id}" error in destroy:`, err);
			}
		}
		this.cleanupRegistrations(id);
	}

	private async rollbackStartedPlugins(): Promise<void> {
		const reversed = [...this.startedInitOrder].reverse();
		for (const id of reversed) {
			await this.destroyPlugin(id);
		}
		this.startedInitOrder = [];
		this.initOrder = [];
		this.initialized = false;
	}

	private cleanupRegistrations(id: string): void {
		const reg = this.registrations.get(id);
		if (!reg) return;

		for (const name of reg.commands) this.commands.delete(name);
		for (const serviceId of reg.services) this.services.delete(serviceId);
		for (const entry of reg.middlewares) {
			const idx = this.middlewares.indexOf(entry);
			if (idx !== -1) this.middlewares.splice(idx, 1);
		}
		for (const entry of reg.pasteInterceptors) {
			const idx = this.pasteInterceptors.indexOf(entry);
			if (idx !== -1) this.pasteInterceptors.splice(idx, 1);
		}
		for (const unsub of reg.unsubscribers) unsub();

		// Clean up schema registrations
		for (const type of reg.nodeSpecs) this.schemaRegistry.removeNodeSpec(type);
		for (const type of reg.markSpecs) this.schemaRegistry.removeMarkSpec(type);
		for (const type of reg.inlineNodeSpecs) {
			this.schemaRegistry.removeInlineNodeSpec(type);
		}

		// Clean up focused registries
		for (const type of reg.nodeViews) this.nodeViewRegistry.removeNodeView(type);
		for (const keymap of reg.keymaps) this.keymapRegistry.removeKeymap(keymap);
		for (const rule of reg.inputRules) this.inputRuleRegistry.removeInputRule(rule);
		for (const itemId of reg.toolbarItems) this.toolbarRegistry.removeToolbarItem(itemId);
		for (const handler of reg.fileHandlers) {
			this.fileHandlerRegistry.removeFileHandler(handler);
		}
		for (const entryId of reg.blockTypePickerEntries) {
			this.blockTypePickerRegistry.removeBlockTypePickerEntry(entryId);
		}
		for (const sheet of reg.stylesheets) {
			const idx = this.pluginStyleSheets.indexOf(sheet);
			if (idx !== -1) this.pluginStyleSheets.splice(idx, 1);
		}

		this.middlewareSorted = null;
		this.pasteInterceptorsSorted = null;
		this.registrations.delete(id);
	}

	private getSortedMiddleware(): MiddlewareEntry[] {
		if (!this.middlewareSorted) {
			this.middlewareSorted = [...this.middlewares].sort((a, b) => a.priority - b.priority);
		}
		return this.middlewareSorted;
	}

	private getSortedPasteInterceptors(): PasteInterceptorEntry[] {
		if (!this.pasteInterceptorsSorted) {
			this.pasteInterceptorsSorted = [...this.pasteInterceptors].sort(
				(a, b) => a.priority - b.priority,
			);
		}
		return this.pasteInterceptorsSorted;
	}

	private createContext(pluginId: string, options: PluginManagerInitOptions): PluginContext {
		const deps: ContextFactoryDeps = {
			pluginId,
			getState: options.getState,
			dispatch: options.dispatch,
			getContainer: options.getContainer,
			getPluginContainer: options.getPluginContainer,
			announce: options.announce,
			hasAnnouncement: options.hasAnnouncement,
			commands: this.commands,
			services: this.services,
			middlewares: this.middlewares,
			pasteInterceptors: this.pasteInterceptors,
			pluginStyleSheets: this.pluginStyleSheets,
			plugins: this.plugins,
			eventBus: this.eventBus,
			schemaRegistry: this.schemaRegistry,
			keymapRegistry: this.keymapRegistry,
			inputRuleRegistry: this.inputRuleRegistry,
			toolbarRegistry: this.toolbarRegistry,
			blockTypePickerRegistry: this.blockTypePickerRegistry,
			fileHandlerRegistry: this.fileHandlerRegistry,
			nodeViewRegistry: this.nodeViewRegistry,
			isReadOnly: () => this.readOnly,
			invalidateMiddlewareSort: () => {
				this.middlewareSorted = null;
			},
			invalidatePasteSort: () => {
				this.pasteInterceptorsSorted = null;
			},
			executeCommand: (name: string) => this.executeCommand(name),
		};

		const { context, registrations } = createPluginContext(deps);
		this.registrations.set(pluginId, registrations);
		return context;
	}

	/**
	 * Resolves plugin initialization order via topological sort + priority.
	 * Throws on dependency cycles or missing dependencies.
	 */
	private resolveOrder(): string[] {
		const ids = [...this.plugins.keys()];

		// Validate dependencies exist
		for (const id of ids) {
			const plugin = this.plugins.get(id);
			if (!plugin) continue;
			for (const dep of plugin.dependencies ?? []) {
				if (!this.plugins.has(dep)) {
					throw new Error(`Plugin "${id}" depends on "${dep}", which is not registered.`);
				}
			}
		}

		// Topological sort (Kahn's algorithm)
		const inDegree = new Map<string, number>();
		const dependents = new Map<string, string[]>();

		for (const id of ids) {
			inDegree.set(id, 0);
			dependents.set(id, []);
		}

		for (const id of ids) {
			const plugin = this.plugins.get(id);
			const deps = plugin?.dependencies ?? [];
			inDegree.set(id, deps.length);
			for (const dep of deps) {
				const depList = dependents.get(dep);
				if (depList) depList.push(id);
			}
		}

		const queue: string[] = [];
		for (const [id, deg] of inDegree) {
			if (deg === 0) queue.push(id);
		}

		const sorted: string[] = [];
		while (queue.length > 0) {
			queue.sort((a, b) => {
				const pa = this.plugins.get(a)?.priority ?? DEFAULT_PRIORITY;
				const pb = this.plugins.get(b)?.priority ?? DEFAULT_PRIORITY;
				return pa - pb;
			});

			const id = queue.shift();
			if (!id) break;
			sorted.push(id);

			for (const dep of dependents.get(id) ?? []) {
				const newDeg = (inDegree.get(dep) ?? 0) - 1;
				inDegree.set(dep, newDeg);
				if (newDeg === 0) queue.push(dep);
			}
		}

		if (sorted.length !== ids.length) {
			const missing = ids.filter((id) => !sorted.includes(id));
			throw new Error(`Circular dependency detected among plugins: ${missing.join(', ')}`);
		}

		return sorted;
	}
}
