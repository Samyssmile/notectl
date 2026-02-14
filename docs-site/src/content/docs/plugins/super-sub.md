---
title: Superscript & Subscript Plugin
description: Superscript and subscript text with mutual exclusivity and keyboard shortcuts.
---

The `SuperSubPlugin` adds superscript and subscript text support with toggle commands, keyboard shortcuts, and automatic mutual exclusivity enforcement via middleware.

## Usage

```ts
import { SuperSubPlugin } from '@notectl/core';

new SuperSubPlugin()
// or enable only one:
new SuperSubPlugin({ superscript: true, subscript: false })
```

## Configuration

```ts
interface SuperSubConfig {
  /** Enable superscript mark. Default: true */
  readonly superscript: boolean;
  /** Enable subscript mark. Default: true */
  readonly subscript: boolean;
  /** Control toolbar button visibility per mark. */
  readonly toolbar?: SuperSubToolbarConfig;
  /** Render separator after the last visible toolbar item. */
  readonly separatorAfter?: boolean;
}

interface SuperSubToolbarConfig {
  /** Show superscript button. Default: true */
  readonly superscript?: boolean;
  /** Show subscript button. Default: true */
  readonly subscript?: boolean;
}
```

### Example: Only superscript

```ts
new SuperSubPlugin({ superscript: true, subscript: false })
```

### Example: Both marks, but hide subscript button

```ts
new SuperSubPlugin({
  superscript: true,
  subscript: true,
  toolbar: { subscript: false }, // Mod-, still works
})
```

## Commands

| Command | Description | Returns |
|---------|-------------|---------|
| `toggleSuperscript` | Toggle superscript mark on selection | `boolean` |
| `toggleSubscript` | Toggle subscript mark on selection | `boolean` |

```ts
editor.executeCommand('toggleSuperscript');
editor.executeCommand('toggleSubscript');
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+.` / `Cmd+.` | Toggle superscript |
| `Ctrl+,` / `Cmd+,` | Toggle subscript |

## Mark Specs

| Mark | HTML Tag | Rank | Priority |
|------|----------|------|----------|
| `superscript` | `<sup>` | 4 | 50 |
| `subscript` | `<sub>` | 4 | 51 |

## Mutual Exclusivity

When both marks are enabled, the plugin registers **transaction middleware** that enforces mutual exclusivity:

- Applying **superscript** automatically removes any **subscript** mark in the same range
- Applying **subscript** automatically removes any **superscript** mark in the same range
- For stored marks (collapsed selection), the most recently added mark wins

This middleware is only registered when both `superscript` and `subscript` are enabled.

## Toolbar Items

Each mark registers a toolbar item in the `format` group with:
- An SVG icon (X with S notation)
- A tooltip showing the shortcut (e.g., "Superscript (Ctrl+.)")
- An `isActive` check that highlights the button when the mark is active

Follows the same disabled-button pattern as `TextFormattingPlugin`: when a mark feature is disabled but the toolbar config explicitly enables the button, a greyed-out button renders.
