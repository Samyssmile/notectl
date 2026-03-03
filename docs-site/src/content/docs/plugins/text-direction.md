---
title: Text Direction Plugin
description: RTL language support with block-level text direction, inline bidi isolation, auto-detection, and keyboard shortcuts.
---

The `TextDirectionPlugin` adds full RTL (right-to-left) language support with block-level text direction control and inline bidi isolation for mixed-direction content.

## Usage

```ts
import { TextDirectionPlugin } from '@notectl/core/plugins/text-direction';

new TextDirectionPlugin()
// or customize directable block types:
new TextDirectionPlugin({ directableTypes: ['paragraph', 'heading'] })
```

## Configuration

```ts
interface TextDirectionConfig {
  /** Block types that support direction. Default: paragraph, heading, title, subtitle, table_cell, blockquote, list_item */
  readonly directableTypes: readonly string[];
  /** When true, a separator is rendered after the toolbar item. */
  readonly separatorAfter?: boolean;
  /** Custom locale for toolbar labels and announcements. */
  readonly locale?: TextDirectionLocale;
}
```

### Example: Restrict directable types

```ts
new TextDirectionPlugin({
  directableTypes: ['paragraph', 'heading', 'blockquote'],
})
```

## Block-Level Direction

The plugin patches existing NodeSpecs for directable block types to add a `dir` attribute. This controls the overall text direction of the entire block.

| Attribute | Type | Default | Renders As |
|-----------|------|---------|-----------|
| `dir` | `'ltr' \| 'rtl' \| 'auto'` | `'auto'` | `dir="rtl"` on the block element |

### Commands

| Command | Description | Returns |
|---------|-------------|---------|
| `setDirectionLTR` | Set block direction to left-to-right | `boolean` |
| `setDirectionRTL` | Set block direction to right-to-left | `boolean` |
| `setDirectionAuto` | Set block direction to automatic | `boolean` |
| `toggleDirection` | Cycle direction: auto → rtl → ltr → auto | `boolean` |

```ts
editor.executeCommand('setDirectionRTL');
editor.executeCommand('toggleDirection');
```

## Inline Bidi Isolation

For mixed-direction content within a single block (e.g., an English phrase inside Arabic text), the plugin registers a `bdi` mark that wraps selected text in a `<bdi>` element with an explicit `dir` attribute.

### Commands

| Command | Description | Returns |
|---------|-------------|---------|
| `toggleBidiLTR` | Apply inline LTR isolation to selection | `boolean` |
| `toggleBidiRTL` | Apply inline RTL isolation to selection | `boolean` |
| `toggleBidiAuto` | Apply inline auto isolation to selection | `boolean` |
| `removeBidi` | Remove inline direction isolation | `boolean` |
| `toggleBidiIsolation` | Toggle bidi: applies opposite of block direction, or removes if active | `boolean` |

```ts
editor.executeCommand('toggleBidiLTR');
editor.executeCommand('removeBidi');
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+D` / `Cmd+Shift+D` | Toggle block direction (cycles auto → rtl → ltr → auto) |
| `Ctrl+Shift+B` / `Cmd+Shift+B` | Toggle inline bidi isolation |

**Windows/Linux only:**

| Shortcut | Action |
|----------|--------|
| `Ctrl` + Left `Shift` key | Set direction to LTR |
| `Ctrl` + Right `Shift` key | Set direction to RTL |

## Toolbar

The plugin renders two toolbar dropdowns:

1. **Text Direction** (block group) — Dropdown with LTR, RTL, and Auto options. The icon updates to reflect the current block's direction.
2. **Inline Direction** (format group) — Dropdown with LTR, RTL, Auto, and Remove options for bidi isolation. Only enabled when text is selected.

## Smart Middleware

The plugin registers three transaction middleware handlers that work automatically:

### Preserve Direction

When other plugins change a block's type (e.g., paragraph → heading), the `dir` attribute is preserved so the user's direction choice survives block type transformations.

### Auto-Detect

When text is inserted or deleted in a block with `dir="auto"`, the plugin automatically detects the text direction based on the first strong directional character using Unicode script detection. Supports 20+ RTL scripts including Arabic, Hebrew, Syriac, Thaana, N'Ko, and more.

### Inherit Direction

When a new block is created (e.g., pressing Enter), the plugin inherits the `dir` attribute from the nearest sibling block. This provides a seamless writing experience in RTL documents.

## Mark Spec

| Type | HTML Tag | Attributes | Description |
|------|----------|------------|-------------|
| `bdi` | `<bdi>` | `dir` | Inline bidi isolation element |

## Accessibility

- Screen reader announcements for all direction changes via `context.announce()`
- Keyboard-accessible shortcuts with platform-aware mappings (Mac vs. Windows/Linux)
- ARIA-friendly toolbar dropdowns
- Uses semantic HTML `dir` attribute and `<bdi>` element for proper assistive technology support

## Internationalization

The plugin ships with translations for 9 languages:

| Language | Loader |
|----------|--------|
| English | Built-in (`TEXT_DIRECTION_LOCALE_EN`) |
| Arabic | `loadTextDirectionLocale('ar')` |
| German | `loadTextDirectionLocale('de')` |
| Spanish | `loadTextDirectionLocale('es')` |
| French | `loadTextDirectionLocale('fr')` |
| Hindi | `loadTextDirectionLocale('hi')` |
| Portuguese | `loadTextDirectionLocale('pt')` |
| Russian | `loadTextDirectionLocale('ru')` |
| Chinese | `loadTextDirectionLocale('zh')` |

Custom locales can be provided via the `locale` config option. See the [Internationalization](/notectl/guides/internationalization/) guide for details.
