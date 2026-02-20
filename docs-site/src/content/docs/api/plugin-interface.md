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
  /** Toolbar ordering priority (lower = first). */
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
  registerCommand(name: string, handler: CommandHandler): void;
  executeCommand(name: string): boolean;

  // --- Schema ---
  registerNodeSpec<T extends string>(spec: NodeSpec<T>): void;
  registerMarkSpec<T extends string>(spec: MarkSpec<T>): void;
  registerInlineNodeSpec<T extends string>(spec: InlineNodeSpec<T>): void;
  registerNodeView(type: string, factory: NodeViewFactory): void;
  getSchemaRegistry(): SchemaRegistry;

  // --- Input ---
  registerKeymap(keymap: Keymap): void;
  registerInputRule(rule: InputRule): void;
  registerFileHandler(pattern: string, handler: FileHandler): void;

  // --- Accessibility ---
  announce(text: string): void;

  // --- Toolbar ---
  registerToolbarItem(item: ToolbarItem): void;
  registerBlockTypePickerEntry(entry: BlockTypePickerEntry): void;

  // --- Middleware ---
  registerMiddleware(middleware: TransactionMiddleware, priority?: number): void;

  // --- Services ---
  registerService<T>(key: ServiceKey<T>, service: T): void;
  getService<T>(key: ServiceKey<T>): T | undefined;

  // --- Events ---
  getEventBus(): PluginEventBus;

  // --- Config ---
  updateConfig(config: PluginConfig): void;
}
```

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

## CommandHandler

```ts
type CommandHandler = () => boolean;
```

Return `true` if the command was handled, `false` to let other handlers try.

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
