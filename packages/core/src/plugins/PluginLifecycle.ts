/**
 * Manages plugin ordering, initialization, destruction, and notifications.
 * Extracted from PluginManager for single-responsibility.
 */

import { DecorationSet } from '../decorations/Decoration.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { type Logger, consoleLogger, scopedLogger } from './Logger.js';
import type { Plugin, PluginConfig, PluginContext } from './Plugin.js';
import type { RegistrationTracker } from './RegistrationTracker.js';

const DEFAULT_PRIORITY = 100;

export interface PluginLifecycleInitOptions {
	getState(): EditorState;
	dispatch(transaction: Transaction): void;
	getContainer(): HTMLElement;
	getPluginContainer(position: 'top' | 'bottom'): HTMLElement;
	announce?(text: string): void;
	hasAnnouncement?(): boolean;
	onBeforeReady?(): void | Promise<void>;
	isCancelled?(): boolean;
}

/** Callback injected by the facade to create a PluginContext per plugin. */
export type ContextFactory = (
	pluginId: string,
	options: PluginLifecycleInitOptions,
) => PluginContext;

export class PluginLifecycle {
	private readonly plugins = new Map<string, Plugin>();
	private initOrder: string[] = [];
	private startedInitOrder: string[] = [];
	private initialized = false;
	private initializing = false;
	private destroying = false;
	private lifecycleVersion = 0;
	private pendingInit: Promise<void> | null = null;
	private pendingDestroy: Promise<void> | null = null;
	private readOnly = false;
	private readonly log: Logger;

	constructor(
		private readonly tracker: RegistrationTracker,
		logger: Logger = consoleLogger,
	) {
		this.log = scopedLogger(logger, 'PluginLifecycle');
	}

	// --- Registration ---

	/** Registers a plugin. Must be called before init(). */
	register(plugin: Plugin): void {
		if (this.initialized || this.initializing || this.destroying) {
			throw new Error(`Cannot register plugin "${plugin.id}" after initialization.`);
		}
		if (this.plugins.has(plugin.id)) {
			throw new Error(`Plugin "${plugin.id}" is already registered.`);
		}
		this.plugins.set(plugin.id, plugin);
	}

	/** Gets a plugin by ID. */
	get(id: string): Plugin | undefined {
		return this.plugins.get(id);
	}

	/** Returns all registered plugin IDs. */
	getPluginIds(): string[] {
		return [...this.plugins.keys()];
	}

	// --- Initialization ---

	/** Initializes all registered plugins in dependency/priority order. */
	init(options: PluginLifecycleInitOptions, createContext: ContextFactory): Promise<void> {
		if (this.destroying) {
			return Promise.reject(
				new Error('Cannot initialize plugins while destruction is in progress.'),
			);
		}
		if (this.initialized) return Promise.resolve();
		if (this.pendingInit) return this.pendingInit;

		this.initializing = true;
		const version = this.lifecycleVersion;
		const operation = Promise.resolve().then(() =>
			this.runInitialization(options, createContext, version),
		);
		const tracked = operation.finally(() => {
			if (this.pendingInit !== tracked) return;
			this.pendingInit = null;
			this.initializing = false;
		});
		this.pendingInit = tracked;
		return tracked;
	}

