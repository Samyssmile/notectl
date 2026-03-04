---
title: Input System
description: Keyboard handling, input rules, file handlers, clipboard, and composition tracking.
---

The input system translates browser events into editor transactions. It consists of several registries and handlers that plugins use to register keymaps, input rules, and file handlers.

## InputManager

Facade that coordinates all input-related handlers. Created internally by the editor.

```ts
import { InputManager } from '@notectl/core';
import type { InputManagerDeps } from '@notectl/core';
```

### InputManagerDeps

```ts
interface InputManagerDeps {
  readonly getState: () => EditorState;
  readonly dispatch: (tr: Transaction) => void;
  readonly syncSelection: () => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly schemaRegistry?: SchemaRegistry;
  readonly keymapRegistry?: KeymapRegistry;
  readonly inputRuleRegistry?: InputRuleRegistry;
  readonly fileHandlerRegistry?: FileHandlerRegistry;
  readonly isReadOnly: () => boolean;
  readonly getPasteInterceptors?: () => readonly PasteInterceptorEntry[];
  readonly getTextDirection?: (element: HTMLElement) => 'ltr' | 'rtl';
  readonly navigateFromGapCursor?: (
    state: EditorState,
    direction: 'left' | 'right' | 'up' | 'down',
    container?: HTMLElement,
  ) => Transaction | null;
}
```

### Constructor

```ts
const manager = new InputManager(contentElement, deps);
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `compositionTracker` | `CompositionTracker` | Tracks IME composition state |

### Methods

| Method | Description |
|--------|-------------|
| `destroy()` | Removes all event listeners and cleans up resources |

---

## KeymapRegistry

Stores keymaps registered by plugins, organized by priority level.

```ts
import { KeymapRegistry } from '@notectl/core';

const registry = new KeymapRegistry();
```

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `registerKeymap` | `(keymap: Keymap, options?: KeymapOptions) => void` | Register a keymap at a priority level |
| `getKeymaps` | `() => readonly Keymap[]` | Get all keymaps (flat list) |
| `getKeymapsByPriority` | `() => { context, navigation, default }` | Get keymaps grouped by priority |
| `removeKeymap` | `(keymap: Keymap) => void` | Remove a specific keymap |
| `clear` | `() => void` | Remove all keymaps |

### Priority System

Keymaps are dispatched in priority order: `context` > `navigation` > `default`.

```ts
type KeymapPriority = 'context' | 'navigation' | 'default';

interface KeymapOptions {
  readonly priority?: KeymapPriority;
}
```

| Priority | Use Case |
|----------|----------|
| `context` | Context-sensitive shortcuts (e.g. code block Tab handling) |
| `navigation` | Caret/selection movement (e.g. arrow keys, Home/End) |
| `default` | General commands (e.g. Ctrl+B for bold) — this is the default |

### Keymap Types

```ts
type KeymapHandler = () => boolean;
type Keymap = Readonly<Record<string, KeymapHandler>>;
```

A `Keymap` maps key descriptors to handlers. Handlers return `true` if they consumed the event.

Key descriptors use the format `Mod-B`, `Shift-Enter`, `Alt-ArrowUp`, etc. `Mod` maps to `Cmd` on macOS and `Ctrl` on other platforms.

### `normalizeKeyDescriptor(e)`

Normalizes a `KeyboardEvent` into a consistent key descriptor string. Format: `"Mod-Shift-Alt-Key"` where `Mod` = Ctrl/Cmd.

```ts
import { normalizeKeyDescriptor } from '@notectl/core';

// Takes a KeyboardEvent, not a string
element.addEventListener('keydown', (e) => {
  const descriptor = normalizeKeyDescriptor(e);
  // e.g. 'Mod-B', 'Mod-Shift-1', 'Enter', 'Space'
});
```

```ts
function normalizeKeyDescriptor(e: KeyboardEvent): string
```

---

## InputRuleRegistry

Stores pattern-based text transform rules registered by plugins.

```ts
import { InputRuleRegistry } from '@notectl/core';

