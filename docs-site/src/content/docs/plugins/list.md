---
title: List Plugin
description: Bullet lists, ordered lists, and checklists with nesting support.
---

The `ListPlugin` provides bullet lists, ordered (numbered) lists, and checklists with indent/outdent support.

## Usage

```ts
import { ListPlugin } from '@notectl/core';

new ListPlugin()
// or with custom config:
new ListPlugin({ types: ['bullet', 'ordered'], maxIndent: 3 })
```

## Configuration

```ts
interface ListConfig {
  /** Which list types to enable. Default: ['bullet', 'ordered', 'checklist'] */
  types: ListType[];
  /** Maximum nesting level. Default: 4 */
  maxIndent: number;
  separatorAfter?: boolean;
}

type ListType = 'bullet' | 'ordered' | 'checklist';
```

## Commands

| Command | Description |
|---------|-------------|
| `toggleList:bullet` | Toggle bullet list |
| `toggleList:ordered` | Toggle ordered list |
| `toggleList:checklist` | Toggle checklist |
| `indentListItem` | Increase indent level |
| `outdentListItem` | Decrease indent level |
| `toggleChecklistItem` | Toggle checklist item checked state |

```ts
editor.executeCommand('toggleList:bullet');
editor.executeCommand('indentListItem');
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Split list item (exit list if empty) |
| `Backspace` | Convert to paragraph at start of item |
| `Tab` | Indent list item |
| `Shift+Tab` | Outdent list item |

## Input Rules

Type at the beginning of a line:

| Pattern | Result |
|---------|--------|
| `- ` or `* ` | Bullet list |
| `1. ` (any number) | Ordered list |
| `[ ] ` | Unchecked checklist item |
| `[x] ` | Checked checklist item |

## Toolbar

Three toolbar buttons: bullet list, ordered list, and checklist. Each toggles its respective list type. Active state is shown when the cursor is inside that list type.

## Node Spec

| Type | Attributes |
|------|-----------|
| `list_item` | `listType: 'bullet' \| 'ordered' \| 'checklist'`, `indent: number`, `checked: boolean` |
