---
title: Commands
description: Pure functions for text editing, mark toggling, deletion, cursor movement, and block inspection.
---

Commands are pure functions that take an `EditorState` and return a `Transaction` (or `null` if the command cannot be applied). They never mutate state or touch the DOM directly.

```ts
import { insertTextCommand, toggleBold } from '@notectl/core';

const tr = insertTextCommand(state, 'Hello');
if (tr) editor.dispatch(tr);
```

## Text Commands

### `insertTextCommand(state, text, origin?)`

Inserts text at the current cursor position. Replaces any selected text.

```ts
function insertTextCommand(
  state: EditorState,
  text: string,
  origin?: 'input' | 'paste',
): Transaction
```

### `insertHardBreakCommand(state)`

Inserts a hard line break (`<br>`) at the cursor position.

```ts
function insertHardBreakCommand(state: EditorState): Transaction | null
```

### `splitBlockCommand(state)`

Splits the current block at the cursor, creating a new block below.

```ts
function splitBlockCommand(state: EditorState): Transaction | null
```

### `mergeBlockBackward(state)`

Merges the current block with the previous one (e.g. pressing Backspace at the start of a block).

```ts
function mergeBlockBackward(state: EditorState): Transaction | null
```

### `mergeBlockForward(state)`

Merges the current block with the next one (e.g. pressing Delete at the end of a block).

```ts
function mergeBlockForward(state: EditorState): Transaction | null
```

### `deleteSelectionCommand(state)`

Deletes the currently selected text, producing a collapsed cursor.

```ts
function deleteSelectionCommand(state: EditorState): Transaction | null
```

### `selectAll(state)`

Selects all content in the document.

```ts
function selectAll(state: EditorState): Transaction
```

---

## Mark Commands

### `toggleMark(state, markType, features?)`

Toggles an inline mark on the current selection or stored marks.

```ts
function toggleMark(
  state: EditorState,
  markType: MarkTypeName,
  features?: FeatureConfig,
): Transaction | null
```

### Convenience Toggles

```ts
function toggleBold(state: EditorState, features?: FeatureConfig): Transaction | null
function toggleItalic(state: EditorState, features?: FeatureConfig): Transaction | null
function toggleUnderline(state: EditorState, features?: FeatureConfig): Transaction | null
```

### `isMarkActive(state, markType)`

Returns `true` if the given mark is active at the current selection.

```ts
function isMarkActive(state: EditorState, markType: MarkTypeName): boolean
```

### FeatureConfig

Controls which formatting features are available:

```ts
interface FeatureConfig {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
}
```

---

## Attributed Mark Commands

For marks that carry attributes (e.g. `link` with `href`, `textColor` with `color`).

### `applyAttributedMark(state, mark)`

Applies a mark with attributes to the current selection.

```ts
function applyAttributedMark(state: EditorState, mark: Mark): Transaction | null
```

### `removeAttributedMark(state, markTypeName)`

Removes all instances of a mark type from the current selection.

```ts
function removeAttributedMark(
  state: EditorState,
  markTypeName: MarkTypeName,
): Transaction | null
```

### `isAttributedMarkActive(state, markTypeName)`

Returns `true` if the given attributed mark type is active at the selection.

```ts
function isAttributedMarkActive<K extends keyof MarkAttrRegistry>(
  state: EditorState,
  markTypeName: K,
): boolean
```

### `getMarkAttrAtSelection(state, markTypeName, extractFn)`

Extracts a value from the mark attributes at the current selection.

```ts
function getMarkAttrAtSelection<K extends keyof MarkAttrRegistry, V>(
  state: EditorState,
  markTypeName: K,
  extractFn: (mark: Mark & { readonly type: K; readonly attrs: MarkAttrRegistry[K] }) => V | null,
): V | null
```

**Example:**

```ts
const href = getMarkAttrAtSelection(state, markType('link'), (m) => m.attrs.href);
```

---

## Delete Commands

