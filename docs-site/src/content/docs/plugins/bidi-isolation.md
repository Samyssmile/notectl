---
title: Bidi Isolation Plugin
description: Inline bidi isolation via the <bdi> mark for mixed-direction text.
---

The `BidiIsolationPlugin` registers a `bdi` mark for inline bidi isolation — wrapping selected text in a `<bdi>` element with an explicit `dir` attribute. Use it when a single block contains text in mixed directions (e.g., an English phrase inside an Arabic paragraph).

It is independent of the [Text Direction](/notectl/plugins/text-direction/) plugin, but consumes the optional `TextDirectionService` for a smarter `toggleBidiIsolation` cycle: when the surrounding block is RTL, the toggled isolation defaults to LTR, and vice versa. Without `TextDirectionPlugin` registered, `toggleBidiIsolation` always applies `rtl` as the starting direction.

## Usage

```ts
import { BidiIsolationPlugin } from '@notectl/core/plugins/bidi-isolation';

new BidiIsolationPlugin();
```

## Configuration

```ts
interface BidiIsolationConfig {
  /** Custom locale for toolbar labels and announcements. */
  readonly locale?: BidiIsolationLocale;
}
```

## Mark Spec

| Type | HTML Tag | Attributes | Description |
|------|----------|------------|-------------|
| `bdi` | `<bdi>` | `dir="ltr" \| "rtl" \| "auto"` | Inline bidi isolation element |

## Commands

| Command | Description | Returns |
|---------|-------------|---------|
| `toggleBidiLTR` | Apply inline LTR isolation to selection | `boolean` |
| `toggleBidiRTL` | Apply inline RTL isolation to selection | `boolean` |
| `toggleBidiAuto` | Apply inline auto isolation to selection | `boolean` |
| `removeBidi` | Remove inline direction isolation | `boolean` |
| `toggleBidiIsolation` | Toggle bidi: applies opposite of block direction (or `'rtl'` as fallback), or removes if already active | `boolean` |

```ts
editor.executeCommand('toggleBidiLTR');
editor.executeCommand('removeBidi');
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+B` / `Cmd+Shift+B` | Toggle inline bidi isolation |

## Toolbar

Renders an **Inline Direction** toolbar dropdown (format group) with LTR, RTL, Auto, and Remove options. Only enabled when text is selected.

## Optional Service Consumer

When [`TextDirectionPlugin`](/notectl/plugins/text-direction/) is also registered, the `toggleBidiIsolation` command picks the opposite of the surrounding block's direction so the isolated word visually stands out. Without it, the toggle defaults to `'rtl'`.

## Accessibility

- Uses the semantic HTML `<bdi>` element for proper bidi isolation in assistive technology
- Screen reader announcements for all bidi changes via `context.announce()`
- Keyboard accessible via `Mod-Shift-B`
- Toolbar items keyboard navigable

## Internationalization

Ships with translations for 9 languages (`ar`, `de`, `en`, `es`, `fr`, `hi`, `pt`, `ru`, `zh`). Custom locales can be provided via the `locale` config option.
