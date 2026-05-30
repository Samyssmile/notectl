/**
 * Focused factory functions for creating PluginContext instances.
 * Each factory handles one group of related context capabilities,
 * following SRP — extracted from PluginManager.createContext().
 */

import type { CompositionState } from '../model/CompositionState.js';
import type { FileHandler } from '../model/FileHandlerRegistry.js';
import type { FileHandlerRegistry } from '../model/FileHandlerRegistry.js';
import type { InputRule } from '../model/InputRule.js';
import type { InputRuleRegistry } from '../model/InputRuleRegistry.js';
import type { Keymap, KeymapOptions } from '../model/Keymap.js';
import type { KeymapRegistry } from '../model/KeymapRegistry.js';
import type { PasteInterceptorEntry } from '../model/PasteInterceptor.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { TextInputInterceptorEntry } from '../model/TextInputInterceptor.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import type { NodeViewRegistry } from '../view/NodeViewRegistry.js';
import type { EventBus } from './EventBus.js';
import type { Logger } from './Logger.js';
import type {
	CommandEntry,
	CommandHandler,
	CommandOptions,
	MiddlewareOptions,
	PasteInterceptor,
	PasteInterceptorOptions,
	Plugin,
	PluginConfig,
	PluginContext,
	PluginEventBus,
	ServiceKey,
	TextInputInterceptor,
	TextInputInterceptorOptions,
	TransactionMiddleware,
} from './Plugin.js';
import type { BlockTypePickerRegistry } from './heading/BlockTypePickerRegistry.js';
import type { ToolbarRegistry } from './toolbar/ToolbarRegistry.js';

const DEFAULT_PRIORITY = 100;

export interface MiddlewareEntry {
	readonly name: string;
	readonly pluginId: string;
	readonly middleware: TransactionMiddleware;
	readonly priority: number;
}

