---
title: Table Plugin
description: Full table support with grid picker, cell selection, and row/column operations.
---

The `TablePlugin` provides full table support including a grid picker for insertion, multi-cell selection, keyboard navigation, and row/column operations.

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
  maxPickerRows?: number;
  /** Maximum columns in grid picker. Default: 8 */
  maxPickerCols?: number;
  separatorAfter?: boolean;
}
```

## Commands

| Command | Description |
|---------|-------------|
| `insertTable` | Insert a table (via grid picker) |
| `addRowBefore` | Insert row above current |
| `addRowAfter` | Insert row below current |
| `addColumnBefore` | Insert column to the left |
| `addColumnAfter` | Insert column to the right |
| `deleteRow` | Delete current row |
| `deleteColumn` | Delete current column |
| `deleteTable` | Delete the entire table |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Tab` | Move to next cell |
| `Shift+Tab` | Move to previous cell |
| `Enter` | Move to cell below (or add row) |
| Arrow keys | Navigate between cells |

## Toolbar

The table toolbar button shows a grid picker popup. Hover over cells to select the table dimensions (e.g., 3x4), then click to insert.

## Node Specs

| Type | Attributes | Description |
|------|-----------|-------------|
| `table` | — | Table container |
| `table_row` | — | Table row |
| `table_cell` | `colspan?: number`, `rowspan?: number` | Table cell |

## Multi-Cell Selection

The table plugin supports selecting multiple cells by click-and-drag. Selected cells are highlighted and can be operated on as a group.

Access the selection service programmatically:

```ts
import { TableSelectionServiceKey } from '@notectl/core';

const service = editor.getState().schema; // via plugin context
```

## Custom Node Views

Tables use custom `NodeView` implementations for:
- Table wrapper with scroll support
- Row rendering
- Cell rendering with editable content areas
