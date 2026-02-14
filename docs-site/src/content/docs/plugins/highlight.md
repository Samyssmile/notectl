---
title: Highlight Plugin
description: Text highlighting with background color picker and customizable 50-color palette.
---

The `HighlightPlugin` provides text highlighting (background color) with a color picker popup and a customizable palette optimized for highlighting use cases.

## Usage

```ts
import { HighlightPlugin } from '@notectl/core';

new HighlightPlugin()
// or with custom colors:
new HighlightPlugin({
  colors: ['#fff176', '#aed581', '#4dd0e1', '#64b5f6', '#ce93d8'],
})
```

## Configuration

```ts
interface HighlightConfig {
  /**
   * Restricts the color picker to a specific set of hex colors.
   * Each value must be a valid hex color code (#RGB or #RRGGBB).
   * Duplicates are removed automatically (case-insensitive).
   * When omitted, the full 50-color default palette is shown.
   */
  readonly colors?: readonly string[];
  /** Render separator after toolbar item. */
  readonly separatorAfter?: boolean;
}
```

Colors are validated on construction. Invalid hex values throw an `Error` with a descriptive message listing the offending values.

## Commands

| Command | Description | Returns |
|---------|-------------|---------|
| `removeHighlight` | Remove highlight mark from selection | `boolean` |

```ts
editor.executeCommand('removeHighlight');
```

Highlight color application is handled through the toolbar popup's click handlers — each color swatch applies the corresponding `highlight` mark.

## Toolbar

The highlight button opens a **custom color picker popup** with:
- A "None" button at the top to remove the highlight
- A grid of 50 color swatches (10 columns x 5 rows)
- The currently active highlight color is visually indicated

## Mark Spec

| Mark | Attributes | Rank | Renders As |
|------|-----------|------|-----------|
| `highlight` | `color: string` | 4 | `<span style="background-color: #fff176">` |

## Default Palette

When no custom `colors` are provided, the plugin uses a 50-color palette optimized for text highlighting, organized in a 10x5 grid:

- **Row 1:** Classic highlighter colors (bright yellow, green, cyan, blue, purple, pink, orange)
- **Row 2:** Light pastels (subtle backgrounds)
- **Row 3:** Medium pastels
- **Row 4:** Bold pastels (stronger emphasis)
- **Row 5:** Grays and neutral highlights (white, light grays, subtle tints)

## Custom Palette Example

```ts
// Study-mode highlighter colors
new HighlightPlugin({
  colors: [
    '#fff176', // Yellow — key definitions
    '#aed581', // Green — important facts
    '#4dd0e1', // Cyan — questions
    '#f48fb1', // Pink — action items
    '#ffab91', // Orange — examples
  ],
})
```

## Programmatic Highlight

The highlight color is applied via the internal `applyHighlight()` method. For collapsed selections, it sets stored marks so the next typed text gets the highlight. For range selections, it applies the mark across all blocks in the range, first removing any existing highlight before applying the new color.
