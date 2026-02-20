---
title: Hard Break Plugin
description: Line break support within blocks using Shift+Enter.
---

The `HardBreakPlugin` adds line break support within blocks. Press `Shift+Enter` to insert a `<br>` element without creating a new block.

## Usage

```ts
import { HardBreakPlugin } from '@notectl/core';

new HardBreakPlugin()
```

No configuration is needed.

## Commands

| Command | Description | Returns |
|---------|-------------|---------|
| `insertHardBreak` | Insert a line break at the cursor | `boolean` |

```ts
editor.executeCommand('insertHardBreak');
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Shift+Enter` | Insert a hard break |

## Inline Node Spec

The hard break is an **InlineNode** — an atomic, width-1 element in the document model:

| Type | DOM Element | Description |
|------|-------------|-------------|
| `hard_break` | `<br>` | Line break within a block |

Unlike regular block splits (Enter), a hard break keeps content within the same block. This is useful for multi-line content inside headings, list items, or table cells.

## How It Works

The `HardBreakPlugin` uses the InlineNode system. InlineNodes are atomic elements that occupy exactly one position in offset space. They are rendered with `contenteditable="false"` and behave as indivisible units for selection and deletion.
