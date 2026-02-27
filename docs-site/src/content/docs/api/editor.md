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
  /** Declarative toolbar layout — shorthand array or full ToolbarConfig. */
  toolbar?: ReadonlyArray<ReadonlyArray<Plugin>> | ToolbarConfig;
  /** Placeholder text shown when editor is empty. */
  placeholder?: string;
  /** Read-only mode. */
  readonly?: boolean;
  /** Focus the editor on initialization. */
  autofocus?: boolean;
  /** Maximum undo history depth. */
  maxHistoryDepth?: number;
  /** Theme preset or custom Theme object. Defaults to ThemePreset.Light. */
  theme?: ThemePreset | Theme;
  /** Paper size for WYSIWYG page layout. When set, content renders at exact paper width. */
  paperSize?: PaperSize;
  /** Editor locale. Defaults to Locale.BROWSER (auto-detect from navigator.language). */
  locale?: Locale;
}
```

### `ToolbarConfig`

When you need control over responsive overflow behavior, pass a `ToolbarConfig` object instead of the shorthand array:

```ts
interface ToolbarConfig {
  /** Plugin groups defining toolbar layout. */
  readonly groups: ReadonlyArray<ReadonlyArray<Plugin>>;
  /** Responsive overflow behavior. Default: ToolbarOverflowBehavior.BurgerMenu */
  readonly overflow?: ToolbarOverflowBehavior;
}
```

```ts
import { createEditor, ToolbarOverflowBehavior } from '@notectl/core';

const editor = await createEditor({
  toolbar: {
    groups: [
      [new TextFormattingPlugin()],
      [new HeadingPlugin()],
    ],
    overflow: ToolbarOverflowBehavior.Flow,
  },
});
```

See the [Toolbar Configuration guide](/notectl/guides/toolbar/) for details on overflow modes.

## Content API

### `getJSON(): Document`

Returns the document as a JSON-serializable `Document` object.

### `setJSON(doc: Document): void`

Replaces the editor content with the given document.

### `getHTML(options?: { pretty?: boolean }): string`

Returns sanitized HTML representation. Pass `{ pretty: true }` to get indented, human-readable output:

```ts
const html = editor.getHTML();
// "<h1>Hello</h1><p>World</p>"

const pretty = editor.getHTML({ pretty: true });
// "<h1>Hello</h1>\n<p>World</p>"
```

### `setHTML(html: string): void`

Parses HTML and sets it as the editor content.

### `getText(): string`

Returns plain text content (blocks joined by `\n`).

### `isEmpty(): boolean`

Returns `true` if the editor contains only a single empty paragraph.

## Command API

### `commands`

Object with convenience methods for common operations. These are a fixed set of shortcuts — for plugin-registered commands, use `executeCommand()`:

```ts
editor.commands.toggleBold();
editor.commands.toggleItalic();
editor.commands.toggleUnderline();
editor.commands.undo();
editor.commands.redo();
editor.commands.selectAll();
```

### `can()`

Returns an object that checks if the built-in convenience commands can be executed. For plugin-registered commands, use `executeCommand()` directly.

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

### `get isReadOnly(): boolean`

Returns the current read-only state.

```ts
if (editor.isReadOnly) {
  console.log('Editor is in read-only mode');
}
```

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
| `selectionChange` | `{ selection: EditorSelection }` | Cursor/selection moved |
| `focus` | `undefined` | Editor gained focus |
| `blur` | `undefined` | Editor lost focus |
| `ready` | `undefined` | Initialization complete |

## Plugin Service API

### `getService<T>(key: ServiceKey<T>): T | undefined`

Retrieves a typed service registered by any plugin. Returns `undefined` if not found.

```ts
import { TableSelectionServiceKey } from '@notectl/core';

const tableService = editor.getService(TableSelectionServiceKey);
tableService?.getSelectedCells();
```

### `onPluginEvent<T>(key: EventKey<T>, callback: PluginEventCallback<T>): () => void`

Subscribes to typed plugin events from outside the plugin system. Returns an unsubscribe function.

```ts
import { BEFORE_PRINT, AFTER_PRINT } from '@notectl/core';

const unsubscribe = editor.onPluginEvent(BEFORE_PRINT, () => {
  console.log('Printing...');
});

// Later: unsubscribe();
```

## Theme API

### `setTheme(theme: ThemePreset | Theme): void`

Changes the theme at runtime. Accepts a preset string (`'light'`, `'dark'`, `'system'`) or a custom `Theme` object.

```ts
import { ThemePreset } from '@notectl/core';

editor.setTheme(ThemePreset.Dark);
editor.setTheme(myCustomTheme);
```

### `getTheme(): ThemePreset | Theme`

Returns the current theme setting.

See the [Theming guide](/notectl/guides/styling/) for full details on presets, custom themes, and CSS custom properties.

## Paper Size API

### `getPaperSize(): PaperSize | undefined`

Returns the currently configured paper size, or `undefined` if the editor uses fluid layout.

```ts
import { PaperSize } from '@notectl/core';

editor.configure({ paperSize: PaperSize.DINA4 });
editor.getPaperSize(); // 'din-a4'
```

See the [Paper Size guide](/notectl/guides/paper-size/) for full details on WYSIWYG page layout and print integration.

## Locale API

### `locale` Config Option

Sets the editor language for all plugins. Defaults to `Locale.BROWSER` which auto-detects from `navigator.language`.

```ts
import { createEditor, Locale } from '@notectl/core';

const editor = await createEditor({
  locale: Locale.DE,
  toolbar: [/* ... */],
});
```

See the [Internationalization guide](/notectl/guides/internationalization/) for full details on global and per-plugin locale configuration, custom locales, and available languages.

## Lifecycle

### `whenReady(): Promise<void>`

Returns a promise that resolves when the editor is fully initialized.

### `configure(config: Partial<NotectlEditorConfig>): void`

Updates configuration at runtime. Active side-effects for `placeholder`, `readonly`, `paperSize`, `locale`, and `theme`. The full `NotectlEditorConfig` is accepted.

### `registerPlugin(plugin: Plugin): void`

Registers a plugin. Must be called **before** `init()` or before the element is added to the DOM. **Throws** if called after initialization.

### `destroy(): Promise<void>`

Cleans up the editor. The editor can be re-initialized after destruction.

## HTML Attributes

| Attribute | Description |
|-----------|-------------|
| `placeholder` | Placeholder text (reflected) |
| `readonly` | Read-only mode (reflected) |
| `theme` | Theme preset: `"light"`, `"dark"`, or `"system"` |
| `paper-size` | Paper size: `"din-a4"`, `"din-a5"`, `"us-letter"`, or `"us-legal"` |