All delete commands return `null` when there is nothing to delete.

| Command | Description |
|---------|-------------|
| `deleteBackward(state)` | Delete one character backward (Backspace) |
| `deleteForward(state)` | Delete one character forward (Delete) |
| `deleteWordBackward(state)` | Deletes the word before the cursor |
| `deleteWordForward(state)` | Deletes the word after the cursor |
| `deleteSoftLineBackward(state)` | Deletes to the beginning of the soft line |
| `deleteSoftLineForward(state)` | Deletes to the end of the soft line |
```ts
function deleteBackward(state: EditorState): Transaction | null
function deleteForward(state: EditorState): Transaction | null
function deleteWordBackward(state: EditorState): Transaction | null
function deleteWordForward(state: EditorState): Transaction | null
function deleteSoftLineBackward(state: EditorState): Transaction | null
function deleteSoftLineForward(state: EditorState): Transaction | null
```

---

## Node Selection Commands

Commands for handling void/node-selected blocks.

### `deleteNodeSelection(state, sel)`

Deletes the node-selected block.

```ts
function deleteNodeSelection(
  state: EditorState,
  sel: NodeSelection,
): Transaction | null
```

### `navigateArrowIntoVoid(state, direction, isRtl?)`

Moves the cursor into a void block via arrow keys, creating a `NodeSelection`.

```ts
function navigateArrowIntoVoid(
  state: EditorState,
  direction: 'left' | 'right' | 'up' | 'down',
  isRtl?: boolean,
): Transaction | null
```

### `findFirstLeafBlockId(node)`

Finds the first leaf block ID in a node tree (depth-first).

```ts
function findFirstLeafBlockId(node: BlockNode): BlockId
```

### `findLastLeafBlockId(node)`

Finds the last leaf block ID in a node tree (depth-first).

```ts
function findLastLeafBlockId(node: BlockNode): BlockId
```

### `insertParagraphAfterNodeSelection(state, sel)`

Inserts a new paragraph after the node-selected block and moves the cursor into it.

```ts
function insertParagraphAfterNodeSelection(
  state: EditorState,
  sel: NodeSelection,
): Transaction | null
```

### `insertTextAfterNodeSelection(state, sel, text, origin)`

Inserts text into a new paragraph after the node-selected block.

```ts
function insertTextAfterNodeSelection(
  state: EditorState,
  sel: NodeSelection,
  text: string,
  origin: 'input' | 'paste',
): Transaction
```

---

## Gap Cursor Commands

Commands for editing when the cursor is in a gap position (between void blocks).

```ts
function deleteBackwardAtGap(state: EditorState, sel: GapCursorSelection): Transaction | null
function deleteForwardAtGap(state: EditorState, sel: GapCursorSelection): Transaction | null
```

### `insertParagraphAtGap(state, sel)`

Inserts a new paragraph at the gap cursor position.

```ts
function insertParagraphAtGap(
  state: EditorState,
  sel: GapCursorSelection,
): Transaction | null
```

### `insertTextAtGap(state, sel, text, origin)`

Inserts text into a new paragraph at the gap cursor position.

```ts
function insertTextAtGap(
  state: EditorState,
  sel: GapCursorSelection,
  text: string,
  origin: 'input' | 'paste',
): Transaction
```

---

## Model Movement Commands

Pure state-level cursor movement — no DOM access required.

### Character Movement

```ts
function moveCharacterForward(state: EditorState): Transaction | null
function moveCharacterBackward(state: EditorState): Transaction | null
```

### Document Boundaries

```ts
function moveToDocumentStart(state: EditorState): Transaction | null
function moveToDocumentEnd(state: EditorState): Transaction | null
```

### Block Boundaries

```ts
function moveToBlockStart(state: EditorState): Transaction | null
function moveToBlockEnd(state: EditorState): Transaction | null
```

### Selection Extension

