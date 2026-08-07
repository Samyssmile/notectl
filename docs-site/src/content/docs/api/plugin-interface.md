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
  registerNodeSpecExtension(type: string, extension: NodeSpecExtension): void;
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

## Extending Another Plugin's NodeSpec

```ts
type NodeSpecExtension = (spec: NodeSpec) => NodeSpec;

registerNodeSpecExtension(type: string, extension: NodeSpecExtension): void;
```

Use this instead of reading and re-registering a foreign `NodeSpec` when your plugin needs to
augment a block type another plugin owns: add an attribute, wrap `toDOM()`, or widen
`content.allow`. The extension receives the current spec and returns the transformed one.

**Order does not matter.** Extensions are declared during `init()` but materialized together only
after every plugin has registered its base specs, so you may extend a target whose owning plugin
initializes later. Extensions for the same type compose in registration order.

Always make the transformation idempotent by returning `spec` unchanged when your change is already
present. The same extension can be re-applied when the schema is rebuilt:

```ts
init(context: PluginContext): void {
  // Allow this plugin's block inside table cells, whether or not
  // TablePlugin has initialized yet.
  context.registerNodeSpecExtension('table_cell', (cellSpec) => {
    if (!cellSpec.content || cellSpec.content.allow.includes('code_block')) return cellSpec;
    return {
      ...cellSpec,
      content: { ...cellSpec.content, allow: [...cellSpec.content.allow, 'code_block'] },
    };
  });
}
```

For the common case of adding one attribute that renders as a DOM effect, prefer the shared
`patchNodeSpecAttr()` helper, which builds the extension and the `toDOM` wrapper for you. The
alignment and text-direction plugins use it to add `align` and `dir` across several block types.

A cleanup removing the extension uses the function identity as its key, so keep a reference if
your plugin needs to unregister it in `destroy()`.

## Error Isolation for Plugin Callbacks

Every callback a plugin contributes runs behind an error boundary: input rules, keymaps, paste and
text-input interceptors, file handlers, Markdown syntax extensions, NodeView factories and their
lifecycle methods, schema parse and render functions, and widget renderers.

A callback that throws, or returns a rejected promise, does not break the surrounding operation:

| Failing callback | Editor behavior |
|------------------|-----------------|
| Input rule, keymap, paste interceptor | The next matching handler runs, then the core default |
| NodeView factory | Falls back to the block's `NodeSpec.toDOM()` |
| NodeView `update` / `selectionChanged` | The failure is contained; remaining `destroy` callbacks still run |
| Node, mark, inline-node, widget renderer | An attributed DOM fallback is rendered |
| File handler | The next matching handler is offered the file |

The failure is reported through the editor's [`logger`](/notectl/api/editor/#logger) with your
plugin id, the callback name, and the cause. This means an exception in your plugin will **not**
surface as an uncaught error during development. If a feature silently takes a fallback path, check
the logger output first.

Two consequences worth designing for: do not rely on a thrown exception to abort an editor
operation, and keep callbacks free of partially applied side effects, because the editor will
continue past a failure.

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
  isCancelled?(): boolean;
}
```

### Key Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `register` | `(plugin: Plugin) => void` | Register a plugin (must be called before `init`) |
| `registerService` | `<T>(key: ServiceKey<T>, service: T) => void` | Register a system-level service before init (used by the editor for global services like LocaleService) |
| `init` | `(options: PluginManagerInitOptions) => Promise<void>` | Initialize all plugins in dependency/priority order |
| `destroy` | `() => Promise<void>` | Destroy all plugins in reverse init order |
| `notifyStateChange` | `(oldState, newState, tr) => void` | Notify all plugins of a state change |
| `collectDecorations` | `(state, tr?) => DecorationSet` | Collect and merge decorations from all plugins |
| `dispatchWithMiddleware` | `(tr, state, finalDispatch) => void` | Dispatch through the middleware chain |
| `canExecuteCommand` | `(name: string) => boolean` | Check if a command exists and is not blocked by readonly |
| `executeCommand` | `(name: string) => boolean` | Execute a named command |
| `configurePlugin` | `(pluginId, config) => void` | Configure a plugin at runtime |
| `isReadOnly` | `() => boolean` | Get current readonly state |
| `isReadonlyBypassed` | `() => boolean` | Returns `true` if readonly is temporarily bypassed |
| `setReadOnly` | `(readonly: boolean) => void` | Update readonly state and notify plugins |
| `getPluginIds` | `() => string[]` | List all registered plugin IDs |
| `get` | `(id: string) => Plugin \| undefined` | Get a plugin by ID |
| `getService` | `<T>(key: ServiceKey<T>) => T \| undefined` | Get a registered service |
| `onEvent` | `<T>(key: EventKey<T>, cb) => () => void` | Subscribe to an event (returns unsubscribe) |
| `getMiddlewareChain` | `() => readonly MiddlewareInfo[]` | Get middleware in execution order |
| `getPasteInterceptors` | `() => readonly PasteInterceptorEntry[]` | Get all paste interceptors in priority order |
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
