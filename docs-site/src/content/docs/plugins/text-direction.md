---
title: Text Direction Plugin
description: Block-level text direction control with toolbar dropdown and platform-aware Ctrl+Shift shortcuts.
---

The `TextDirectionPlugin` adds block-level text direction (`dir` attribute) to paragraphs, headings, and other directable block types. It exposes commands and a toolbar dropdown for switching between LTR, RTL, and auto direction, registers a `Mod-Shift-D` keymap, and (on Windows/Linux) attaches a `Ctrl+Shift` direction handler.

For inline `<bdi>` isolation see [Bidi Isolation](/notectl/plugins/bidi-isolation/). For automatic direction detection / inheritance / preservation see [Text Direction Auto](/notectl/plugins/text-direction-auto/).

## Usage

```ts
import { TextDirectionPlugin } from '@notectl/core/plugins/text-direction';

new TextDirectionPlugin();
new TextDirectionPlugin({ directableTypes: ['paragraph', 'heading'] });
```

## Configuration

```ts
interface TextDirectionConfig {
  /** Block types that support direction. Default: paragraph, heading, title, subtitle, table_cell, blockquote, list_item */
  readonly directableTypes: readonly string[];
  /** Custom locale for toolbar labels and announcements. */
  readonly locale?: TextDirectionLocale;
}
```

### Example: restrict directable types

```ts
new TextDirectionPlugin({
  directableTypes: ['paragraph', 'heading', 'blockquote'],
});
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

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+D` / `Cmd+Shift+D` | Toggle block direction (cycles auto → rtl → ltr → auto) |

**Windows/Linux only:**

| Shortcut | Action |
|----------|--------|
| `Ctrl` + Left `Shift` key | Set direction to LTR |
| `Ctrl` + Right `Shift` key | Set direction to RTL |

### Toolbar

The plugin renders a **Text Direction** toolbar dropdown (block group) with LTR, RTL, and Auto options. The icon updates to reflect the current block's direction.

## Service: `TextDirectionService`

When this plugin loads it registers a `TextDirectionService` (via `TEXT_DIRECTION_SERVICE_KEY`) so other plugins can read the current direction without coupling to internals:

```ts
interface TextDirectionService {
  readonly directableTypes: ReadonlySet<string>;
  getBlockDir(block: BlockNode): TextDirection;
}
```

`TextDirectionAutoPlugin` requires this service. `BidiIsolationPlugin` consumes it optionally for the `toggleBidiIsolation` cycle UX.

## Accessibility

- Screen reader announcements for all direction changes via `context.announce()`
- Keyboard-accessible shortcuts with platform-aware mappings (Mac vs. Windows/Linux)
- ARIA-friendly toolbar dropdowns
- Uses the semantic HTML `dir` attribute for proper assistive technology support

## Internationalization

Ships with translations for 9 languages:

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