const registry = new InputRuleRegistry();
```

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `registerInputRule` | `(rule: InputRule) => void` | Register an input rule |
| `getInputRules` | `() => readonly InputRule[]` | Get all registered rules |
| `removeInputRule` | `(rule: InputRule) => void` | Remove a specific rule |
| `clear` | `() => void` | Remove all rules |

### InputRule Interface

```ts
interface InputRule {
  readonly pattern: RegExp;
  handler(
    state: EditorState,
    match: RegExpMatchArray,
    start: number,
    end: number,
  ): Transaction | null;
}
```

Input rules are matched against text as the user types. When a pattern matches, the handler is called with the match and can return a transaction to apply.

**Example** — auto-convert `# ` to heading:

```ts
const headingRule: InputRule = {
  pattern: /^(#{1,6})\s$/,
  handler(state, match, start, end) {
    const level = match[1].length;
    return state.transaction('input')
      .deleteTextAt(blockId, start, end)
      .setBlockType(blockId, nodeType('heading'), { level })
      .build();
  },
};
```

---

## FileHandlerRegistry

Manages handlers for dropped or pasted files, matched by MIME type patterns.

```ts
import { FileHandlerRegistry } from '@notectl/core';

const registry = new FileHandlerRegistry();
```

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `registerFileHandler` | `(pattern: string, handler: FileHandler) => void` | Register a handler for a MIME pattern |
| `getFileHandlers` | `() => readonly FileHandlerEntry[]` | Get all registered handlers |
| `matchFileHandlers` | `(mimeType: string) => FileHandler[]` | Find handlers matching a MIME type |
| `removeFileHandler` | `(handler: FileHandler) => void` | Remove a specific handler |
| `clear` | `() => void` | Remove all handlers |

### Types

```ts
type FileHandler = (
  file: File,
  position: Position | null,
) => boolean | Promise<boolean>;

interface FileHandlerEntry {
  readonly pattern: string;
  readonly handler: FileHandler;
}
```

### MIME Pattern Matching

Patterns support wildcards:

| Pattern | Matches |
|---------|---------|
| `image/*` | `image/png`, `image/jpeg`, etc. |
| `text/plain` | Only `text/plain` |
| `*/*` | Any MIME type |

**Example:**

```ts
registry.registerFileHandler('image/*', async (file, position) => {
  const url = URL.createObjectURL(file);
  // Insert image block at position
  return true; // handled
});
```

---

## ClipboardHandler

Handles copy and cut operations, serializing the selection to `text/plain` and `text/html` clipboard formats.

```ts
import { ClipboardHandler } from '@notectl/core';

const handler = new ClipboardHandler(element, {
  getState: () => editor.getState(),
  dispatch: (tr) => editor.dispatch(tr),
  schemaRegistry,
  syncSelection: () => { /* ... */ },
  isReadOnly: () => false,
});
```

### Constructor Options

The constructor accepts an options object with the following shape (the type itself is not exported):

```ts
{
  readonly getState: () => EditorState;
  readonly dispatch: (tr: Transaction) => void;
  readonly schemaRegistry?: SchemaRegistry;
  readonly syncSelection?: () => void;
  readonly isReadOnly?: () => boolean;
}
```

### Methods

| Method | Description |
|--------|-------------|
| `destroy()` | Removes clipboard event listeners |

The `ClipboardHandler` automatically listens for `copy` and `cut` events on the provided element. For cut operations, it dispatches a `deleteSelectionCommand` after writing to the clipboard.

---

## CompositionTracker

Tracks IME (Input Method Editor) composition state for languages like Chinese, Japanese, and Korean.

```ts
import { CompositionTracker } from '@notectl/core';

const tracker = new CompositionTracker();
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `isComposing` | `boolean` | Whether an IME composition is active |
| `activeBlockId` | `BlockId \| null` | The block where composition is happening |

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `start` | `(blockId: BlockId) => void` | Begin composition tracking |
| `end` | `() => void` | End composition tracking |

### CompositionState Interface

```ts
interface CompositionState {
  readonly isComposing: boolean;
  readonly activeBlockId: BlockId | null;
}
```

The `CompositionTracker` implements this interface. During composition, the editor defers DOM reconciliation to avoid interfering with the IME.

---

## Related

- [Plugin Interface](/notectl/api/plugin-interface/) — `registerKeymap()`, `registerInputRule()`, `registerFileHandler()`
- [Commands](/notectl/api/commands/) — commands dispatched by keymaps
- [Keyboard Navigation](/notectl/guides/keyboard-navigation/) — guide to keyboard shortcuts
