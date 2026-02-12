---
title: Selection
description: Cursor position and text selection model.
---

## Selection

A selection is defined by two positions (anchor and head):

```ts
interface Selection {
  readonly anchor: Position;
  readonly head: Position;
}

interface Position {
  readonly blockId: BlockId;
  readonly offset: number;
}
```

- **`anchor`** — Where the selection started (fixed end)
- **`head`** — Where the selection ends (moving end, follows cursor)

When `anchor === head`, the selection is collapsed (a cursor).

## Factory Functions

```ts
import {
  createPosition,
  createSelection,
  createCollapsedSelection,
} from '@notectl/core';

// Cursor at offset 5 in a block
const cursor = createCollapsedSelection(blockId('abc'), 5);

// Range selection
const sel = createSelection(
  createPosition(blockId('abc'), 0),   // anchor
  createPosition(blockId('abc'), 10),  // head
);
```

## Utility Functions

```ts
import { isCollapsed, isForward, selectionRange } from '@notectl/core';

// Is it a cursor (no range)?
isCollapsed(selection); // boolean

// Is the head after the anchor?
isForward(selection); // boolean

// Normalized range (from/to regardless of direction)
const range = selectionRange(selection, blockOrder);
range.from; // { blockId, offset }
range.to;   // { blockId, offset }
```

## Cross-Block Selection

Selections can span multiple blocks:

```ts
const sel = createSelection(
  createPosition(blockId('block-1'), 5),  // anchor in first block
  createPosition(blockId('block-3'), 10), // head in third block
);
```

The `selectionRange()` function normalizes the direction and provides ordered `from` / `to` positions. Use `getBlockOrder()` from `EditorState` to resolve block ordering.

## Selection in State

Access the current selection via editor state:

```ts
const state = editor.getState();
const { anchor, head } = state.selection;

console.log('Cursor block:', anchor.blockId);
console.log('Cursor offset:', anchor.offset);
```

Listen for selection changes:

```ts
editor.on('selectionChange', ({ selection }) => {
  console.log('Selection:', selection);
});
```
