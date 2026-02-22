/**
 * Plugin manager: handles plugin lifecycle, dependency resolution,
 * middleware chain, command/service registries, and error isolation.
 *
 * Per-plugin registration tracking ensures clean teardown —
 * commands, services, middleware, event subscriptions, and schema
 * registrations are automatically cleaned up when a plugin is destroyed.
 */

import { DecorationSet } from '../decorations/Decoration.js';
import type { InputRule } from '../input/InputRule.js';
import type { Keymap } from '../input/Keymap.js';
import { type FileHandler, SchemaRegistry } from '../model/SchemaRegistry.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { EventBus } from './EventBus.js';
import type {
	CommandEntry,
	CommandHandler,
	MiddlewareNext,
	Plugin,
	PluginConfig,
	PluginContext,
	PluginEventBus,
	ServiceKey,
	TransactionMiddleware,
} from './Plugin.js';

const DEFAULT_PRIORITY = 100;

interface MiddlewareEntry {
	middleware: TransactionMiddleware;
	priority: number;
}

interface PluginRegistrations {
	commands: string[];
	services: string[];
	middlewares: MiddlewareEntry[];
	unsubscribers: (() => void)[];
	nodeSpecs: string[];
	markSpecs: string[];
	inlineNodeSpecs: string[];
	nodeViews: string[];
	keymaps: Keymap[];
	inputRules: InputRule[];
	toolbarItems: string[];
	fileHandlers: FileHandler[];
	blockTypePickerEntries: string[];
	stylesheets: CSSStyleSheet[];
}

export interface PluginManagerInitOptions {
	getState(): EditorState;
	dispatch(transaction: Transaction): void;
	getContainer(): HTMLElement;
	getPluginContainer(position: 'top' | 'bottom'): HTMLElement;
	/** Pushes a screen reader announcement via the editor's aria-live region. */
	announce?(text: string): void;
	/** Called after all plugin init() calls complete, before onReady(). */
	onBeforeReady?(): void | Promise<void>;
}

export class PluginManager {
	private readonly plugins = new Map<string, Plugin>();
	private readonly commands = new Map<string, CommandEntry>();
	private readonly services = new Map<string, unknown>();
	private readonly middlewares: MiddlewareEntry[] = [];
	private readonly registrations = new Map<string, PluginRegistrations>();
	private readonly eventBus = new EventBus();
	private readonly pluginStyleSheets: CSSStyleSheet[] = [];
	readonly schemaRegistry = new SchemaRegistry();
	private middlewareSorted: MiddlewareEntry[] | null = null;
	private initOrder: string[] = [];
	private initialized = false;
	private initializing = false;

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

		this.initOrder = this.resolveOrder();

		for (const id of this.initOrder) {
			const plugin = this.plugins.get(id);
			if (!plugin) continue;
			const context = this.createContext(id, options);
			try {
				await plugin.init(context);
			} catch (err) {
				console.error(`[PluginManager] Plugin "${id}" failed to initialize:`, err);
			}
		}

		// Hook between init and onReady — lets the host rebuild schema/state
		// after all plugins have registered their specs but before plugins render.
		if (options.onBeforeReady) {
			await options.onBeforeReady();
		}

		// Call onReady on all plugins after all init() calls have completed
		for (const id of this.initOrder) {
			const plugin = this.plugins.get(id);
			if (!plugin?.onReady) continue;
			try {
				await plugin.onReady();
			} catch (err) {
				console.error(`[PluginManager] Plugin "${id}" error in onReady:`, err);
			}
		}

