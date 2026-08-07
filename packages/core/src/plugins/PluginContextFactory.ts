/**
 * Focused factory functions for creating PluginContext instances.
 * Each factory handles one group of related context capabilities,
 * following SRP — extracted from PluginManager.createContext().
 */

import type { CompositionState } from '../model/CompositionState.js';
import type { FileHandler } from '../model/FileHandlerRegistry.js';
import type { FileHandlerRegistry } from '../model/FileHandlerRegistry.js';
import type { InlineNodeSpec } from '../model/InlineNodeSpec.js';
import type { InputRule } from '../model/InputRule.js';
import type { InputRuleRegistry } from '../model/InputRuleRegistry.js';
import type { Keymap, KeymapOptions } from '../model/Keymap.js';
import type { KeymapRegistry } from '../model/KeymapRegistry.js';
import type { MarkSpec } from '../model/MarkSpec.js';
import type {
	MarkdownSyntaxExtension,
	MarkdownSyntaxRegistry,
} from '../model/MarkdownSyntaxRegistry.js';
import type { NodeSpec } from '../model/NodeSpec.js';
import type { ParseRule } from '../model/ParseRule.js';
import type { PasteInterceptorEntry } from '../model/PasteInterceptor.js';
import type { PluginCallbackExecutor } from '../model/PluginCallbackExecutor.js';
import type { NodeSpecExtension, SchemaRegistry } from '../model/SchemaRegistry.js';
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
const guardedDOMRenderers = new WeakSet<object>();

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
	nodeSpecExtensions: { readonly type: string; readonly extension: NodeSpecExtension }[];
	markSpecs: string[];
	inlineNodeSpecs: string[];
	nodeViews: string[];
	keymaps: Keymap[];
	inputRules: InputRule[];
	markdownSyntaxExtensions: MarkdownSyntaxExtension[];
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
	readonly callbackExecutor: PluginCallbackExecutor;
	readonly schemaRegistry: SchemaRegistry;
	readonly keymapRegistry: KeymapRegistry;
	readonly inputRuleRegistry: InputRuleRegistry;
	readonly markdownSyntaxRegistry: MarkdownSyntaxRegistry;
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
		nodeSpecExtensions: [],
		markSpecs: [],
		inlineNodeSpecs: [],
		nodeViews: [],
		keymaps: [],
		inputRules: [],
		markdownSyntaxExtensions: [],
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
	deps: Pick<ContextFactoryDeps, 'pluginId' | 'callbackExecutor' | 'schemaRegistry'>,
	reg: PluginRegistrations,
): Pick<
	PluginContext,
	'registerNodeSpec' | 'registerNodeSpecExtension' | 'registerMarkSpec' | 'registerInlineNodeSpec'
> {
	return {
		registerNodeSpec: (spec) => {
			deps.schemaRegistry.registerNodeSpec(
				guardNodeSpec(spec, deps.pluginId, deps.callbackExecutor),
			);
			reg.nodeSpecs.push(spec.type);
		},
		registerNodeSpecExtension: (type, extension) => {
			const guardedExtension: NodeSpecExtension = (spec) => {
				const outcome = deps.callbackExecutor.execute(
					{
						pluginId: deps.pluginId,
						name: `${type}:extension`,
						kind: 'schema-extension',
					},
					() => extension(spec),
				);
				return outcome.ok
					? guardNodeSpec(outcome.value, deps.pluginId, deps.callbackExecutor)
					: spec;
			};
			deps.schemaRegistry.registerNodeSpecExtension(type, guardedExtension);
			reg.nodeSpecExtensions.push({ type, extension: guardedExtension });
		},
		registerMarkSpec: (spec) => {
			deps.schemaRegistry.registerMarkSpec(
				guardMarkSpec(spec, deps.pluginId, deps.callbackExecutor),
			);
			reg.markSpecs.push(spec.type);
		},
		registerInlineNodeSpec: (spec) => {
			deps.schemaRegistry.registerInlineNodeSpec(
				guardInlineNodeSpec(spec, deps.pluginId, deps.callbackExecutor),
			);
			reg.inlineNodeSpecs.push(spec.type);
		},
	};
}

