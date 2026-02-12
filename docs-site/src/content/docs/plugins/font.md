---
title: Font Plugin
description: Custom font family support with automatic @font-face injection.
---

The `FontPlugin` provides a font family selector with automatic `@font-face` CSS injection for custom fonts (WOFF2, TTF, OTF).

For a complete guide on using custom fonts, see [Custom Fonts](/guides/custom-fonts/).

## Usage

```ts
import { FontPlugin, STARTER_FONTS } from '@notectl/core';

new FontPlugin({
  fonts: [...STARTER_FONTS],
})
```

## Configuration

```ts
interface FontConfig {
  /** Fonts available in the editor. */
  fonts: FontDefinition[];
  /** Name of the default font. Selecting it removes the mark. */
  defaultFont?: string;
  separatorAfter?: boolean;
}

interface FontDefinition {
  /** Display name in toolbar dropdown. */
  name: string;
  /** CSS font-family value. */
  family: string;
  /** Category for grouping. */
  category?: 'serif' | 'sans-serif' | 'monospace' | 'display' | 'handwriting';
  /** @font-face descriptors for auto-injection. */
  fontFaces?: FontFaceDescriptor[];
}

interface FontFaceDescriptor {
  /** CSS src value. */
  src: string;
  /** Weight, e.g. '400' or '100 900'. */
  weight?: string;
  /** Style, e.g. 'normal' or 'italic'. */
  style?: string;
  /** Display strategy. Default: 'swap'. */
  display?: string;
}
```

## Starter Fonts

Built-in fonts with embedded WOFF2 data:

```ts
import { STARTER_FONTS, FIRA_CODE, FIRA_SANS } from '@notectl/core';
```

| Constant | Font | Category |
|----------|------|----------|
| `FIRA_SANS` | Fira Sans | sans-serif |
| `FIRA_CODE` | Fira Code | monospace |
| `STARTER_FONTS` | Both of the above | — |

## Commands

| Command | Description |
|---------|-------------|
| `removeFont` | Remove font mark from selection |

Font application is handled through the plugin's internal `applyFont()` method, triggered by the toolbar popup.

## Toolbar

The font plugin renders as a combobox-style selector. The label updates to show the active font name. Clicking opens a font picker popup where each font is previewed in its own typeface.

## Mark Spec

| Mark | Attributes | Renders As |
|------|-----------|-----------|
| `font` | `family: string` | `<span style="font-family: ...">` |

## Custom Font Example

```ts
import type { FontDefinition } from '@notectl/core';

const INTER: FontDefinition = {
  name: 'Inter',
  family: "'Inter', sans-serif",
  category: 'sans-serif',
  fontFaces: [
    {
      src: "url('/fonts/Inter-Variable.woff2') format('woff2')",
      weight: '100 900',
      style: 'normal',
    },
  ],
};

new FontPlugin({
  fonts: [...STARTER_FONTS, INTER],
  defaultFont: 'Fira Sans',
})
```