export interface PluginRegistrations {
	commands: string[];
	services: string[];
	middlewares: MiddlewareEntry[];
	pasteInterceptors: PasteInterceptorEntry[];
	textInputInterceptors: TextInputInterceptorEntry[];
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

/** Dependencies needed by the context factory from the PluginManager. */
export interface ContextFactoryDeps {
	readonly pluginId: string;
	readonly logger: Logger;
	getState(): EditorState;
	dispatch(transaction: Transaction): void;
	getContainer(): HTMLElement;
	getPluginContainer(position: 'top' | 'bottom'): HTMLElement;
	announce?(text: string): void;
	hasAnnouncement?(): boolean;
	readonly commands: Map<string, CommandEntry>;
	readonly services: Map<string, unknown>;
	readonly middlewares: MiddlewareEntry[];
	readonly pasteInterceptors: PasteInterceptorEntry[];
	readonly textInputInterceptors: TextInputInterceptorEntry[];
	readonly pluginStyleSheets: CSSStyleSheet[];
	readonly plugins: Map<string, Plugin>;
	readonly eventBus: EventBus;
	readonly schemaRegistry: SchemaRegistry;
	readonly keymapRegistry: KeymapRegistry;
	readonly inputRuleRegistry: InputRuleRegistry;
	readonly toolbarRegistry: ToolbarRegistry;
	readonly blockTypePickerRegistry: BlockTypePickerRegistry;
	readonly fileHandlerRegistry: FileHandlerRegistry;
	readonly nodeViewRegistry: NodeViewRegistry;
	getCompositionState(): CompositionState;
	isReadOnly(): boolean;
	invalidateMiddlewareSort(): void;
	invalidatePasteSort(): void;
	invalidateTextInputSort(): void;
	executeCommand(name: string): boolean;
}

/** Creates an empty registration tracker for a plugin. */
export function createEmptyRegistrations(): PluginRegistrations {
	return {
		commands: [],
		services: [],
		middlewares: [],
		pasteInterceptors: [],
		textInputInterceptors: [],
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
}

// --- Focused Factory Functions ---

function createPluginEventBus(eventBus: EventBus, reg: PluginRegistrations): PluginEventBus {
	return {
		emit: (key, payload) => eventBus.emit(key, payload),
		on: (key, callback) => {
			const unsub = eventBus.on(key, callback);
			reg.unsubscribers.push(unsub);
			return unsub;
		},
		off: (key, callback) => eventBus.off(key, callback),
	};
}

function createCommandRegistrar(
	pluginId: string,
	commands: Map<string, CommandEntry>,
	reg: PluginRegistrations,
	executeCommand: (name: string) => boolean,
): Pick<PluginContext, 'registerCommand' | 'executeCommand'> {
	return {
		registerCommand: (name: string, handler: CommandHandler, options?: CommandOptions) => {
			if (commands.has(name)) {
				const existing = commands.get(name);
				throw new Error(
					`Command "${name}" is already registered by plugin "${existing?.pluginId}".`,
				);
			}
			const readonlyAllowed: boolean = options?.readonlyAllowed ?? false;
			commands.set(name, { name, handler, pluginId, readonlyAllowed });
			reg.commands.push(name);
		},
		executeCommand,
	};
}

function createServiceRegistrar(
	services: Map<string, unknown>,
	reg: PluginRegistrations,
): Pick<PluginContext, 'registerService' | 'getService'> {
	return {
		registerService: <T>(key: ServiceKey<T>, service: T) => {
			if (services.has(key.id)) {
				throw new Error(`Service "${key.id}" is already registered by another plugin.`);
			}
			services.set(key.id, service);
			reg.services.push(key.id);
		},
		getService: <T>(key: ServiceKey<T>) => services.get(key.id) as T | undefined,
	};
}

function createMiddlewareRegistrar(
	deps: Pick<
		ContextFactoryDeps,
		| 'pluginId'
		| 'middlewares'
		| 'pasteInterceptors'
		| 'textInputInterceptors'
		| 'invalidateMiddlewareSort'
		| 'invalidatePasteSort'
		| 'invalidateTextInputSort'
	>,
	reg: PluginRegistrations,
): Pick<
	PluginContext,
	'registerMiddleware' | 'registerPasteInterceptor' | 'registerTextInputInterceptor'
> {
	const {
		pluginId,
		middlewares,
		pasteInterceptors,
		textInputInterceptors,
		invalidateMiddlewareSort,
		invalidatePasteSort,
		invalidateTextInputSort,
	} = deps;
	return {
		registerMiddleware: (middleware: TransactionMiddleware, options?: MiddlewareOptions) => {
			const name: string = options?.name ?? (middleware.name || 'anonymous');
			const priority: number = options?.priority ?? DEFAULT_PRIORITY;
			const entry: MiddlewareEntry = { name, pluginId, middleware, priority };
			middlewares.push(entry);
			reg.middlewares.push(entry);
			invalidateMiddlewareSort();
		},
		registerPasteInterceptor: (
			interceptor: PasteInterceptor,
			options?: PasteInterceptorOptions,
		) => {
			const name: string = options?.name ?? 'anonymous';
			const priority: number = options?.priority ?? DEFAULT_PRIORITY;
			const entry: PasteInterceptorEntry = { name, pluginId, interceptor, priority };
			pasteInterceptors.push(entry);
			reg.pasteInterceptors.push(entry);
			invalidatePasteSort();
		},
		registerTextInputInterceptor: (
			interceptor: TextInputInterceptor,
			options?: TextInputInterceptorOptions,
		) => {
			const name: string = options?.name ?? 'anonymous';
			const priority: number = options?.priority ?? DEFAULT_PRIORITY;
			const entry: TextInputInterceptorEntry = { name, pluginId, interceptor, priority };
			textInputInterceptors.push(entry);
			reg.textInputInterceptors.push(entry);
			invalidateTextInputSort();
		},
	};
}

function createSchemaRegistrar(
	schemaRegistry: SchemaRegistry,
	reg: PluginRegistrations,
): Pick<PluginContext, 'registerNodeSpec' | 'registerMarkSpec' | 'registerInlineNodeSpec'> {
	return {
		registerNodeSpec: (spec) => {
			schemaRegistry.registerNodeSpec(spec);
			reg.nodeSpecs.push(spec.type);
		},
		registerMarkSpec: (spec) => {
			schemaRegistry.registerMarkSpec(spec);
			reg.markSpecs.push(spec.type);
		},
		registerInlineNodeSpec: (spec) => {
			schemaRegistry.registerInlineNodeSpec(spec);
			reg.inlineNodeSpecs.push(spec.type);
		},
	};
}

function createExtensionRegistrar(
	pluginId: string,
	deps: Pick<
		ContextFactoryDeps,
		| 'nodeViewRegistry'
		| 'keymapRegistry'
		| 'inputRuleRegistry'
		| 'toolbarRegistry'
		| 'blockTypePickerRegistry'
		| 'fileHandlerRegistry'
		| 'pluginStyleSheets'
	>,
	reg: PluginRegistrations,
): Pick<
	PluginContext,
	| 'registerNodeView'
	| 'registerKeymap'
	| 'registerInputRule'
	| 'registerToolbarItem'
	| 'registerBlockTypePickerEntry'
	| 'registerFileHandler'
	| 'registerStyleSheet'
> {
	return {
		registerNodeView: (type, factory) => {
			deps.nodeViewRegistry.registerNodeView(type, factory);
			reg.nodeViews.push(type);
		},
		registerKeymap: (keymap: Keymap, options?: KeymapOptions) => {
			deps.keymapRegistry.registerKeymap(keymap, options);
			reg.keymaps.push(keymap);
		},
		registerInputRule: (rule) => {
			deps.inputRuleRegistry.registerInputRule(rule);
			reg.inputRules.push(rule);
		},
		registerToolbarItem: (item) => {
			deps.toolbarRegistry.registerToolbarItem(item, pluginId);
			reg.toolbarItems.push(item.id);
		},
		registerBlockTypePickerEntry: (entry) => {
			deps.blockTypePickerRegistry.registerBlockTypePickerEntry(entry);
			reg.blockTypePickerEntries.push(entry.id);
		},
		registerFileHandler: (pattern, handler) => {
			deps.fileHandlerRegistry.registerFileHandler(pattern, handler);
			reg.fileHandlers.push(handler);
		},
		registerStyleSheet: (css: string) => {
			const sheet: CSSStyleSheet = new CSSStyleSheet();
			sheet.replaceSync(css);
			deps.pluginStyleSheets.push(sheet);
			reg.stylesheets.push(sheet);
		},
	};
}

function createRegistryAccessors(
	deps: Pick<
		ContextFactoryDeps,
		| 'schemaRegistry'
		| 'keymapRegistry'
		| 'inputRuleRegistry'
		| 'fileHandlerRegistry'
		| 'nodeViewRegistry'
		| 'toolbarRegistry'
		| 'blockTypePickerRegistry'
	>,
): Pick<
	PluginContext,
	| 'getSchemaRegistry'
	| 'getKeymapRegistry'
	| 'getInputRuleRegistry'
	| 'getFileHandlerRegistry'
	| 'getNodeViewRegistry'
	| 'getToolbarRegistry'
	| 'getBlockTypePickerRegistry'
> {
	return {
		getSchemaRegistry: () => deps.schemaRegistry,
		getKeymapRegistry: () => deps.keymapRegistry,
		getInputRuleRegistry: () => deps.inputRuleRegistry,
		getFileHandlerRegistry: () => deps.fileHandlerRegistry,
		getNodeViewRegistry: () => deps.nodeViewRegistry,
		getToolbarRegistry: () => deps.toolbarRegistry,
		getBlockTypePickerRegistry: () => deps.blockTypePickerRegistry,
	};
}

/** Creates a complete PluginContext by composing focused registrar factories. */
export function createPluginContext(deps: ContextFactoryDeps): {
	context: PluginContext;
	registrations: PluginRegistrations;
} {
	const reg: PluginRegistrations = createEmptyRegistrations();
	const pluginEventBus: PluginEventBus = createPluginEventBus(deps.eventBus, reg);

	const context: PluginContext = {
		getState: deps.getState,
		dispatch: deps.dispatch,
		getContainer: deps.getContainer,
		getPluginContainer: deps.getPluginContainer,
		isReadOnly: deps.isReadOnly,
		getEventBus: () => pluginEventBus,

		...createCommandRegistrar(deps.pluginId, deps.commands, reg, deps.executeCommand),
		...createServiceRegistrar(deps.services, reg),
		...createMiddlewareRegistrar(deps, reg),
		...createSchemaRegistrar(deps.schemaRegistry, reg),
		...createExtensionRegistrar(deps.pluginId, deps, reg),
		...createRegistryAccessors(deps),

		updateConfig: (config: PluginConfig) => {
			const plugin: Plugin | undefined = deps.plugins.get(deps.pluginId);
			if (plugin?.onConfigure) {
				try {
					plugin.onConfigure(config);
				} catch (err) {
					const scope = `[PluginContext] Plugin "${deps.pluginId}" error in onConfigure`;
					deps.logger.error(scope, err);
				}
			}
		},

		announce: (text: string) => {
			deps.announce?.(text);
		},
		hasAnnouncement: () => deps.hasAnnouncement?.() ?? false,
		getCompositionState: () => deps.getCompositionState(),
	};

	return { context, registrations: reg };
}
