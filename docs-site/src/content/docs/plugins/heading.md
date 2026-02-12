---
title: Heading Plugin
description: Heading levels 1–6 with dropdown selector and input rules.
---

The `HeadingPlugin` adds heading support (H1–H6) with a toolbar dropdown selector, keyboard shortcuts, and Markdown-style input rules.

## Usage

```ts
import { HeadingPlugin } from '@notectl/core';

new HeadingPlugin()
// or with custom config:
new HeadingPlugin({ levels: [1, 2, 3] })
```

## Configuration

```ts
interface HeadingConfig {
  /** Which heading levels to enable. Default: [1, 2, 3, 4, 5, 6] */
  levels: HeadingLevel[];
  separatorAfter?: boolean;
}

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
```

### Example: Only H1–H3

```ts
new HeadingPlugin({ levels: [1, 2, 3] })
```

## Commands

| Command | Description |
|---------|-------------|
| `setHeading1` | Toggle heading level 1 |
| `setHeading2` | Toggle heading level 2 |
| `setHeading3` | Toggle heading level 3 |
| `setHeading4` | Toggle heading level 4 |
| `setHeading5` | Toggle heading level 5 |
| `setHeading6` | Toggle heading level 6 |
| `setParagraph` | Convert back to paragraph |
| `toggleHeading` | Toggle H1 |

```ts
editor.executeCommand('setHeading2');
editor.executeCommand('setParagraph');
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+1` / `Cmd+Shift+1` | Heading 1 |
| `Ctrl+Shift+2` / `Cmd+Shift+2` | Heading 2 |
| `Ctrl+Shift+3` / `Cmd+Shift+3` | Heading 3 |
| `Ctrl+Shift+4` / `Cmd+Shift+4` | Heading 4 |
| `Ctrl+Shift+5` / `Cmd+Shift+5` | Heading 5 |
| `Ctrl+Shift+6` / `Cmd+Shift+6` | Heading 6 |

## Input Rules

Type at the beginning of a line:

| Pattern | Result |
|---------|--------|
| `# ` | Heading 1 |
| `## ` | Heading 2 |
| `### ` | Heading 3 |
| `#### ` | Heading 4 |
| `##### ` | Heading 5 |
| `###### ` | Heading 6 |

## Toolbar

The heading plugin renders as a dropdown selector showing "Paragraph", "Heading 1", "Heading 2", etc. The current block type is reflected in the dropdown label.

## Node Spec

| Type | HTML Tag | Attributes |
|------|----------|-----------|
| `heading` | `<h1>` – `<h6>` | `level: number` |
