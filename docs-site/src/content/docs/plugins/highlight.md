---
title: Highlight Plugin
description: Text highlighting with background color picker and customizable 50-color palette.
---

The `HighlightPlugin` provides text highlighting (background color) with a color picker popup and a customizable palette optimized for highlighting use cases.

## Usage

```ts
import { HighlightPlugin } from '@notectl/core/plugins/highlight';

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
  /** Your own CSS class per highlight color in class-based HTML. See "Custom CSS Classes". */
  readonly styleClasses?: Readonly<Record<string, string>>;
  /** Custom locale strings. */
  readonly locale?: HighlightLocale;
}
```

Colors are validated on construction. Invalid hex values throw an `Error` with a descriptive message listing the offending values.

## Custom CSS Classes

Available from notectl 2.4.0.

[Class-based HTML export](/notectl/guides/content-security-policy/#class-based-html-export-zero-inline-styles)
writes highlights as generated `notectl-s-*` classes. Map the highlight colors your stylesheet knows
to its classes with `styleClasses`, keyed by hex color:

```ts
new HighlightPlugin({
  colors: ['#fff3bf', '#d3f9d8'],
  styleClasses: { '#fff3bf': 'mark-yellow', '#d3f9d8': 'mark-green' },
});
// Exported: <span class="mark-yellow">…</span>
```

Import and paste read the classes back without a `styleMap`; inline export keeps writing
`style="background-color: …"`. See [Custom CSS Classes](/notectl/guides/custom-css-classes/) for the rules shared by all formatting plugins.

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
- The currently active highlight color is visually indicated and marked as selected for screen readers

This includes highlights from imported or pasted HTML. Browsers read `#fff3bf` back as `rgb(255, 243, 191)`, so notectl stores an imported highlight that matches a palette color or a `styleClasses` key in your spelling, and the picker selects it.

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

The highlight color is applied via the shared `applyColorMark()` function internally. For collapsed selections, it sets stored marks so the next typed text gets the highlight. For range selections, it applies the mark across all blocks in the range, first removing any existing highlight before applying the new color.
