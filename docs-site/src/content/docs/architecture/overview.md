---
title: Architecture Overview
description: The layered architecture of notectl.
---

notectl follows a strict layered architecture. Each layer has clear responsibilities and dependencies only flow downward.

## Layer Diagram

```
┌─────────────────────────────────────────┐
│              editor/                    │  Web Component (public API)
├─────────────────────────────────────────┤
│              plugins/                   │  Feature modules
├──────────┬──────────┬───────────────────┤
│ commands/│  input/  │      view/        │  High-level ops, input, DOM
├──────────┴──────────┴───────────────────┤
│       state/        │  decorations/     │  State + visual annotations
├─────────────────────┴───────────────────┤
│  serialization/  │  style/  │  i18n/   │  Cross-cutting concerns
├──────────────────┴──────────┴──────────┤
│       model/        │  platform/       │  Immutable data types + env
└─────────────────────┴──────────────────┘
```

## Layers

### Model (`model/`)

The foundation. Immutable data types with no DOM dependency:

- **`Document`** — Root container with `children: BlockNode[]`
- **`BlockNode`** — Block-level nodes (paragraph, heading, list_item, etc.)
- **`TextNode`** — Inline text segments with marks
- **`InlineNode`** — Atomic inline elements (hard break, emoji, mention, etc.)
- **`Mark`** — Inline annotations (bold, italic, link, etc.)
- **`Selection`** — Anchor + head positions
- **`Schema`** — Describes valid node and mark types
- **`NodeSpec` / `MarkSpec`** — Type declarations with DOM rendering

All types are deeply `readonly`. Mutations create new instances.

### State (`state/`)

Manages editor state transitions:

- **`EditorState`** — Immutable state container (doc + selection + schema + storedMarks)
- **`Transaction`** — A sequence of steps that transform state
- **`TransactionBuilder`** — Fluent API for constructing transactions
- **`StepApplication`** — Pure functions that apply steps to produce new state
- **`History`** — Undo/redo via transaction inversion with grouping

### View (`view/`)

DOM management and user interaction:

- **`EditorView`** — Orchestrates dispatch, reconciliation, and input handling
- **`Reconciler`** — Block-level DOM diffing (compares old/new state, patches DOM)
- **`SelectionSync`** — Syncs DOM selection with model selection
- **`NodeView`** — Custom rendering interface for complex blocks (e.g., tables)

### Input (`input/`)

Processes user input:

- **`InputManager`** — Orchestrates all input handler lifecycle and delegation
- **`InputHandler`** — `beforeinput` event → commands
- **`KeyboardHandler`** — Key events → keymap dispatch
- **`PasteHandler`** — Clipboard paste handling
- **`InputRule`** — Pattern-based text transforms (e.g., `# ` → heading)

### Commands (`commands/`)

High-level editing operations, split by category:

- **Text editing** — `insertText`, `splitBlock`, `mergeBlockBackward`, `mergeBlockForward`, `selectAll`
- **Mark operations** — `toggleMark`, `toggleBold`, `toggleItalic`, `toggleUnderline`, `isMarkActive`
- **Deletion** — `deleteBackward`, `deleteForward`, `deleteWordBackward`, `deleteWordForward`, `deleteSoftLineBackward`, `deleteSoftLineForward`
- **Movement (model)** — `moveCharacterForward`, `moveCharacterBackward`, `moveToBlockStart`, `moveToBlockEnd`, `moveToDocumentStart`, `moveToDocumentEnd`, `extendCharacterForward`, `extendCharacterBackward`, `extendToDocumentStart`, `extendToDocumentEnd`
- **Movement (view)** — `moveWordForward`, `moveWordBackward`, `moveToLineStart`, `moveToLineEnd`, `moveLineUp`, `moveLineDown`, `extendWordForward`, `extendWordBackward`, `extendToLineStart`, `extendToLineEnd`, `extendLineUp`, `extendLineDown`
- **Utilities** — `sharesParent`, `isInsideIsolating`, `isVoidBlock`, `canCrossBlockBoundary`

### Decorations (`decorations/`)

Lightweight visual annotations that do not alter the document model:

- **`Decoration`** — Inline, node, or widget decorations rendered by the view layer
- **`DecorationSet`** — Container for managing decoration collections
- **`PositionMapping`** — Maps decoration positions across state transitions

### Serialization (`serialization/`)

HTML import/export:

- **`DocumentSerializer`** — Converts Document to HTML
- **`DocumentParser`** — Parses HTML into Document
- **`CSSClassCollector`** — Collects CSS classes for class-based export

### Style (`style/`)

Runtime style management:

- **`StyleRuntime`** — Dynamic stylesheet injection and management

### I18n (`i18n/`)

Internationalization support:

- **`LocaleService`** — Locale resolution and management
- **`Locale`** — Supported locale constants (9 languages)

### Platform (`platform/`)

Environment detection:

- Browser and OS detection utilities for platform-specific behavior

### Plugins (`plugins/`)

Feature modules that compose the editor. Each plugin:

1. Registers schema extensions (NodeSpec, MarkSpec)
2. Registers commands and keymaps
3. Registers input rules
4. Registers toolbar items
5. Reacts to state changes

### Editor (`editor/`)

The public API layer:

- **`NotectlEditor`** — Web Component (`<notectl-editor>`)
- **`createEditor()`** — Factory function

Internally decomposed into focused controllers:

- **`EditorLifecycleCoordinator`** — Init/destroy state machine and readiness tracking
- **`EditorConfigController`** — Runtime config and observed attribute management
- **`EditorEventEmitter`** — Typed event emitter (`stateChange`, `focus`, `blur`, etc.)
- **`EditorStyleCoordinator`** — Shadow DOM stylesheet management
- **`EditorThemeController`** — Theme application and CSS variable generation
- **`PaperLayoutController`** — Paper size and layout management
- **`PluginBootstrapper`** — Auto-registration of essential plugins and toolbar processing
- **`ContentSerializer`** — Module of pure functions for content serialization (JSON, HTML, plain text)

## Key Design Principles

### DOM Isolation

Only `view/` touches the DOM. The model and state layers are purely data-driven and can run without a browser (useful for testing, server-side processing, etc.).

### Immutability

All data in `model/` and `state/` is immutable. Changes produce new objects:

```ts
const newState = oldState.apply(transaction);
// oldState is unchanged
```

### Step-Based Changes

Every change is expressed as a sequence of atomic `Steps`. Each step stores enough data to be inverted. This enables:

- Undo/redo without state snapshots
- Transaction composition
- Change inspection/auditing

### Plugin Encapsulation

Plugins never access editor internals directly. Everything goes through `PluginContext`. This makes plugins:

- Testable in isolation
- Safe from breaking changes in internal APIs
- Composable without conflicts

### Block-Level Reconciliation

The Reconciler diffs at block granularity — if a block hasn't changed, its DOM is untouched. Within a changed block, inline content is fully rebuilt. This is a good balance between performance and simplicity.
