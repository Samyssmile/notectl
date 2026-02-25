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
  .insertText(blockId, offset, 'hello', [])
  .build();

editor.dispatch(tr);
```

The `origin` parameter is optional and defaults to `'api'`:

```ts
// Equivalent — origin defaults to 'api'
const tr = state.transaction()
  .setBlockType(blockId, nodeType('heading'), { level: 1 })
  .build();
```

## TransactionBuilder Methods

### Text Operations

```ts
// Insert text with marks at a position
builder.insertText(blockId, offset, text, marks, segments?)

// Delete text with explicit undo data
builder.deleteText(blockId, from, to, deletedText, deletedMarks, deletedSegments?)

// Delete text — auto-derives undo data from working document
builder.deleteTextAt(blockId, from, to)
```

### Mark Operations

```ts
builder.addMark(blockId, from, to, mark)
builder.removeMark(blockId, from, to, mark)
```

### Block Operations

```ts
// Split a block at offset, creating a new block with the given ID
builder.splitBlock(blockId, offset, newBlockId)

// Merge two blocks with explicit target length
builder.mergeBlocks(targetBlockId, sourceBlockId, targetLengthBefore)

// Merge two blocks — auto-derives target length from working document
builder.mergeBlocksAt(targetBlockId, sourceBlockId)

// Change a block's type and optionally its attributes
builder.setBlockType(blockId, nodeType, attrs?)
```

### Structural Operations (Nested Documents)

```ts
// Insert a child node at index under the parent path
builder.insertNode(parentPath, index, node)

// Remove a child node at index under the parent path
builder.removeNode(parentPath, index)

// Set attributes on a node at the given path
builder.setNodeAttr(path, attrs)
```

### InlineNode Operations

```ts
// Insert an InlineNode at offset within a block
builder.insertInlineNode(blockId, offset, node)

// Remove an InlineNode at offset (auto-derives from working document)
builder.removeInlineNode(blockId, offset)

// Set attributes on an InlineNode at offset
// attrs: Readonly<Record<string, string | number | boolean>>
builder.setInlineNodeAttr(blockId, offset, attrs)
```

### Selection

```ts
builder.setSelection(selection)
builder.setNodeSelection(nodeId, path)
builder.setStoredMarks(marks, previousMarks)
```

### Build

```ts
const transaction = builder.build();
```

## Transaction Origins

Each transaction has an `origin` that describes where it came from:

```ts
type TransactionOrigin = 'input' | 'paste' | 'command' | 'history' | 'api';
```

| Origin | Description |
|--------|-------------|
| `input` | User typing / input events |
| `paste` | Paste operations |
| `command` | Programmatic command execution |
| `history` | Undo/redo operations |
| `api` | External API calls (setHTML, setJSON) — **this is the default** |

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
| `SetStoredMarksStep` | Set stored marks (for mark continuity) — internal, not exported |
| `InsertNodeStep` | Insert a block node into a parent |
| `RemoveNodeStep` | Remove a block node from a parent |
| `SetNodeAttrStep` | Change a node's attributes |
| `InsertInlineNodeStep` | Insert an inline node at offset |
| `RemoveInlineNodeStep` | Remove an inline node at offset |
| `SetInlineNodeAttrStep` | Change an inline node's attributes |

## Inverting Transactions

Every transaction can be inverted for undo:

```ts
import { invertTransaction } from '@notectl/core';

const inverse = invertTransaction(transaction);
// Applying inverse undoes the original transaction
```

Individual steps can also be inverted:

```ts
import { invertStep } from '@notectl/core';

const invertedStep = invertStep(step);
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