```ts
function extendCharacterForward(state: EditorState): Transaction | null
function extendCharacterBackward(state: EditorState): Transaction | null
function extendToBlockStart(state: EditorState): Transaction | null
function extendToBlockEnd(state: EditorState): Transaction | null
function extendToDocumentStart(state: EditorState): Transaction | null
function extendToDocumentEnd(state: EditorState): Transaction | null
```

---

## View Movement Commands

DOM-aware cursor movement using the browser's caret positioning. These require an `HTMLElement` container (the editor's content element).

### Core Functions

```ts
function viewMove(
  container: HTMLElement,
  state: EditorState,
  direction: 'forward' | 'backward',
  granularity: 'word' | 'lineboundary' | 'line',
): Transaction | null

function viewExtend(
  container: HTMLElement,
  state: EditorState,
  direction: 'forward' | 'backward',
  granularity: 'word' | 'lineboundary' | 'line',
): Transaction | null
```

### Convenience Wrappers

All take `(container: HTMLElement, state: EditorState) => Transaction | null`:

**Movement:**

| Function | Description |
|----------|-------------|
| `moveWordForward` | Move cursor one word forward |
| `moveWordBackward` | Move cursor one word backward |
| `moveToLineStart` | Move cursor to start of visual line |
| `moveToLineEnd` | Move cursor to end of visual line |
| `moveLineUp` | Move cursor one line up |
| `moveLineDown` | Move cursor one line down |

**Selection extension:**

| Function | Description |
|----------|-------------|
| `extendWordForward` | Extend selection one word forward |
| `extendWordBackward` | Extend selection one word backward |
| `extendToLineStart` | Extend selection to start of visual line |
| `extendToLineEnd` | Extend selection to end of visual line |
| `extendLineUp` | Extend selection one line up |
| `extendLineDown` | Extend selection one line down |

---

## Range Helpers

### `forEachBlockInRange(state, range, callback)`

Iterates over every block that overlaps with a selection range, providing the block ID and the from/to offsets within each block. Blocks where `from === to` are skipped automatically.

```ts
function forEachBlockInRange(
  state: EditorState,
  range: SelectionRange,
  callback: (blockId: BlockId, from: number, to: number) => void,
): void
```

### `forEachBlockIdInRange(state, range, callback)`

Iterates over every block ID in the given selection range, including empty blocks and boundary blocks regardless of offset span. Designed for block-level operations (e.g. `setBlockType`) where offsets are irrelevant.

```ts
function forEachBlockIdInRange(
  state: EditorState,
  range: SelectionRange,
  callback: (blockId: BlockId) => void,
): void
```

---

## Block Inspection

Utility functions for querying block properties.

### `isVoidBlock(state, blockId)`

Returns `true` if the block is a void node (no editable text).

### `isIsolatingBlock(state, blockId)`

Returns `true` if the block is isolating (selection cannot cross its boundary).

### `isInsideIsolating(state, blockId)`

Returns `true` if the block is nested inside an isolating parent.

### `sharesParent(state, blockId1, blockId2)`

Returns `true` if two blocks share the same parent node.

### `canCrossBlockBoundary(state, fromBlockId, toBlockId)`

Returns `true` if the cursor can cross the boundary between two blocks (both are non-isolating or share a parent).

---

## Word Boundary

### `findWordBoundaryForward(block, offset)`

Finds the next word boundary position after the given offset.

```ts
function findWordBoundaryForward(block: BlockNode, offset: number): number
```

### `findWordBoundaryBackward(block, offset)`

Finds the previous word boundary position before the given offset.

```ts
function findWordBoundaryBackward(block: BlockNode, offset: number): number
```

---

## Related

- [Transaction](/notectl/api/transaction/) — the `Transaction` type that commands produce
- [EditorState](/notectl/api/editor-state/) — the `EditorState` that commands consume
- [Selection](/notectl/api/selection/) — selection types used by movement commands
- [Input System](/notectl/api/input/) — how keymaps dispatch to commands
