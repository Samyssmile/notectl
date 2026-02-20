---
title: EditorState
description: The immutable editor state container.
---

`EditorState` is the immutable container for all editor state. Every change produces a new `EditorState` instance.

## Creating State

```ts
import { EditorState } from '@notectl/core';

const state = EditorState.create({
  doc: myDocument,    // Optional Document
  schema: mySchema,   // Optional Schema
  selection: mySel,   // Optional EditorSelection
});
```

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `doc` | `Document` | The document tree |
| `selection` | `EditorSelection` | Current cursor/selection (text or node) |
| `schema` | `Schema` | Active schema (node + mark types) |
| `storedMarks` | `readonly Mark[] \| null` | Marks to apply on next input |

## Methods

### `getBlock(blockId: BlockId): BlockNode | undefined`

Look up a block by its ID (O(1) via internal index).

### `getBlockOrder(): readonly BlockId[]`

Returns leaf-block IDs in depth-first document order.

### `getNodePath(nodeId: BlockId): BlockId[] | undefined`

Returns the path (array of block IDs) from root to the given node.

### `getParent(nodeId: BlockId): BlockNode | undefined`

Returns the parent BlockNode of a node, or `undefined` for top-level blocks.

### `transaction(origin?: TransactionOrigin): TransactionBuilder`

Creates a `TransactionBuilder` for this state. The `origin` defaults to `'api'`.

```ts
const tr = state.transaction('command')
  .insertText(blockId, offset, 'hello', [])
  .addMark(blockId, 0, 5, { type: markType('bold') })
  .build();
```

### `apply(tr: Transaction): EditorState`

Applies a transaction to produce a new state. This is a pure function — the original state is unchanged.

### `toJSON(): object`

Serializes the state (document and selection) to a JSON-compatible object.

### `static fromJSON(json: { doc: Document; selection: EditorSelection }, schema?: Schema): EditorState`

Deserializes a state from a JSON object. Optionally accepts a schema.

```ts
const json = state.toJSON();
const restored = EditorState.fromJSON(json);
```

## Immutability

EditorState is deeply immutable:

```ts
const state1 = editor.getState();
const tr = state1.transaction('command')
  .insertText(blockId, 0, 'hello', [])
  .build();
const state2 = state1.apply(tr);

// state1 is unchanged
assert(state1 !== state2);
assert(state1.doc !== state2.doc);
```

This enables:
- **Undo/redo** via state snapshots
- **Safe comparison** between old and new states
- **Predictable plugin behavior** — plugins always see consistent state
