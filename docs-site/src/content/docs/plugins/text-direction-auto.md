---
title: Text Direction Auto Plugin
description: Three transaction middlewares that auto-detect, inherit, and preserve block direction.
---

The `TextDirectionAutoPlugin` registers three transaction middlewares that keep block-level `dir` attributes in sync with content changes. It is a headless plugin — no toolbar, no commands, no keymaps — purely middleware.

It **requires** the [Text Direction](/notectl/plugins/text-direction/) plugin to be registered first. The framework enforces this via `dependencies` and will throw with a descriptive error if you register `TextDirectionAutoPlugin` without it.

## Usage

```ts
import { TextDirectionPlugin } from '@notectl/core/plugins/text-direction';
import { TextDirectionAutoPlugin } from '@notectl/core/plugins/text-direction-auto';

[
  new TextDirectionPlugin(),
  new TextDirectionAutoPlugin(),
]
```

## Configuration

Each middleware can be disabled individually:

```ts
interface TextDirectionAutoConfig {
  /** Auto-detect direction on insertText / deleteText. Default: true. */
  readonly autoDetect?: boolean;
  /** Inherit direction from siblings on insertNode. Default: true. */
  readonly inherit?: boolean;
  /** Preserve direction across setBlockType (e.g. paragraph → heading). Default: true. */
  readonly preserve?: boolean;
}
```

## The Three Middlewares

### Auto-Detect

When text is inserted or deleted in a block with `dir="auto"`, the plugin detects the dominant direction from the first strong directional character (using Unicode Script property escapes) and updates the block's `dir`. Supports 20+ RTL scripts including Arabic, Hebrew, Syriac, Thaana, N'Ko, Adlam, Hanifi Rohingya, and historic scripts.

```ts
// User types Arabic into an empty paragraph (dir="auto")
// → middleware detects RTL and sets dir="rtl" on the same transaction
```

### Inherit Direction

When a new block is inserted (e.g. via `Enter`, paste, or programmatic `insertNode`), the plugin first tries to detect direction from the inserted block's text content; failing that, it inherits the `dir` from the nearest sibling. This produces a seamless writing experience in RTL documents — pressing Enter in an RTL paragraph yields another RTL paragraph.

### Preserve Direction

When another plugin replaces a block's attributes via `setBlockType` (e.g. paragraph → heading via the heading dropdown), the existing `dir` would normally be lost because `setBlockType` overrides the entire `attrs` object. This middleware copies the previous `dir` (when it was non-`'auto'`) into the new attrs, so the user's direction choice survives the type change.

## Hard Dependency on `TextDirectionPlugin`

This plugin declares `dependencies = ['text-direction']`. The framework's plugin lifecycle:
- Refuses to start if `TextDirectionPlugin` is not registered, with the error `Plugin "text-direction-auto" depends on "text-direction", which is not registered.`
- Initializes `TextDirectionPlugin` first so its `TextDirectionService` (with `directableTypes`) is available when this plugin's `init()` runs.

The middlewares mutate the `dir` attribute that `TextDirectionPlugin` patches into NodeSpecs; without that patch, `setNodeAttr({ dir: ... })` would write an attribute the renderer ignores.

## Accessibility

- Direction changes propagate to the rendered `dir` attribute, which assistive technology respects natively
- No new UI surface — accessibility is inherited from `TextDirectionPlugin`'s toolbar / keymap

## Performance

The middlewares examine each step of every transaction. They short-circuit early for non-directable block types and never traverse the document beyond the affected block (and, for `inherit-dir`, immediate siblings).
