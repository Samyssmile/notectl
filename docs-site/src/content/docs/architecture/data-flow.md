---
title: Data Flow
description: How data flows through the notectl editor from input to DOM.
---

## The Cycle

Every user interaction follows this cycle:

```
User Input
    ↓
InputHandler / KeyboardHandler
    ↓
TransactionBuilder creates Transaction (Steps)
    ↓
PluginManager.dispatchWithMiddleware()
    ↓ (priority-ordered middleware chain)
EditorState.apply(transaction)
    ↓
New immutable EditorState
    ↓
Reconciler patches DOM (block-level diff)
    ↓
SelectionSync updates cursor
    ↓
Plugins notified via onStateChange()
```

## Step-by-Step Walkthrough

### 1. User Types a Character

The browser fires a `beforeinput` event with `inputType: 'insertText'`.

### 2. InputHandler Processes the Event

The `InputHandler` maps the input type to an editing operation:

```
'insertText' → insertTextCommand(state, text)
'deleteContentBackward' → deleteBackward(state)
'insertParagraph' → splitBlockCommand(state)
```

### 3. Transaction is Built

The command creates a `Transaction` using the builder:

```ts
const tr = state.transaction('input')
  .insertText(blockId, offset, 'a')
  .build();
```

The transaction contains:
- **Origin**: `'input'`
- **Steps**: `[InsertTextStep { blockId, offset, text: 'a' }]`
- **Selection**: Updated cursor position

### 4. Middleware Chain

The transaction passes through registered middleware in priority order:

```ts
middleware1(tr, state, (tr) => {
  middleware2(tr, state, (tr) => {
    // ... finally:
    view.dispatch(tr);
  });
});
```

Middleware can:
- **Inspect** the transaction (logging, analytics)
- **Modify** the transaction (add extra steps)
- **Cancel** the transaction (don't call `next()`)

### 5. State Application

`EditorState.apply()` executes each step sequentially:

```ts
const newState = oldState.apply(tr);
```

Each step is a pure function: `(Document, Step) → Document`

The resulting state has:
- New document with the text inserted
- Updated selection (cursor moved forward)
- Same schema (unchanged)

### 6. History Records the Change

The `HistoryManager` records the transaction for undo:

```ts
history.push(tr, invertTransaction(tr));
```

Consecutive input transactions are grouped — a rapid sequence of keystrokes becomes a single undo entry.

### 7. DOM Reconciliation

The `Reconciler` compares old and new state:

```
For each block in newState.doc:
  if block existed before and hasn't changed:
    → skip (DOM untouched)
  if block is new:
    → create DOM element, insert at correct position
  if block changed:
    → rebuild inline content (text nodes + marks)
  if block was removed:
    → remove DOM element
```

### 8. Selection Sync

`SelectionSync` updates the browser's selection to match the model:

```ts
// Model: { blockId: 'abc', offset: 5 }
// → DOM: text node inside [data-block-id="abc"], offset 5
```

### 9. Plugin Notification

All plugins with `onStateChange()` are notified:

```ts
plugin.onStateChange(oldState, newState, transaction);
```

Plugins use this to update toolbar state, track changes, etc.

## Keyboard Shortcut Flow

For keyboard shortcuts (e.g., `Ctrl+B`):

```
KeyDown event
    ↓
KeyboardHandler checks keymap registry
    ↓
Matches 'Mod-B' → calls toggleBold command
    ↓
Command creates Transaction with AddMark/RemoveMark steps
    ↓
... same flow as above (middleware → apply → reconcile → notify)
```

## Input Rule Flow

For input rules (e.g., `# ` → heading):

```
User types '#' then ' '
    ↓
InputHandler processes 'insertText' for ' '
    ↓
After applying the text, InputRule matcher runs:
  - Gets current block text
  - Tests against registered patterns
  - Match found: /^# $/ → heading
    ↓
Creates new Transaction: setBlockType(heading, level: 1) + deleteText
    ↓
... same flow as above
```

## Undo Flow

```
User presses Ctrl+Z
    ↓
KeyboardHandler matches 'Mod-Z'
    ↓
HistoryManager.undo()
    ↓
Retrieves inverse transaction from history stack
    ↓
Applies inverse transaction
    ↓
... same flow (reconcile → sync → notify)
```
