---
title: Text Formatting Plugin
description: Bold, italic, and underline inline formatting.
---

The `TextFormattingPlugin` provides inline text formatting marks: **bold**, *italic*, and <u>underline</u>.

## Usage

```ts
import { TextFormattingPlugin } from '@notectl/core';

new TextFormattingPlugin({
  bold: true,
  italic: true,
  underline: true,
})
```

This plugin is **auto-registered** if you don't explicitly add it. To customize which marks are enabled, add it explicitly.

## Configuration

```ts
interface TextFormattingConfig {
  bold: boolean;       // Default: true
  italic: boolean;     // Default: true
  underline: boolean;  // Default: true
  toolbar?: {
    bold?: boolean;      // Show bold button (default: true)
    italic?: boolean;    // Show italic button (default: true)
    underline?: boolean; // Show underline button (default: true)
  };
  separatorAfter?: boolean;
}
```

### Disable a mark

```ts
new TextFormattingPlugin({
  bold: true,
  italic: true,
  underline: false, // Underline mark won't be registered in schema
})
```

### Hide toolbar buttons

Keep the mark functional but hide the toolbar button:

```ts
new TextFormattingPlugin({
  bold: true,
  italic: true,
  underline: true,
  toolbar: {
    underline: false, // Hide button, but Ctrl+U still works
  },
})
```

## Commands

| Command | Description |
|---------|-------------|
| `toggleBold` | Toggle bold mark on selection |
| `toggleItalic` | Toggle italic mark on selection |
| `toggleUnderline` | Toggle underline mark on selection |

```ts
editor.executeCommand('toggleBold');
editor.commands.toggleBold(); // Convenience shortcut
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+B` / `Cmd+B` | Toggle bold |
| `Ctrl+I` / `Cmd+I` | Toggle italic |
| `Ctrl+U` / `Cmd+U` | Toggle underline |

## Mark Specs

| Mark | HTML Tag | Rank |
|------|----------|------|
| `bold` | `<strong>` | 0 |
| `italic` | `<em>` | 1 |
| `underline` | `<u>` | 2 |
