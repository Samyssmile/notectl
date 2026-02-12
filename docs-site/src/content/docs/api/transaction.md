---
title: Transaction
description: Atomic state changes via step-based transactions.
---

Transactions represent atomic state changes. They contain a sequence of `Steps` that transform the document.

## Creating Transactions

Use the `TransactionBuilder` from an `EditorState`:

```ts
const state = editor.getState();
const tr = state.transaction('command')
  .insertText(blockId, offset, 'hello')
  .build();

editor.dispatch(tr);
```

## TransactionBuilder Methods

### Text Operations

```ts
builder.insertText(blockId, offset, text)
builder.deleteText(blockId, from, to)
```

### Mark Operations

```ts
builder.addMark(blockId, from, to, mark)
builder.removeMark(blockId, from, to, mark)
```

### Block Operations

```ts
builder.splitBlock(blockId, offset)
builder.mergeBlocks(targetBlockId, sourceBlockId)
builder.setBlockType(blockId, newType, attrs?)
builder.setNodeAttr(blockId, key, value)
builder.insertNode(index, node)
builder.removeNode(blockId)
```

### Selection

```ts
builder.setSelection(selection)
builder.setStoredMarks(marks, previousMarks)
```

### Build

```ts
const transaction = builder.build();
```

## Transaction Origins

Each transaction has an `origin` that describes where it came from:

```ts
type TransactionOrigin = 'input' | 'command' | 'history' | 'plugin' | 'external';
```

| Origin | Description |
|--------|-------------|
| `input` | User typing / input events |
| `command` | Programmatic command execution |
| `history` | Undo/redo operations |
| `plugin` | Plugin-initiated changes |
| `external` | External API calls (setHTML, setJSON) |

## Step Types

Every step is invertible for undo support:

| Step | Description |
|------|-------------|
| `InsertTextStep` | Insert text at position |
| `DeleteTextStep` | Delete text range |
| `SplitBlockStep` | Split block at offset |
| `MergeBlocksStep` | Merge two adjacent blocks |
| `AddMarkStep` | Add inline mark to range |
| `RemoveMarkStep` | Remove inline mark from range |
| `SetBlockTypeStep` | Change block type |
| `InsertNodeStep` | Insert a new block node |
| `RemoveNodeStep` | Remove a block node |
| `SetNodeAttrStep` | Change a node attribute |

## Inverting Transactions

Every transaction can be inverted for undo:

```ts
import { invertTransaction } from '@notectl/core';

const inverse = invertTransaction(transaction);
// Applying inverse undoes the original transaction
```

## Middleware

Transactions pass through a middleware chain before being applied:

```ts
context.registerMiddleware((tr, state, next) => {
  // Inspect or modify the transaction
  console.log(`${tr.steps.length} steps`);
  next(tr); // Call next to continue, or skip to cancel
}, 100);
```
