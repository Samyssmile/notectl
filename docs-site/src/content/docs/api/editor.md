---
title: NotectlEditor
description: The main editor Web Component API reference.
---

`NotectlEditor` is the `<notectl-editor>` Web Component — the public entry point to the editor.

## Creating an Editor

### Factory Function (Recommended)

```ts
import { createEditor } from '@notectl/core';

const editor = await createEditor({
  placeholder: 'Start typing...',
  autofocus: true,
});
document.body.appendChild(editor);
```

### Manual Construction

```ts
const editor = document.createElement('notectl-editor') as NotectlEditor;
document.body.appendChild(editor);
await editor.init({ placeholder: 'Start typing...' });
```

## Configuration

```ts
interface NotectlEditorConfig {
  /** Controls which inline marks are enabled (auto-configures TextFormattingPlugin). */
  features?: Partial<TextFormattingConfig>;
  /** Plugins to register (headless mode — no toolbar). */
  plugins?: Plugin[];
  /** Declarative toolbar layout. Each inner array is a visual group. */
  toolbar?: ReadonlyArray<ReadonlyArray<Plugin>>;
  /** Placeholder text shown when editor is empty. */
  placeholder?: string;
  /** Read-only mode. */
  readonly?: boolean;
  /** Focus the editor on initialization. */
  autofocus?: boolean;
  /** Maximum undo history depth. */
  maxHistoryDepth?: number;
}
```

## Content API

### `getJSON(): Document`

Returns the document as a JSON-serializable `Document` object.

### `setJSON(doc: Document): void`

Replaces the editor content with the given document.

### `getHTML(): string`

Returns sanitized HTML representation.

### `setHTML(html: string): void`

Parses HTML and sets it as the editor content.

### `getText(): string`

Returns plain text content (blocks joined by `\n`).

### `isEmpty(): boolean`

Returns `true` if the editor contains only a single empty paragraph.

## Command API

### `commands`

Object with convenience methods:

```ts
editor.commands.toggleBold();
editor.commands.toggleItalic();
editor.commands.toggleUnderline();
editor.commands.undo();
editor.commands.redo();
editor.commands.selectAll();
```

### `can()`

Returns an object with methods that check if commands can be executed:

```ts
const can = editor.can();
can.toggleBold();   // boolean
can.undo();         // boolean
can.redo();         // boolean
```

### `executeCommand(name: string): boolean`

Executes a named command registered by any plugin. Returns `true` if handled.

```ts
editor.executeCommand('toggleStrikethrough');
editor.executeCommand('insertHorizontalRule');
```

### `configurePlugin(pluginId: string, config: PluginConfig): void`

Updates a plugin's configuration at runtime.

## State API

### `getState(): EditorState`

Returns the current immutable editor state.

### `dispatch(tr: Transaction): void`

Dispatches a transaction through the middleware chain.

## Event API

### `on<K>(event: K, callback): void`

Subscribe to an event.

### `off<K>(event: K, callback): void`

Unsubscribe from an event.

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `stateChange` | `{ oldState, newState, transaction }` | Every state change |
| `selectionChange` | `{ selection }` | Cursor/selection moved |
| `focus` | `undefined` | Editor gained focus |
| `blur` | `undefined` | Editor lost focus |
| `ready` | `undefined` | Initialization complete |

## Lifecycle

### `whenReady(): Promise<void>`

Returns a promise that resolves when the editor is fully initialized.

### `configure(config: Partial<NotectlEditorConfig>): void`

Updates configuration at runtime (placeholder, readonly).

### `registerPlugin(plugin: Plugin): void`

Registers a plugin before initialization.

### `destroy(): Promise<void>`

Cleans up the editor. The editor can be re-initialized after destruction.

## HTML Attributes

| Attribute | Description |
|-----------|-------------|
| `placeholder` | Placeholder text (reflected) |
| `readonly` | Read-only mode (reflected) |
