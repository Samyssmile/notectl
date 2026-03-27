/**
 * Plugin manager facade: composes focused modules for command registry,
 * service registry, middleware chain, registration tracking, and
 * plugin lifecycle management.
 *
 * All public methods delegate to the appropriate sub-module.
 */

import type { DecorationSet } from '../decorations/Decoration.js';
import { FileHandlerRegistry } from '../model/FileHandlerRegistry.js';
import { InputRuleRegistry } from '../model/InputRuleRegistry.js';
import { KeymapRegistry } from '../model/KeymapRegistry.js';
import type { PasteInterceptorEntry } from '../model/PasteInterceptor.js';
import { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { NodeViewRegistry } from '../view/NodeViewRegistry.js';
import { CommandRegistry } from './CommandRegistry.js';
import { EventBus } from './EventBus.js';
import { MiddlewareChain } from './MiddlewareChain.js';
import type {
	EventKey,
	Plugin,
	PluginConfig,
	PluginContext,
	PluginEventCallback,
	ServiceKey,
} from './Plugin.js';
import type { ContextFactoryDeps } from './PluginContextFactory.js';
import { createPluginContext } from './PluginContextFactory.js';
import { PluginLifecycle } from './PluginLifecycle.js';
import { RegistrationTracker } from './RegistrationTracker.js';
import { ServiceRegistry } from './ServiceRegistry.js';
import { BlockTypePickerRegistry } from './heading/BlockTypePickerRegistry.js';
import { ToolbarRegistry } from './toolbar/ToolbarRegistry.js';

export type { MiddlewareInfo } from './MiddlewareChain.js';
export type { PasteInterceptorEntry } from '../model/PasteInterceptor.js';
export type { MiddlewareEntry, PluginRegistrations } from './PluginContextFactory.js';

export interface PluginManagerInitOptions {
	getState(): EditorState;
	dispatch(transaction: Transaction): void;
	getContainer(): HTMLElement;
	getPluginContainer(position: 'top' | 'bottom'): HTMLElement;
	announce?(text: string): void;
	hasAnnouncement?(): boolean;
	onBeforeReady?(): void | Promise<void>;
	isCancelled?(): boolean;
}

export class PluginManager {
	// Extension registries (unchanged — already separate classes)
	readonly schemaRegistry = new SchemaRegistry();
	readonly keymapRegistry = new KeymapRegistry();
	readonly inputRuleRegistry = new InputRuleRegistry();
	readonly fileHandlerRegistry = new FileHandlerRegistry();
	readonly nodeViewRegistry = new NodeViewRegistry();
	readonly toolbarRegistry = new ToolbarRegistry();
	readonly blockTypePickerRegistry = new BlockTypePickerRegistry();

	// Extracted sub-modules
	private readonly commandRegistry = new CommandRegistry();
	private readonly serviceRegistry = new ServiceRegistry();
	private readonly middlewareChain = new MiddlewareChain();
	private readonly eventBus = new EventBus();
	private readonly registrationTracker: RegistrationTracker;
	private readonly lifecycle: PluginLifecycle;

	constructor() {
		this.registrationTracker = new RegistrationTracker({
			commandRegistry: this.commandRegistry,
			serviceRegistry: this.serviceRegistry,
			middlewareChain: this.middlewareChain,
			schemaRegistry: this.schemaRegistry,
			keymapRegistry: this.keymapRegistry,
			inputRuleRegistry: this.inputRuleRegistry,
			nodeViewRegistry: this.nodeViewRegistry,
			toolbarRegistry: this.toolbarRegistry,
			fileHandlerRegistry: this.fileHandlerRegistry,
			blockTypePickerRegistry: this.blockTypePickerRegistry,
		});
		this.lifecycle = new PluginLifecycle(this.registrationTracker);
	}

	// --- Service (system-level, before init) ---

	registerService<T>(key: ServiceKey<T>, service: T): void {
		this.serviceRegistry.register(key, service);
	}

	// --- Plugin Registration ---

	register(plugin: Plugin): void {
		this.lifecycle.register(plugin);
	}

	// --- Initialization ---

	async init(options: PluginManagerInitOptions): Promise<void> {
		return this.lifecycle.init(options, (id, opts) => this.createContext(id, opts));
	}

	// --- State & Notifications ---

	notifyStateChange(oldState: EditorState, newState: EditorState, tr: Transaction): void {
		this.lifecycle.notifyStateChange(oldState, newState, tr);
	}

	collectDecorations(state: EditorState, tr?: Transaction): DecorationSet {
		return this.lifecycle.collectDecorations(state, tr);
	}

	// --- Middleware ---

	dispatchWithMiddleware(
		tr: Transaction,
		state: EditorState,
		finalDispatch: (tr: Transaction) => void,
	): void {
		this.middlewareChain.dispatch(tr, state, finalDispatch);
	}

	// --- Commands ---

	canExecuteCommand(name: string): boolean {
		return this.commandRegistry.canExecute(name, this.lifecycle.isReadOnly());
	}

	executeCommand(name: string): boolean {
		return this.commandRegistry.execute(name, this.lifecycle.isReadOnly());
	}

	isReadonlyBypassed(): boolean {
		return this.commandRegistry.isReadonlyBypassed();
	}

	// --- Plugin Configuration ---

	configurePlugin(pluginId: string, config: PluginConfig): void {
		this.lifecycle.configurePlugin(pluginId, config);
	}

	// --- Read-Only ---

	isReadOnly(): boolean {
		return this.lifecycle.isReadOnly();
	}

	setReadOnly(readonly: boolean): void {
		this.lifecycle.setReadOnly(readonly);
	}

	// --- Introspection ---

	getPluginIds(): string[] {
		return this.lifecycle.getPluginIds();
	}

	getMiddlewareChain(): readonly import('./MiddlewareChain.js').MiddlewareInfo[] {
		return this.middlewareChain.getChain();
	}

	getPasteInterceptors(): readonly PasteInterceptorEntry[] {
		return this.middlewareChain.getPasteInterceptors();
	}

	get(id: string): Plugin | undefined {
		return this.lifecycle.get(id);
	}

	getService<T>(key: ServiceKey<T>): T | undefined {
		return this.serviceRegistry.get(key);
	}

	onEvent<T>(key: EventKey<T>, callback: PluginEventCallback<T>): () => void {
		return this.eventBus.on(key, callback);
	}

	getPluginStyleSheets(): readonly CSSStyleSheet[] {
		return this.registrationTracker.rawStyleSheets;
	}

	// --- Destruction ---

	async destroy(): Promise<void> {
		await this.lifecycle.destroy();
		this.commandRegistry.clear();
		this.serviceRegistry.clear();
		this.middlewareChain.clear();
		this.registrationTracker.clear();
		this.eventBus.clear();
		this.schemaRegistry.clear();
		this.keymapRegistry.clear();
		this.inputRuleRegistry.clear();
		this.fileHandlerRegistry.clear();
		this.nodeViewRegistry.clear();
		this.toolbarRegistry.clear();
		this.blockTypePickerRegistry.clear();
	}

	// --- Private ---

	private createContext(pluginId: string, options: PluginManagerInitOptions): PluginContext {
		const deps: ContextFactoryDeps = {
			pluginId,
			getState: options.getState,
			dispatch: options.dispatch,
			getContainer: options.getContainer,
			getPluginContainer: options.getPluginContainer,
			announce: options.announce,
			hasAnnouncement: options.hasAnnouncement,
			commands: this.commandRegistry.rawMap,
			services: this.serviceRegistry.rawMap,
			middlewares: this.middlewareChain.rawMiddlewares,
			pasteInterceptors: this.middlewareChain.rawPasteInterceptors,
			pluginStyleSheets: this.registrationTracker.rawStyleSheets,
			plugins: this.lifecycle.rawPlugins,
			eventBus: this.eventBus,
			schemaRegistry: this.schemaRegistry,
			keymapRegistry: this.keymapRegistry,
			inputRuleRegistry: this.inputRuleRegistry,
			toolbarRegistry: this.toolbarRegistry,
			blockTypePickerRegistry: this.blockTypePickerRegistry,
			fileHandlerRegistry: this.fileHandlerRegistry,
			nodeViewRegistry: this.nodeViewRegistry,
			isReadOnly: () => this.lifecycle.isReadOnly(),
			invalidateMiddlewareSort: () => this.middlewareChain.invalidateMiddlewareSort(),
			invalidatePasteSort: () => this.middlewareChain.invalidatePasteSort(),
			executeCommand: (name: string) => this.executeCommand(name),
		};

		const { context, registrations } = createPluginContext(deps);
		this.registrationTracker.track(pluginId, registrations);
		return context;
	}
}
