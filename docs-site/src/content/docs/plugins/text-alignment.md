---
title: Text Alignment Plugin
description: Left, center, right, and justify text alignment.
---

The `TextAlignmentPlugin` adds text alignment support for paragraphs and headings.

## Usage

```ts
import { TextAlignmentPlugin } from '@notectl/core';

new TextAlignmentPlugin()
// or restrict alignments:
new TextAlignmentPlugin({ alignments: ['left', 'center', 'right'] })
```

## Configuration

```ts
interface TextAlignmentConfig {
  /** Enabled alignment options. Default: ['left', 'center', 'right', 'justify'] */
  alignments: TextAlignment[];
  /** Block types that support alignment. Default: ['paragraph', 'heading', 'title', 'subtitle'] */
  alignableTypes: string[];
  separatorAfter?: boolean;
}

type TextAlignment = 'left' | 'center' | 'right' | 'justify';
```

## Commands

| Command | Description |
|---------|-------------|
| `alignLeft` | Align text left |
| `alignCenter` | Center text |
| `alignRight` | Align text right |
| `alignJustify` | Justify text |

```ts
editor.executeCommand('alignCenter');
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+L` / `Cmd+Shift+L` | Align left |
| `Ctrl+Shift+E` / `Cmd+Shift+E` | Align center |
| `Ctrl+Shift+R` / `Cmd+Shift+R` | Align right |
| `Ctrl+Shift+J` / `Cmd+Shift+J` | Justify |

## Toolbar

The alignment plugin renders as a dropdown button with alignment icons. The currently active alignment is highlighted.

## Middleware

The plugin registers transaction middleware that preserves the `textAlign` attribute when a block's type changes (e.g., paragraph to heading). This ensures alignment survives block type transformations.

## Node Attribute

The plugin patches existing node specs to add a `textAlign` attribute:

| Attribute | Type | Default | Renders As |
|-----------|------|---------|-----------|
| `textAlign` | `string` | `'left'` | `style="text-align: center"` |