function guardNodeSpec<T extends string>(
	spec: NodeSpec<T>,
	pluginId: string,
	executor: PluginCallbackExecutor,
): NodeSpec<T> {
	const parseHTML = guardParseRules(spec.type, spec.parseHTML, pluginId, executor);
	const originalToDOM = spec.toDOM;
	const toDOM: NodeSpec<T>['toDOM'] = guardedDOMRenderers.has(originalToDOM)
		? originalToDOM
		: (node) => {
				const outcome = executor.execute(
					{ pluginId, name: `${spec.type}:toDOM`, kind: 'schema-render' },
					() => requireHTMLElement(originalToDOM(node), `${spec.type}.toDOM`),
				);
				if (outcome.ok) return outcome.value;
				const fallback = document.createElement('div');
				fallback.setAttribute('data-block-id', node.id);
				return fallback;
			};
	guardedDOMRenderers.add(toDOM);
	return { ...spec, toDOM, parseHTML };
}

function guardMarkSpec<T extends string>(
	spec: MarkSpec<T>,
	pluginId: string,
	executor: PluginCallbackExecutor,
): MarkSpec<T> {
	const parseHTML = guardParseRules(spec.type, spec.parseHTML, pluginId, executor);
	const originalToDOM = spec.toDOM;
	const toDOM: MarkSpec<T>['toDOM'] = guardedDOMRenderers.has(originalToDOM)
		? originalToDOM
		: (mark) => {
				const outcome = executor.execute(
					{ pluginId, name: `${spec.type}:toDOM`, kind: 'schema-render' },
					() => requireHTMLElement(originalToDOM(mark), `${spec.type}.toDOM`),
				);
				return outcome.ok ? outcome.value : document.createElement('span');
			};
	guardedDOMRenderers.add(toDOM);
	return { ...spec, toDOM, parseHTML };
}

function guardInlineNodeSpec<T extends string>(
	spec: InlineNodeSpec<T>,
	pluginId: string,
	executor: PluginCallbackExecutor,
): InlineNodeSpec<T> {
	const parseHTML = guardParseRules(spec.type, spec.parseHTML, pluginId, executor);
	const originalToDOM = spec.toDOM;
	const toDOM: InlineNodeSpec<T>['toDOM'] = guardedDOMRenderers.has(originalToDOM)
		? originalToDOM
		: (node) => {
				const outcome = executor.execute(
					{ pluginId, name: `${spec.type}:toDOM`, kind: 'schema-render' },
					() => requireHTMLElement(originalToDOM(node), `${spec.type}.toDOM`),
				);
				if (outcome.ok) return outcome.value;
				const fallback = document.createElement('span');
				fallback.setAttribute('data-inline-type', node.inlineType);
				return fallback;
			};
	guardedDOMRenderers.add(toDOM);
	return { ...spec, toDOM, parseHTML };
}

function requireHTMLElement(value: unknown, callbackName: string): HTMLElement {
	if (value instanceof HTMLElement) return value;
	throw new TypeError(`${callbackName} must return an HTMLElement.`);
}

function guardParseRules(
	type: string,
	rules: readonly ParseRule[] | undefined,
	pluginId: string,
	executor: PluginCallbackExecutor,
): readonly ParseRule[] | undefined {
	if (!rules?.some((rule) => rule.getAttrs)) return rules;
	return rules.map((rule) => {
		const getAttrs = rule.getAttrs;
		if (!getAttrs) return rule;
		return {
			...rule,
			getAttrs(element: HTMLElement): Record<string, unknown> | false {
				const outcome = executor.execute(
					{ pluginId, name: `${type}:${rule.tag}`, kind: 'schema-parse' },
					() => getAttrs(element),
				);
				return outcome.ok ? outcome.value : false;
			},
		};
	});
}

