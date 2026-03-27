/**
 * Manages plugin ordering, initialization, destruction, and notifications.
 * Extracted from PluginManager for single-responsibility.
 */

import { DecorationSet } from '../decorations/Decoration.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
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
	private readOnly = false;

	constructor(private readonly tracker: RegistrationTracker) {}

	// --- Registration ---

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
	async init(options: PluginLifecycleInitOptions, createContext: ContextFactory): Promise<void> {
		if (this.initialized || this.initializing) return;
		this.initializing = true;
		try {
			this.initOrder = this.resolveOrder();

			for (const id of this.initOrder) {
				if (options.isCancelled?.()) return;
				const plugin = this.plugins.get(id);
				if (!plugin) continue;
				this.startedInitOrder.push(id);
				const context = createContext(id, options);
				try {
					await plugin.init(context);
				} catch (err) {
					await this.rollbackStartedPlugins();
					throw err;
				}
			}

			if (options.isCancelled?.()) return;

			if (options.onBeforeReady) {
				await options.onBeforeReady();
			}

			if (options.isCancelled?.()) return;

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

	// --- Destruction ---

	/** Destroys all plugins in reverse init order. */
	async destroy(): Promise<void> {
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
				console.error(`[PluginManager] Plugin "${id}" error in onReadOnlyChange:`, err);
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
				console.error(`[PluginManager] Plugin "${id}" error in destroy:`, err);
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
