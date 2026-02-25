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
│              state/                     │  EditorState, Transaction, History
├─────────────────────────────────────────┤
│              model/                     │  Immutable data types
└─────────────────────────────────────────┘
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

- **`InputHandler`** — `beforeinput` event → commands
- **`KeyboardHandler`** — Key events → keymap dispatch
- **`PasteHandler`** — Clipboard paste handling
- **`InputRule`** — Pattern-based text transforms (e.g., `# ` → heading)

### Commands (`commands/`)

High-level editing operations:

- `toggleMark`, `insertText`, `deleteBackward`, `deleteForward`
- `splitBlock`, `mergeBlockBackward`, `selectAll`
- `isMarkActive`, `sharesParent`, `isInsideIsolating`

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
