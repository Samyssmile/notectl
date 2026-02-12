---
title: Strikethrough Plugin
description: Strikethrough text formatting.
---

The `StrikethroughPlugin` adds ~~strikethrough~~ text support.

## Usage

```ts
import { StrikethroughPlugin } from '@notectl/core';

new StrikethroughPlugin()
```

## Configuration

```ts
interface StrikethroughConfig {
  separatorAfter?: boolean;
}
```

## Commands

| Command | Description |
|---------|-------------|
| `toggleStrikethrough` | Toggle strikethrough mark |

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