	private async runInitialization(
		options: PluginLifecycleInitOptions,
		createContext: ContextFactory,
		version: number,
	): Promise<void> {
		const isCancelled = (): boolean =>
			version !== this.lifecycleVersion || options.isCancelled?.() === true;
		try {
			this.initOrder = this.resolveOrder();

			for (const id of this.initOrder) {
				if (isCancelled()) {
					await this.rollbackStartedPlugins();
					return;
				}
				const plugin = this.plugins.get(id);
				if (!plugin) continue;
				this.startedInitOrder.push(id);
				const context = createContext(id, options);
				await plugin.init(context);
				if (isCancelled()) {
					await this.rollbackStartedPlugins();
					return;
				}
			}

			if (isCancelled()) {
				await this.rollbackStartedPlugins();
				return;
			}

			if (options.onBeforeReady) {
				await options.onBeforeReady();
			}

			if (isCancelled()) {
				await this.rollbackStartedPlugins();
				return;
			}

			for (const id of this.initOrder) {
				if (isCancelled()) {
					await this.rollbackStartedPlugins();
					return;
				}
				const plugin = this.plugins.get(id);
				if (!plugin?.onReady) continue;
				try {
					await plugin.onReady();
				} catch (err) {
					this.log.error(`Plugin "${id}" error in onReady`, err);
				}
				if (isCancelled()) {
					await this.rollbackStartedPlugins();
					return;
				}
			}

			if (isCancelled()) {
				await this.rollbackStartedPlugins();
				return;
			}
			this.initialized = true;
		} catch (err) {
			await this.rollbackStartedPlugins();
			throw err;
		}
	}

	// --- Destruction ---

	/** Destroys all plugins in reverse init order. */
	destroy(): Promise<void> {
		if (this.pendingDestroy) return this.pendingDestroy;

		this.destroying = true;
		this.lifecycleVersion += 1;
		const activeInit = this.pendingInit;
		const operation = Promise.resolve().then(() => this.runDestruction(activeInit));
		const tracked = operation.finally(() => {
			if (this.pendingDestroy !== tracked) return;
			this.pendingDestroy = null;
			this.destroying = false;
		});
		this.pendingDestroy = tracked;
		return tracked;
	}

	private async runDestruction(activeInit: Promise<void> | null): Promise<void> {
		if (activeInit) {
			try {
				await activeInit;
			} catch {
				// The init caller retains the attributed failure. Destruction still owns
				// deterministic cleanup and therefore proceeds after rollback completes.
			}
		}

		const reversed = [...this.startedInitOrder].reverse();
		for (const id of reversed) {
			await this.destroyPlugin(id);
		}
		this.plugins.clear();
		this.initOrder = [];
		this.startedInitOrder = [];
		this.initialized = false;
		this.initializing = false;
	}

	// --- Notifications ---

	/** Notifies all plugins of a state change, in init order. */
	notifyStateChange(oldState: EditorState, newState: EditorState, tr: Transaction): void {
		for (const id of this.initOrder) {
			const plugin = this.plugins.get(id);
			if (!plugin?.onStateChange) continue;
			try {
				plugin.onStateChange(oldState, newState, tr);
			} catch (err) {
				this.log.error(`Plugin "${id}" error in onStateChange`, err);
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
				const decos = plugin.decorations(state, tr).withWidgetOwner(id);
				if (!decos.isEmpty) {
					result = result.merge(decos);
				}
			} catch (err) {
				this.log.error(`Plugin "${id}" error in decorations()`, err);
			}
		}
		return result;
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
			this.log.error(`Plugin "${pluginId}" error in onConfigure`, err);
		}
	}

	// --- Read-Only ---

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
				this.log.error(`Plugin "${id}" error in onReadOnlyChange`, err);
			}
		}
	}

	// --- Raw accessors ---

	get rawPlugins(): Map<string, Plugin> {
		return this.plugins;
	}

	get isInitialized(): boolean {
		return this.initialized;
	}

	// --- Private ---

	private async destroyPlugin(id: string): Promise<void> {
		const plugin = this.plugins.get(id);
		if (plugin?.destroy) {
			try {
				await plugin.destroy();
			} catch (err) {
				this.log.error(`Plugin "${id}" error in destroy`, err);
			}
		}
		this.tracker.cleanup(id);
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

	/**
	 * Resolves plugin initialization order via topological sort + priority.
	 * Throws on dependency cycles or missing dependencies.
	 */
	private resolveOrder(): string[] {
		const ids = [...this.plugins.keys()];

		for (const id of ids) {
			const plugin = this.plugins.get(id);
			if (!plugin) continue;
			for (const dep of plugin.dependencies ?? []) {
				if (!this.plugins.has(dep)) {
					throw new Error(`Plugin "${id}" depends on "${dep}", which is not registered.`);
				}
			}
		}

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
