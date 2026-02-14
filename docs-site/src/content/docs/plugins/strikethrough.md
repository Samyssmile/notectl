---
title: Strikethrough Plugin
description: Strikethrough text formatting with keyboard shortcut.
---

The `StrikethroughPlugin` adds ~~strikethrough~~ text support with a toggle command and keyboard shortcut.

![Text formatting with strikethrough](../../../assets/screenshots/plugin-text-formatting.png)

## Usage

```ts
import { StrikethroughPlugin } from '@notectl/core';

new StrikethroughPlugin()
```

## Configuration

```ts
interface StrikethroughConfig {
  /** Render separator after toolbar item. */
  readonly separatorAfter?: boolean;
}
```

## Commands

| Command | Description | Returns |
|---------|-------------|---------|
| `toggleStrikethrough` | Toggle strikethrough mark on selection | `boolean` |

```ts
editor.executeCommand('toggleStrikethrough');
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+X` / `Cmd+Shift+X` | Toggle strikethrough |

## Mark Spec

| Mark | HTML Tag | Rank |
|------|----------|------|
| `strikethrough` | `<s>` | 3 |

## Toolbar

The strikethrough button renders in the toolbar with an `isActive` check. When the cursor is inside strikethrough text, the button appears highlighted/pressed.
