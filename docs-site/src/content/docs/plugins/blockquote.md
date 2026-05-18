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

The `toDOM` method creates a `<blockquote>` element with the required `data-block-id` attribute and `part="blockquote"` for shadow-part targeting. The editor's default styles render a left border and padding for visual distinction.

## Theming

The blockquote participates in the [three-tier theming cascade](/notectl/guides/styling/#theming-contract-three-tier-cascade). Setting the global `--notectl-border` still recolors the left bar alongside other borders; the component-scoped tokens override only the blockquote:

```css
notectl-editor {
  --notectl-blockquote-border: #6366f1;
  --notectl-blockquote-bg: #f5f3ff;
  --notectl-blockquote-fg: #4338ca;
}
```

| Token | Default fallback |
|---|---|
| `--notectl-blockquote-border` | `var(--notectl-border)` |
| `--notectl-blockquote-bg` | `transparent` |
| `--notectl-blockquote-fg` | `inherit` |

Alternatively, use [`::part(blockquote)`](/notectl/guides/styling/#shadow-parts) for structural styling beyond what tokens cover:

```css
notectl-editor::part(blockquote) {
  font-style: italic;
  border-radius: 4px;
}
```
