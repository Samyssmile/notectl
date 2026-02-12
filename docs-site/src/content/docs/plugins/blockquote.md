---
title: Blockquote Plugin
description: Block quote formatting with toolbar and input rule.
---

The `BlockquotePlugin` adds block quote support.

## Usage

```ts
import { BlockquotePlugin } from '@notectl/core';

new BlockquotePlugin()
```

## Configuration

```ts
interface BlockquoteConfig {
  separatorAfter?: boolean;
}
```

## Commands

| Command | Description |
|---------|-------------|
| `toggleBlockquote` | Toggle blockquote on/off |
| `setBlockquote` | Convert block to blockquote |

```ts
editor.executeCommand('toggleBlockquote');
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+>` / `Cmd+Shift+>` | Toggle blockquote |

## Input Rules

| Pattern | Result |
|---------|--------|
| `> ` | Convert to blockquote |

## Node Spec

| Type | HTML Tag |
|------|----------|
| `blockquote` | `<blockquote>` |
