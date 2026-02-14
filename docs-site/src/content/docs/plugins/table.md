---
title: Table Plugin
description: Full table support with grid picker, multi-cell selection, keyboard navigation, and row/column operations.
---

The `TablePlugin` provides full table support including a grid picker for insertion, multi-cell selection, keyboard navigation, and row/column operations.

![Table plugin with grid picker](../../../assets/screenshots/plugin-table.png)

## Usage

```ts
import { TablePlugin } from '@notectl/core';

new TablePlugin()
// or with custom picker size:
new TablePlugin({ maxPickerRows: 10, maxPickerCols: 10 })
```

## Configuration

```ts
interface TableConfig {
  /** Maximum rows in grid picker. Default: 8 */
  readonly maxPickerRows?: number;
  /** Maximum columns in grid picker. Default: 8 */
  readonly maxPickerCols?: number;
  /** Render separator after toolbar item. */
  readonly separatorAfter?: boolean;
}
```

## Commands

| Command | Description | Returns |
|---------|-------------|---------|
| `insertTable` | Insert a table (via grid picker selection) | `boolean` |
| `addRowBefore` | Insert row above current cell | `boolean` |
| `addRowAfter` | Insert row below current cell | `boolean` |
| `addColumnBefore` | Insert column to the left of current cell | `boolean` |
| `addColumnAfter` | Insert column to the right of current cell | `boolean` |
| `deleteRow` | Delete the row containing the cursor | `boolean` |
| `deleteColumn` | Delete the column containing the cursor | `boolean` |
| `deleteTable` | Delete the entire table | `boolean` |

```ts
// Insert a table programmatically
editor.executeCommand('insertTable');

// Modify table structure
editor.executeCommand('addRowAfter');
editor.executeCommand('deleteColumn');
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Tab` | Move to next cell (wraps to next row) |
| `Shift+Tab` | Move to previous cell |
| `Enter` | Move to cell below (adds new row if at bottom) |
| Arrow keys | Navigate between cells |

## Toolbar

The table toolbar button shows a **grid picker popup**. Hover over cells to select the table dimensions (e.g., 3x4), then click to insert. The label updates dynamically to show the current hover dimensions.

## Node Specs

| Type | HTML Tag | Attributes | Description |
|------|----------|-----------|-------------|
| `table` | `<table>` | - | Table container |
| `table_row` | `<tr>` | - | Table row |
| `table_cell` | `<td>` | `colspan?: number`, `rowspan?: number` | Table cell |

## Multi-Cell Selection

The table plugin supports selecting multiple cells by click-and-drag. Selected cells are highlighted and can be operated on as a group (e.g., delete all selected cells' content).

### TableSelectionService

Access the selection service programmatically:

```ts
import { TableSelectionServiceKey } from '@notectl/core';

const service = context.getService(TableSelectionServiceKey);
```

## Custom Node Views

Tables use custom `NodeView` implementations for:
- **Table wrapper** with horizontal scroll support for wide tables
- **Row rendering** with proper `<tr>` element management
- **Cell rendering** with editable content areas inside `<td>` elements
