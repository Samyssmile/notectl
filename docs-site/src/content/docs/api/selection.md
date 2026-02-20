---
title: Selection
description: Cursor position, text selection, and node selection model.
---

## Text Selection

A text selection is defined by two positions (anchor and head):

```ts
interface Selection {
  readonly anchor: Position;
  readonly head: Position;
}

interface Position {
  readonly blockId: BlockId;
  readonly offset: number;
  /** Path from root to leaf block (for nested structures like tables). */
  readonly path?: readonly BlockId[];
}
```

- **`anchor`** — Where the selection started (fixed end)
- **`head`** — Where the selection ends (moving end, follows cursor)

When `anchor === head`, the selection is collapsed (a cursor).

## Node Selection

A node selection selects an entire block node (e.g., void blocks like images or horizontal rules):

```ts
interface NodeSelection {
  readonly type: 'node';
  readonly nodeId: BlockId;
  readonly path: readonly BlockId[];
}
```

## EditorSelection

The union type used throughout the editor:

```ts
type EditorSelection = Selection | NodeSelection;
```

Use type guards to distinguish:

```ts
import { isNodeSelection, isTextSelection } from '@notectl/core';

if (isNodeSelection(sel)) {
  console.log('Selected node:', sel.nodeId);
} else {
  console.log('Text selection:', sel.anchor, sel.head);
}
```

## Factory Functions

```ts
import {
  createPosition,
  createSelection,
  createCollapsedSelection,
  createNodeSelection,
} from '@notectl/core';

// Cursor at offset 5 in a block
const cursor = createCollapsedSelection(blockId('abc'), 5);

// Range selection
const sel = createSelection(
  createPosition(blockId('abc'), 0),   // anchor
  createPosition(blockId('abc'), 10),  // head
);

// Position with path (for nested structures like table cells)
const pos = createPosition(blockId('cell-1'), 0, [blockId('table-1'), blockId('row-1')]);

// Node selection (e.g., select an image block)
const nodeSel = createNodeSelection(blockId('img-1'), []);
```

## Utility Functions

```ts
import {
  isCollapsed, isForward, selectionRange, selectionsEqual,
} from '@notectl/core';

// Is it a cursor (no range)? NodeSelection is never collapsed.
isCollapsed(selection); // boolean

// Is the head after the anchor?
isForward(selection, blockOrder?); // boolean

// Normalized range (from/to regardless of direction)
// Note: Only works with text selections. Guard with isTextSelection() first.
const range = selectionRange(selection, blockOrder);
range.from; // Position
range.to;   // Position

// Compare two selections for equality
selectionsEqual(selA, selB); // boolean
```

### SelectionRange

```ts
interface SelectionRange {
  readonly from: Position;
  readonly to: Position;
}
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
const sel = state.selection; // EditorSelection

if (isTextSelection(sel)) {
  console.log('Cursor block:', sel.anchor.blockId);
  console.log('Cursor offset:', sel.anchor.offset);
}
```

Listen for selection changes:

```ts
editor.on('selectionChange', ({ selection }) => {
  console.log('Selection:', selection); // EditorSelection
});
```