		this.initialized = true;
		this.initializing = false;
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
					console.error('[PluginManager] Middleware error:', err);
					guardedNext(currentTr);
				}
			} else if (!dispatched) {
				dispatched = true;
				finalDispatch(currentTr);
			}
		};

		next(tr);
	}

	/** Executes a named command. Returns false if command not found. */
	executeCommand(name: string): boolean {
		const entry = this.commands.get(name);
		if (!entry) return false;
		try {
			return entry.handler();
		} catch (err) {
			console.error(`[PluginManager] Command "${name}" error:`, err);
			return false;
		}
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

	/** Returns all registered plugin IDs. */
	getPluginIds(): string[] {
		return [...this.plugins.keys()];
	}

	/** Gets a plugin by ID. */
	get(id: string): Plugin | undefined {
		return this.plugins.get(id);
	}

	/** Gets a registered service by typed key. */
	getService<T>(key: ServiceKey<T>): T | undefined {
		return this.services.get(key.id) as T | undefined;
	}

	/** Returns all plugin-registered stylesheets. */
	getPluginStyleSheets(): readonly CSSStyleSheet[] {
		return this.pluginStyleSheets;
	}

	/** Destroys all plugins in reverse init order. */
	async destroy(): Promise<void> {
		const reversed = [...this.initOrder].reverse();
		for (const id of reversed) {
			await this.destroyPlugin(id);
		}
		this.plugins.clear();
		this.commands.clear();
		this.services.clear();
		this.middlewares.length = 0;
		this.middlewareSorted = null;
		this.pluginStyleSheets.length = 0;
		this.eventBus.clear();
		this.registrations.clear();
		this.schemaRegistry.clear();
		this.initOrder = [];
		this.initialized = false;
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

	private cleanupRegistrations(id: string): void {
		const reg = this.registrations.get(id);
		if (!reg) return;

		for (const name of reg.commands) this.commands.delete(name);
		for (const serviceId of reg.services) this.services.delete(serviceId);
		for (const entry of reg.middlewares) {
			const idx = this.middlewares.indexOf(entry);
			if (idx !== -1) this.middlewares.splice(idx, 1);
		}
		for (const unsub of reg.unsubscribers) unsub();

		// Clean up schema registrations
		for (const type of reg.nodeSpecs) this.schemaRegistry.removeNodeSpec(type);
		for (const type of reg.markSpecs) this.schemaRegistry.removeMarkSpec(type);
		for (const type of reg.inlineNodeSpecs) {
			this.schemaRegistry.removeInlineNodeSpec(type);
		}
		for (const type of reg.nodeViews) this.schemaRegistry.removeNodeView(type);
		for (const keymap of reg.keymaps) this.schemaRegistry.removeKeymap(keymap);
		for (const rule of reg.inputRules) this.schemaRegistry.removeInputRule(rule);
		for (const itemId of reg.toolbarItems) this.schemaRegistry.removeToolbarItem(itemId);
		for (const handler of reg.fileHandlers) {
			this.schemaRegistry.removeFileHandler(handler);
		}
		for (const id of reg.blockTypePickerEntries) {
			this.schemaRegistry.removeBlockTypePickerEntry(id);
		}
		for (const sheet of reg.stylesheets) {
			const idx = this.pluginStyleSheets.indexOf(sheet);
			if (idx !== -1) this.pluginStyleSheets.splice(idx, 1);
		}

		this.middlewareSorted = null;
		this.registrations.delete(id);
	}

	private getSortedMiddleware(): MiddlewareEntry[] {
		if (!this.middlewareSorted) {
			this.middlewareSorted = [...this.middlewares].sort((a, b) => a.priority - b.priority);
		}
		return this.middlewareSorted;
	}

	private createContext(pluginId: string, options: PluginManagerInitOptions): PluginContext {
		const reg: PluginRegistrations = {
			commands: [],
			services: [],
			middlewares: [],
			unsubscribers: [],
			nodeSpecs: [],
			markSpecs: [],
			inlineNodeSpecs: [],
			nodeViews: [],
			keymaps: [],
			inputRules: [],
			toolbarItems: [],
			fileHandlers: [],
			blockTypePickerEntries: [],
			stylesheets: [],
		};
		this.registrations.set(pluginId, reg);

		const pluginEventBus: PluginEventBus = {
			emit: (key, payload) => this.eventBus.emit(key, payload),
			on: (key, callback) => {
				const unsub = this.eventBus.on(key, callback);
				reg.unsubscribers.push(unsub);
				return unsub;
			},
			off: (key, callback) => this.eventBus.off(key, callback),
		};

		return {
			getState: options.getState,
			dispatch: options.dispatch,
			getContainer: options.getContainer,
			getPluginContainer: options.getPluginContainer,

			registerCommand: (name: string, handler: CommandHandler) => {
				if (this.commands.has(name)) {
					const existing = this.commands.get(name);
					throw new Error(
						`Command "${name}" is already registered by plugin "${existing?.pluginId}".`,
					);
				}
				this.commands.set(name, { name, handler, pluginId });
				reg.commands.push(name);
			},

			executeCommand: (name: string) => this.executeCommand(name),

			getEventBus: () => pluginEventBus,

			registerMiddleware: (middleware: TransactionMiddleware, priority = DEFAULT_PRIORITY) => {
				const entry: MiddlewareEntry = { middleware, priority };
				this.middlewares.push(entry);
				reg.middlewares.push(entry);
				this.middlewareSorted = null;
			},

			registerService: <T>(key: ServiceKey<T>, service: T) => {
				if (this.services.has(key.id)) {
					throw new Error(`Service "${key.id}" is already registered by another plugin.`);
				}
				this.services.set(key.id, service);
				reg.services.push(key.id);
			},

			getService: <T>(key: ServiceKey<T>) => this.services.get(key.id) as T | undefined,

			updateConfig: (config: PluginConfig) => {
				const plugin = this.plugins.get(pluginId);
				if (plugin?.onConfigure) {
					try {
						plugin.onConfigure(config);
					} catch (err) {
						console.error(`[PluginManager] Plugin "${pluginId}" error in onConfigure:`, err);
					}
				}
			},

			// --- Schema Extension Methods ---

			registerNodeSpec: (spec) => {
				this.schemaRegistry.registerNodeSpec(spec);
				reg.nodeSpecs.push(spec.type);
			},

			registerMarkSpec: (spec) => {
				this.schemaRegistry.registerMarkSpec(spec);
				reg.markSpecs.push(spec.type);
			},

			registerNodeView: (type, factory) => {
				this.schemaRegistry.registerNodeView(type, factory);
				reg.nodeViews.push(type);
			},

			registerKeymap: (keymap) => {
				this.schemaRegistry.registerKeymap(keymap);
				reg.keymaps.push(keymap);
			},

			registerInputRule: (rule) => {
				this.schemaRegistry.registerInputRule(rule);
				reg.inputRules.push(rule);
			},

			registerToolbarItem: (item) => {
				this.schemaRegistry.registerToolbarItem(item, pluginId);
				reg.toolbarItems.push(item.id);
			},

			registerInlineNodeSpec: (spec) => {
				this.schemaRegistry.registerInlineNodeSpec(spec);
				reg.inlineNodeSpecs.push(spec.type);
			},

			registerFileHandler: (pattern, handler) => {
				this.schemaRegistry.registerFileHandler(pattern, handler);
				reg.fileHandlers.push(handler);
			},

			registerBlockTypePickerEntry: (entry) => {
				this.schemaRegistry.registerBlockTypePickerEntry(entry);
				reg.blockTypePickerEntries.push(entry.id);
			},

			getSchemaRegistry: () => this.schemaRegistry,

			registerStyleSheet: (css: string) => {
				const sheet: CSSStyleSheet = new CSSStyleSheet();
				sheet.replaceSync(css);
				this.pluginStyleSheets.push(sheet);
				reg.stylesheets.push(sheet);
			},

			announce: (text: string) => {
				options.announce?.(text);
			},
		};
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
