---
title: Font Size Plugin
description: Font size control with dropdown, custom input, and keyboard shortcuts.
---

The `FontSizePlugin` provides a font size selector with preset sizes, custom input, and keyboard shortcuts for stepping through sizes.

## Usage

```ts
import { FontSizePlugin } from '@notectl/core';

new FontSizePlugin()
// or with custom config:
new FontSizePlugin({
  sizes: [12, 14, 16, 20, 24, 32, 48],
  defaultSize: 16,
})
```

## Configuration

```ts
interface FontSizeConfig {
  /** Preset sizes shown in the dropdown. Sorted and deduplicated automatically. */
  sizes?: number[];
  /** Base font size (no mark applied). Default: 16 */
  defaultSize?: number;
  separatorAfter?: boolean;
}
```

### Default Preset Sizes

When `sizes` is not specified:

```
8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96
```

## Commands

| Command | Description |
|---------|-------------|
| `removeFontSize` | Remove font size mark (reset to default) |
| `increaseFontSize` | Step up to next preset size |
| `decreaseFontSize` | Step down to previous preset size |

```ts
editor.executeCommand('increaseFontSize');
editor.executeCommand('decreaseFontSize');
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift++` / `Cmd+Shift++` | Increase font size |
| `Ctrl+Shift+_` / `Cmd+Shift+_` | Decrease font size |

## Toolbar

The font size plugin renders as a combobox showing the current size. The dropdown includes:

1. A number input for custom sizes (1–400)
2. A scrollable list of preset sizes
3. Keyboard navigation (arrow keys, Enter, Escape)

## Mark Spec

| Mark | Attributes | Renders As |
|------|-----------|-----------|
| `fontSize` | `size: string` (e.g. `"24px"`) | `<span style="font-size: 24px">` |

## Default Size Behavior

When the user selects the `defaultSize`, the font size mark is **removed** rather than applied. This keeps the document clean — text at the default size has no unnecessary marks.