function createExtensionRegistrar(
	pluginId: string,
	deps: Pick<
		ContextFactoryDeps,
		| 'nodeViewRegistry'
		| 'keymapRegistry'
		| 'inputRuleRegistry'
		| 'markdownSyntaxRegistry'
		| 'callbackExecutor'
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
	| 'registerMarkdownSyntax'
	| 'registerToolbarItem'
	| 'registerBlockTypePickerEntry'
	| 'registerFileHandler'
	| 'registerStyleSheet'
> {
	return {
		registerNodeView: (type, factory) => {
			deps.nodeViewRegistry.registerNodeView(type, factory, { pluginId, name: type });
			reg.nodeViews.push(type);
		},
		registerKeymap: (keymap: Keymap, options?: KeymapOptions) => {
			deps.keymapRegistry.registerKeymap(keymap, options, {
				pluginId,
				name: Object.keys(keymap).join(', ') || 'anonymous-keymap',
			});
			reg.keymaps.push(keymap);
		},
		registerInputRule: (rule) => {
			deps.inputRuleRegistry.registerInputRule(rule, {
				pluginId,
				name: rule.handler.name || rule.pattern.toString(),
			});
			reg.inputRules.push(rule);
		},
		registerMarkdownSyntax: (extension) => {
			const guarded = guardMarkdownSyntaxExtension(extension, pluginId, deps.callbackExecutor);
			deps.markdownSyntaxRegistry.register(guarded);
			reg.markdownSyntaxExtensions.push(guarded);
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
			deps.fileHandlerRegistry.registerFileHandler(pattern, handler, {
				pluginId,
				name: handler.name || pattern,
			});
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

function guardMarkdownSyntaxExtension(
	extension: MarkdownSyntaxExtension,
	pluginId: string,
	executor: PluginCallbackExecutor,
): MarkdownSyntaxExtension {
	const matchInline = extension.matchInline;
	const matchBlock = extension.matchBlock;
	return {
		...extension,
		...(matchInline
			? {
					matchInline(text: string, index: number) {
						const outcome = executor.execute(
							{
								pluginId,
								name: `${extension.id}:matchInline`,
								kind: 'markdown-syntax',
							},
							() => validateInlineMarkdownMatch(matchInline(text, index), text.length - index),
						);
						return outcome.ok ? outcome.value : null;
					},
				}
			: {}),
		...(matchBlock
			? {
					matchBlock(lines: readonly string[], lineIndex: number) {
						const outcome = executor.execute(
							{
								pluginId,
								name: `${extension.id}:matchBlock`,
								kind: 'markdown-syntax',
							},
							() =>
								validateBlockMarkdownMatch(matchBlock(lines, lineIndex), lines.length - lineIndex),
						);
						return outcome.ok ? outcome.value : null;
					},
				}
			: {}),
	};
}

type MarkdownAttributeValue = string | number | boolean;

interface ValidatedMarkdownMatch {
	readonly type: string;
	readonly attrs: Record<string, MarkdownAttributeValue>;
	readonly consumed: number;
}

function validateInlineMarkdownMatch(
	value: unknown,
	remainingCharacters: number,
): NonNullable<ReturnType<NonNullable<MarkdownSyntaxExtension['matchInline']>>> | null {
	const match = validateMarkdownMatch(value, 'length', remainingCharacters);
	return match ? { type: match.type, attrs: match.attrs, length: match.consumed } : null;
}

function validateBlockMarkdownMatch(
	value: unknown,
	remainingLines: number,
): NonNullable<ReturnType<NonNullable<MarkdownSyntaxExtension['matchBlock']>>> | null {
	const match = validateMarkdownMatch(value, 'linesConsumed', remainingLines);
	return match ? { type: match.type, attrs: match.attrs, linesConsumed: match.consumed } : null;
}

function validateMarkdownMatch(
	value: unknown,
	consumedProperty: 'length' | 'linesConsumed',
	remainingInput: number,
): ValidatedMarkdownMatch | null {
	if (value === null) return null;
	if (!isRecord(value)) {
		throw new TypeError('Markdown match must be null or an object descriptor.');
	}

	const type = value.type;
	if (typeof type !== 'string' || type.trim().length === 0) {
		throw new TypeError('Markdown match type must be a non-empty string.');
	}

	const attrs = validateMarkdownAttributes(value.attrs);
	const consumed = value[consumedProperty];
	if (
		typeof consumed !== 'number' ||
		!Number.isFinite(consumed) ||
		!Number.isInteger(consumed) ||
		consumed <= 0 ||
		consumed > remainingInput
	) {
		throw new TypeError(
			`Markdown match ${consumedProperty} must be a positive integer within the remaining input.`,
		);
	}

	return { type, attrs, consumed };
}

function validateMarkdownAttributes(value: unknown): Record<string, MarkdownAttributeValue> {
	if (!isRecord(value)) {
		throw new TypeError('Markdown match attrs must be an object.');
	}

	const validatedEntries: [string, MarkdownAttributeValue][] = [];
	for (const [name, attributeValue] of Object.entries(value)) {
		if (!isMarkdownAttributeValue(attributeValue)) {
			throw new TypeError('Markdown match attrs must contain only primitive finite values.');
		}
		validatedEntries.push([name, attributeValue]);
	}
	return Object.fromEntries(validatedEntries);
}

function isMarkdownAttributeValue(value: unknown): value is MarkdownAttributeValue {
	return (
		typeof value === 'string' ||
		typeof value === 'boolean' ||
		(typeof value === 'number' && Number.isFinite(value))
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
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
		...createSchemaRegistrar(deps, reg),
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
