---
title: Plugin Presets
description: Get a fully configured editor in one line with createMinimalPreset() or createFullPreset().
---

Plugin presets are factory functions that return pre-configured plugin bundles. Instead of manually instantiating 15+ plugins, you get a production-ready editor in one line.

## Full Preset

`createFullPreset()` returns all standard plugins organized into 8 logical toolbar groups:

```ts
import { createEditor, ThemePreset } from '@notectl/core';
import { createFullPreset } from '@notectl/core/presets';

const editor = await createEditor({
  ...createFullPreset(),
  theme: ThemePreset.Light,
  placeholder: 'Start typing...',
});
document.getElementById('app').appendChild(editor);
```

This gives you the same setup as manually configuring:

| Group | Plugins | Purpose |
|-------|---------|---------|
| 1 | Font, FontSize | Typography |
| 2 | TextFormatting, Strikethrough, InlineCode, SuperSub, BidiIsolation | Inline marks |
| 3 | TextColor, Highlight | Colors |
| 4 | Heading, Blockquote, CodeBlock | Block types |
| 5 | Alignment, TextDirection | Paragraph layout & direction |
| 6 | List | Bullet, ordered, checklist |
| 7 | Link, Table, HorizontalRule, Image | Insert objects |
| 8 | Print | Utility |

`HardBreakPlugin`, `SmartPastePlugin`, and `TextDirectionAutoPlugin` are included in the non-toolbar `plugins` array (they need no toolbar button).

## Minimal Preset

`createMinimalPreset()` returns a lightweight editor with only font selection:

```ts
import { createEditor } from '@notectl/core';
import { createMinimalPreset } from '@notectl/core/presets';

const editor = await createEditor({
  ...createMinimalPreset(),
  placeholder: 'Start typing...',
});
```

The editor still has bold/italic/underline (via auto-registered `TextFormattingPlugin`) and keyboard navigation (auto-registered `CaretNavigationPlugin` and `GapCursorPlugin`).

## Configuration Overrides

Both presets accept an optional options object to override individual plugin configs:

```ts
const editor = await createEditor({
  ...createFullPreset({
    list: { interactiveCheckboxes: true },
    heading: { levels: [1, 2, 3] },
    fontSize: { sizes: [12, 14, 16, 20, 24, 32], defaultSize: 14 },
  }),
  theme: ThemePreset.Dark,
});
```

### Available override keys

| Key | Plugin | Example |
|-----|--------|---------|
| `font` | FontPlugin | `{ fonts: [...STARTER_FONTS, myFont] }` |
| `fontSize` | FontSizePlugin | `{ sizes: [12, 16, 24], defaultSize: 16 }` |
| `textFormatting` | TextFormattingPlugin | `{ bold: true, italic: true, underline: false }` |
| `strikethrough` | StrikethroughPlugin | `{}` |
| `superSub` | SuperSubPlugin | `{ superscript: true, subscript: false }` |
| `textColor` | TextColorPlugin | `{ colors: ['#000', '#f00', '#0f0'] }` |
| `highlight` | HighlightPlugin | `{ colors: ['#ff0', '#0ff'] }` |
| `heading` | HeadingPlugin | `{ levels: [1, 2, 3] }` |
| `blockquote` | BlockquotePlugin | `{}` |
| `codeBlock` | CodeBlockPlugin | `{ highlighter: myHighlighter }` |
| `alignment` | AlignmentPlugin | `{ alignments: ['start', 'center', 'end'] }` |
| `textDirection` | TextDirectionPlugin | `{ directableTypes: ['paragraph', 'heading'] }` |
| `bidiIsolation` | BidiIsolationPlugin | `{}` |
| `textDirectionAuto` | TextDirectionAutoPlugin | `{ autoDetect: true, inherit: true, preserve: true }` |
| `list` | ListPlugin | `{ interactiveCheckboxes: true }` |
| `link` | LinkPlugin | `{ openInNewTab: true }` |
| `table` | TablePlugin | `{ maxPickerRows: 10 }` |
| `horizontalRule` | HorizontalRulePlugin | `{}` |
| `image` | ImagePlugin | `{ maxWidth: 600, resizable: true }` |
| `print` | PrintPlugin | `{ keyBinding: 'Mod-Shift-P' }` |
| `smartPaste` | SmartPastePlugin | `{}` |

## Composability

Presets return a `PresetConfig` object with `toolbar` and `plugins` arrays. You can extend them:

```ts
import { createFullPreset } from '@notectl/core/presets';
import { MyCustomPlugin } from './MyCustomPlugin';

const preset = createFullPreset();

const editor = await createEditor({
  toolbar: [...preset.toolbar, [new MyCustomPlugin()]],
  plugins: [...preset.plugins, myAnalyticsPlugin],
  placeholder: 'Start typing...',
});
```

## Preset vs Manual

Use presets when you want a standard editor quickly. Use manual toolbar configuration when you need full control over which plugins appear, their ordering, or group composition.

| | Preset | Manual |
|---|--------|--------|
| Lines of code | 1-3 | 15-30 |
| Plugin selection | All or override | Pick exactly what you need |
| Toolbar group order | Fixed | Custom |
| Best for | Quick setup, prototyping, standard editors | Custom layouts, subset of plugins |
