---
title: Font Size Plugin
description: Font size control with dropdown, custom input, keyboard shortcuts, and smart default handling.
---

The `FontSizePlugin` provides a font size selector with preset sizes, custom input, and keyboard shortcuts for stepping through sizes.

![Font size selector](../../../assets/screenshots/editor-formatted.png)

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
  readonly sizes?: number[];
  /** Base font size (no mark applied). Default: 16 */
  readonly defaultSize?: number;
  /** Render separator after toolbar item. */
  readonly separatorAfter?: boolean;
}
```

### Default Preset Sizes

When `sizes` is not specified:

```
8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96
```

## Commands

| Command | Description | Returns |
|---------|-------------|---------|
| `removeFontSize` | Remove font size mark (reset to default) | `boolean` |
| `increaseFontSize` | Step up to next preset size | `boolean` |
| `decreaseFontSize` | Step down to previous preset size | `boolean` |

```ts
editor.executeCommand('increaseFontSize');
editor.executeCommand('decreaseFontSize');
editor.executeCommand('removeFontSize');
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift++` / `Cmd+Shift++` | Increase font size |
| `Ctrl+Shift+_` / `Cmd+Shift+_` | Decrease font size |

## Toolbar

The font size plugin renders as a **combobox** showing the current size. The dropdown includes:

1. A number input for custom sizes (1-400)
2. A scrollable list of preset sizes
3. Full keyboard navigation (arrow keys, Enter, Escape)

The currently active size is highlighted in the list. If the cursor is on text with no font size mark, the default size is shown.

## Mark Spec

| Mark | Attributes | Renders As |
|------|-----------|-----------|
| `fontSize` | `size: string` (e.g., `"24px"`) | `<span style="font-size: 24px">` |

## Default Size Behavior

When the user selects the `defaultSize`, the font size mark is **removed** rather than applied. This keeps the document clean — text at the default size has no unnecessary marks.

## Stepping Logic

The `increaseFontSize` and `decreaseFontSize` commands find the current font size at the cursor, locate it in the sorted preset list, and move to the next/previous entry. If the current size is not in the preset list, the commands snap to the nearest preset.
