/**
 * Plugin system types for the Notectl editor.
 */

import type { DecorationSet } from '../decorations/Decoration.js';
import type { InputRule } from '../input/InputRule.js';
import type { Keymap, KeymapOptions } from '../input/Keymap.js';
import type { InlineNodeSpec } from '../model/InlineNodeSpec.js';
import type { MarkSpec } from '../model/MarkSpec.js';
import type { NodeSpec } from '../model/NodeSpec.js';
import type { FileHandler } from '../model/SchemaRegistry.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import type { NodeViewFactory } from '../view/NodeView.js';
import type { BlockTypePickerEntry } from './heading/BlockTypePickerEntry.js';
import type { ToolbarItem } from './toolbar/ToolbarItem.js';

// --- Type-Safe Keys ---

/** Type-safe event key for compile-time payload checking. */
export class EventKey<T> {
	declare readonly _type: T;
	constructor(public readonly id: string) {}
}

/** Type-safe service key for compile-time type checking. */
export class ServiceKey<T> {
	declare readonly _type: T;
	constructor(public readonly id: string) {}
}

// --- Command System ---

export type CommandHandler = () => boolean;

export interface CommandOptions {
	/** When true, the command may execute even if the editor is in read-only mode. */
	readonly readonlyAllowed?: boolean;
}

export interface CommandEntry {
	readonly name: string;
	readonly handler: CommandHandler;
	readonly pluginId: string;
	readonly readonlyAllowed: boolean;
}

// --- Event System ---

export type PluginEventCallback<T = unknown> = (payload: T) => void;

export interface PluginEventBus {
	emit<T>(key: EventKey<T>, payload: T): void;
	on<T>(key: EventKey<T>, callback: PluginEventCallback<T>): () => void;
	off<T>(key: EventKey<T>, callback: PluginEventCallback<T>): void;
}

// --- Configuration ---

export type PluginConfig = Record<string, unknown>;

// --- Middleware ---

export type MiddlewareNext = (tr: Transaction) => void;
export type TransactionMiddleware = (
	tr: Transaction,
	state: EditorState,
	next: MiddlewareNext,
) => void;

export interface MiddlewareOptions {
	/** Human-readable name for debugging and introspection. */
	readonly name?: string;
	/** Execution priority (lower values run first). Defaults to 100. */
	readonly priority?: number;
}

// --- Plugin Context ---

export interface PluginContext {
	getState(): EditorState;
	dispatch(transaction: Transaction): void;
	getContainer(): HTMLElement;
	getPluginContainer(position: 'top' | 'bottom'): HTMLElement;
	registerCommand(name: string, handler: CommandHandler, options?: CommandOptions): void;
	executeCommand(name: string): boolean;
	getEventBus(): PluginEventBus;
	registerMiddleware(middleware: TransactionMiddleware, options?: MiddlewareOptions): void;
	registerService<T>(key: ServiceKey<T>, service: T): void;
	getService<T>(key: ServiceKey<T>): T | undefined;
	updateConfig(config: PluginConfig): void;

	// --- Schema Extension ---
	registerNodeSpec<T extends string>(spec: NodeSpec<T>): void;
	registerMarkSpec<T extends string>(spec: MarkSpec<T>): void;
	registerNodeView(type: string, factory: NodeViewFactory): void;
	registerKeymap(keymap: Keymap, options?: KeymapOptions): void;
	registerInputRule(rule: InputRule): void;
	registerToolbarItem(item: ToolbarItem): void;
	registerInlineNodeSpec<T extends string>(spec: InlineNodeSpec<T>): void;
	registerFileHandler(pattern: string, handler: FileHandler): void;
	registerBlockTypePickerEntry(entry: BlockTypePickerEntry): void;
	getSchemaRegistry(): SchemaRegistry;

	/** Registers a CSS string to be added to the editor's adopted stylesheets. */
	registerStyleSheet(css: string): void;

	/** Returns whether the editor is currently in read-only mode. */
	isReadOnly(): boolean;

	/** Pushes a screen reader announcement via the editor's aria-live region. */
	announce(text: string): void;
}

// --- Plugin Interface ---

export interface Plugin<TConfig extends Record<string, unknown> = Record<string, unknown>> {
	readonly id: string;
	readonly name: string;
	readonly priority?: number;
	readonly dependencies?: readonly string[];

	init(context: PluginContext): void | Promise<void>;
	destroy?(): void | Promise<void>;
	onStateChange?(oldState: EditorState, newState: EditorState, tr: Transaction): void;
	onConfigure?(config: TConfig): void;
	/** Called after ALL plugins have been initialized. */
	onReady?(): void | Promise<void>;
	/** Called when the editor's read-only mode changes. */
	onReadOnlyChange?(readonly: boolean): void;
	/**
	 * Returns decorations for the given state.
	 * Called after state.apply() but BEFORE reconciliation.
	 * Plugins should cache and only recompute when needed.
	 */
	decorations?(state: EditorState, tr?: Transaction): DecorationSet;
}
