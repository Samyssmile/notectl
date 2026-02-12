---
title: Plugin Interface
description: Complete reference for the Plugin and PluginContext APIs.
---

## Plugin Interface

```ts
interface Plugin<TConfig = Record<string, unknown>> {
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
  registerNodeView(type: string, factory: NodeViewFactory): void;
  getSchemaRegistry(): SchemaRegistry;

  // --- Input ---
  registerKeymap(keymap: Keymap): void;
  registerInputRule(rule: InputRule): void;

  // --- Toolbar ---
  registerToolbarItem(item: ToolbarItem): void;

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
bus.on(MyEvent, (payload) => {
  payload.value; // string — type-safe
});
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
