---
title: Plugin Interface
description: Complete reference for the Plugin and PluginContext APIs.
---

## Plugin Interface

```ts
interface Plugin<TConfig extends Record<string, unknown> = Record<string, unknown>> {
  /** Unique identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Plugin initialization order priority (lower = first). */
  readonly priority?: number;
  /** IDs of plugins that must be registered before this one. */
  readonly dependencies?: readonly string[];

  /** Called during initialization. Register specs, commands, keymaps, etc. */
  init(context: PluginContext): void | Promise<void>;
  /** Clean up resources. */
  destroy?(): void | Promise<void>;
  /** Called on every state change. */
  onStateChange?(oldState: EditorState, newState: EditorState, tr: Transaction): void;
  /** Called when configurePlugin() is used at runtime. */
  onConfigure?(config: TConfig): void;
  /** Called after ALL plugins are initialized. */
  onReady?(): void | Promise<void>;
  /** Called when the editor's read-only mode changes. */
  onReadOnlyChange?(readonly: boolean): void;
  /** Returns decorations for the current state. */
  decorations?(state: EditorState, tr?: Transaction): DecorationSet;
}
```

## PluginContext

The `PluginContext` is passed to `init()` and provides all registration APIs:

```ts
interface PluginContext {
  // --- State ---
  getState(): EditorState;
  dispatch(transaction: Transaction): void;

  // --- DOM ---
  getContainer(): HTMLElement;
  getPluginContainer(position: 'top' | 'bottom'): HTMLElement;

  // --- Commands ---
  registerCommand(name: string, handler: CommandHandler, options?: CommandOptions): void;
  executeCommand(name: string): boolean;

  // --- Schema ---
  registerNodeSpec<T extends string>(spec: NodeSpec<T>): void;
  registerMarkSpec<T extends string>(spec: MarkSpec<T>): void;
  registerInlineNodeSpec<T extends string>(spec: InlineNodeSpec<T>): void;
  registerNodeView(type: string, factory: NodeViewFactory): void;
  getSchemaRegistry(): SchemaRegistry;

  // --- Input ---
  registerKeymap(keymap: Keymap, options?: KeymapOptions): void;
  registerInputRule(rule: InputRule): void;
  registerFileHandler(pattern: string, handler: FileHandler): void;
  registerPasteInterceptor(interceptor: PasteInterceptor, options?: PasteInterceptorOptions): void;

  // --- Accessibility ---
  announce(text: string): void;
  hasAnnouncement(): boolean;

  // --- Read-Only ---
  isReadOnly(): boolean;

  // --- Styling ---
  registerStyleSheet(css: string): void;

  // --- Toolbar ---
  registerToolbarItem(item: ToolbarItem): void;
  registerBlockTypePickerEntry(entry: BlockTypePickerEntry): void;

  // --- Middleware ---
  registerMiddleware(middleware: TransactionMiddleware, options?: MiddlewareOptions): void;

  // --- Services ---
  registerService<T>(key: ServiceKey<T>, service: T): void;
  getService<T>(key: ServiceKey<T>): T | undefined;

  // --- Events ---
  getEventBus(): PluginEventBus;

  // --- Registry Access ---
  getKeymapRegistry(): KeymapRegistry;
  getInputRuleRegistry(): InputRuleRegistry;
  getFileHandlerRegistry(): FileHandlerRegistry;
  getNodeViewRegistry(): NodeViewRegistry;
  getToolbarRegistry(): ToolbarRegistry;
  getBlockTypePickerRegistry(): BlockTypePickerRegistry;

  // --- Config ---
  updateConfig(config: PluginConfig): void;
}
```

Plugins that need to show popups (dropdowns, color pickers, dialogs) should use the shared [Popup Framework](/notectl/api/popup-framework/) via `PopupServiceKey` rather than managing DOM elements directly.

## Type-Safe Keys

### EventKey

```ts
import { EventKey } from '@notectl/core';

const MyEvent = new EventKey<{ value: string }>('my-event');

bus.emit(MyEvent, { value: 'hello' });    // Type-checked
const unsubscribe = bus.on(MyEvent, (payload) => {
  payload.value; // string — type-safe
});
unsubscribe(); // Remove the listener
```

### ServiceKey

```ts
import { ServiceKey } from '@notectl/core';

interface MyService { doWork(): void; }
const MyKey = new ServiceKey<MyService>('my-service');

context.registerService(MyKey, { doWork() { /* ... */ } });
const svc = context.getService(MyKey); // MyService | undefined
```

## PasteInterceptor

```ts
type PasteInterceptor = (
  plainText: string,
  html: string,
  state: EditorState,
) => Transaction | null;
```

A paste interceptor receives the clipboard contents and current state. Return a `Transaction` to handle the paste, or `null` to let the next interceptor try.

## PasteInterceptorOptions

```ts
interface PasteInterceptorOptions {
  readonly name?: string;
  readonly priority?: number;  // Lower values run first. Default: 100
}
```

## CommandHandler

```ts
type CommandHandler = () => boolean;
```

Return `true` if the command was handled, `false` to let other handlers try.

## CommandOptions

```ts
interface CommandOptions {
  /** When true, the command may execute even in read-only mode. */
  readonly readonlyAllowed?: boolean;
}
```

Used with `registerCommand()` to allow specific commands (e.g. checklist toggle) to work in read-only mode.

## KeymapOptions

```ts
interface KeymapOptions {
  /** Priority level for dispatch ordering. */
  readonly priority?: KeymapPriority;
}
```

