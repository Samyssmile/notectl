---
title: Text Color Plugin
description: Text color picker with a customizable color palette.
---

The `TextColorPlugin` provides a color picker popup for changing text color.

## Usage

```ts
import { TextColorPlugin } from '@notectl/core';

new TextColorPlugin()
// or with custom colors:
new TextColorPlugin({
  colors: ['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00'],
})
```

## Configuration

```ts
interface TextColorConfig {
  /** Custom color palette (hex values). Default: Google Docs 70-color palette */
  colors?: string[];
  separatorAfter?: boolean;
}
```

Colors must be valid hex values (`#RGB` or `#RRGGBB`). Invalid values are filtered out. Duplicates (case-insensitive) are removed.

## Commands

| Command | Description |
|---------|-------------|
| `removeTextColor` | Remove text color mark (reset to default) |

Color application is handled through the toolbar popup's click handlers.

## Toolbar

The text color button shows a color swatch preview. Clicking opens a grid picker with all available colors. The currently active color is highlighted.

## Mark Spec

| Mark | Attributes | Renders As |
|------|-----------|-----------|
| `textColor` | `color: string` | `<span style="color: #FF0000">` |

## Default Palette

When no custom `colors` are provided, the plugin uses a 70-color palette matching Google Docs, organized in a 10x7 grid from light to dark shades.
