---
title: Blockquote Plugin
description: Block quote formatting with toolbar button, keyboard shortcut, and Markdown input rule.
---

The `BlockquotePlugin` adds block quote support with a toggle command, keyboard shortcut, and Markdown-style input rule.

![Blockquote in the editor](../../../assets/screenshots/plugin-blockquote.png)

## Usage

```ts
import { BlockquotePlugin } from '@notectl/core/plugins/blockquote';

new BlockquotePlugin()
```

## Configuration

```ts
interface BlockquoteConfig {
  /** Custom locale strings. */
  readonly locale?: BlockquoteLocale;
}
```

## Commands

| Command | Description | Returns |
|---------|-------------|---------|
| `toggleBlockquote` | Toggle blockquote on/off for the current block | `boolean` |
| `setBlockquote` | Convert the current block to blockquote | `boolean` |

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
| `> ` (at the start of a line) | Convert to blockquote |

## Keyboard Behavior

| Key | Action |
|-----|--------|
| `Enter` (empty blockquote) | Convert blockquote to paragraph |
| `Backspace` (at position 0) | Convert blockquote to paragraph |
| `ArrowDown` (at end of text) | Move cursor to next block, or insert a paragraph if last block |
| `ArrowUp` (at position 0) | Move cursor to previous block |

## Node Spec

| Type | HTML Tag | Description |
|------|----------|-------------|
| `blockquote` | `<blockquote>` | Block-level quote container |

The `toDOM` method creates a `<blockquote>` element with the required `data-block-id` attribute. The editor's default styles render a left border and padding for visual distinction.