See [Input System — Priority System](/notectl/api/input/#priority-system) for details on `KeymapPriority`.

## MiddlewareOptions

```ts
interface MiddlewareOptions {
  /** Human-readable name for debugging and introspection. */
  readonly name?: string;
  /** Execution priority (lower values run first). Defaults to 100. */
  readonly priority?: number;
}
```

## TransactionMiddleware

```ts
type TransactionMiddleware = (
  tr: Transaction,
  state: EditorState,
  next: MiddlewareNext,
) => void;
```

Call `next(tr)` to continue the chain. Skip `next()` to cancel the transaction.

## BlockTypePickerEntry

Entries registered via `registerBlockTypePickerEntry()` appear in the HeadingPlugin's block type dropdown.

```ts
interface BlockTypePickerEntry {
  /** Unique identifier, e.g. 'heading-1', 'footer'. */
  readonly id: string;
  /** Display label shown in the picker, e.g. 'Heading 1'. */
  readonly label: string;
  /** Command to execute when selected. */
  readonly command: string;
  /** Sort order — lower values appear first. */
  readonly priority: number;
  /** Optional styling for the label in the dropdown. */
  readonly style?: PickerEntryStyle;
  /** Returns true when this entry matches the current block type. */
  isActive(state: EditorState): boolean;
}

interface PickerEntryStyle {
  readonly fontSize: string;
  readonly fontWeight: string;
}
```

The HeadingPlugin registers its built-in entries at priorities 10–106 (paragraph=10, title=20, subtitle=30, headings=101–106). Use a higher priority value (e.g. 200+) to append entries after the built-in ones.

---

## PluginManager

The `PluginManager` orchestrates plugin lifecycle, registration, and dispatch. It is primarily used internally by the editor, but its API is exported for advanced use cases.

```ts
import { PluginManager } from '@notectl/core';
```

### PluginManagerInitOptions

```ts
interface PluginManagerInitOptions {
  getState(): EditorState;
  dispatch(transaction: Transaction): void;
  getContainer(): HTMLElement;
  getPluginContainer(position: 'top' | 'bottom'): HTMLElement;
  announce?(text: string): void;
  hasAnnouncement?(): boolean;
  onBeforeReady?(): void | Promise<void>;
}
```

### Key Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `register` | `(plugin: Plugin) => void` | Register a plugin (must be called before `init`) |
| `init` | `(options: PluginManagerInitOptions) => Promise<void>` | Initialize all plugins in dependency/priority order |
| `destroy` | `() => Promise<void>` | Destroy all plugins in reverse init order |
| `notifyStateChange` | `(oldState, newState, tr) => void` | Notify all plugins of a state change |
| `collectDecorations` | `(state, tr?) => DecorationSet` | Collect and merge decorations from all plugins |
| `dispatchWithMiddleware` | `(tr, state, finalDispatch) => void` | Dispatch through the middleware chain |
| `canExecuteCommand` | `(name: string) => boolean` | Check if a command exists and is not blocked by readonly |
| `executeCommand` | `(name: string) => boolean` | Execute a named command |
| `configurePlugin` | `(pluginId, config) => void` | Configure a plugin at runtime |
| `isReadOnly` | `() => boolean` | Get current readonly state |
| `setReadOnly` | `(readonly: boolean) => void` | Update readonly state and notify plugins |
| `getPluginIds` | `() => string[]` | List all registered plugin IDs |
| `get` | `(id: string) => Plugin \| undefined` | Get a plugin by ID |
| `getService` | `<T>(key: ServiceKey<T>) => T \| undefined` | Get a registered service |
| `onEvent` | `<T>(key: EventKey<T>, cb) => () => void` | Subscribe to an event (returns unsubscribe) |
| `getMiddlewareChain` | `() => readonly MiddlewareInfo[]` | Get middleware in execution order |
| `getPluginStyleSheets` | `() => readonly CSSStyleSheet[]` | Get all plugin-registered stylesheets |

### Public Registries

The `PluginManager` exposes its internal registries as readonly properties:

```ts
manager.schemaRegistry;          // SchemaRegistry
manager.keymapRegistry;          // KeymapRegistry
manager.inputRuleRegistry;       // InputRuleRegistry
manager.fileHandlerRegistry;     // FileHandlerRegistry
manager.nodeViewRegistry;        // NodeViewRegistry
manager.toolbarRegistry;         // ToolbarRegistry
manager.blockTypePickerRegistry; // BlockTypePickerRegistry
```

### MiddlewareInfo

Describes a registered middleware entry (returned by `getMiddlewareChain()`):

```ts
interface MiddlewareInfo {
  readonly name: string;
  readonly priority: number;
  readonly pluginId: string;
}
```

---

## EventBus

Type-safe event bus used for inter-plugin communication. Plugins access it via `context.getEventBus()`.

```ts
import { EventBus, EventKey } from '@notectl/core';

const bus = new EventBus();
```

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `emit` | `<T>(key: EventKey<T>, payload: T) => void` | Emit an event to all subscribers |
| `on` | `<T>(key: EventKey<T>, callback) => () => void` | Subscribe to an event (returns unsubscribe function) |
| `off` | `<T>(key: EventKey<T>, callback) => void` | Remove a specific listener |
| `clear` | `() => void` | Remove all listeners |

### Error Isolation

If a subscriber throws, the error is caught and logged — other subscribers still receive the event. This prevents a buggy plugin from breaking the event system.
