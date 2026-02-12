---
title: Plugin Overview
description: All built-in plugins available in notectl.
---

notectl ships with 13 built-in plugins. Every editor feature — from bold text to tables — is implemented as a plugin. You can use all of them, a subset, or build your own.

## Plugin List

| Plugin | ID | Description |
|--------|----|-------------|
| [TextFormattingPlugin](/plugins/text-formatting/) | `text-formatting` | Bold, italic, underline |
| [HeadingPlugin](/plugins/heading/) | `heading` | Heading levels 1–6 |
| [ListPlugin](/plugins/list/) | `list` | Bullet, ordered, and checklist |
| [LinkPlugin](/plugins/link/) | `link` | Hyperlinks |
| [TablePlugin](/plugins/table/) | `table` | Tables with cell selection |
| [BlockquotePlugin](/plugins/blockquote/) | `blockquote` | Block quotes |
| [FontPlugin](/plugins/font/) | `font` | Custom font families |
| [FontSizePlugin](/plugins/font-size/) | `fontSize` | Font size control |
| [TextColorPlugin](/plugins/text-color/) | `textColor` | Text color picker |
| [TextAlignmentPlugin](/plugins/text-alignment/) | `text-alignment` | Left, center, right, justify |
| [StrikethroughPlugin](/plugins/strikethrough/) | `strikethrough` | Strikethrough text |
| [HorizontalRulePlugin](/plugins/horizontal-rule/) | `horizontal-rule` | Horizontal divider lines |
| [ToolbarPlugin](/plugins/toolbar/) | `toolbar` | Toolbar UI (auto-created) |

## How Plugins Work

Each plugin implements the `Plugin` interface and registers its capabilities during `init()`:

```ts
interface Plugin {
  id: string;           // Unique identifier
  name: string;         // Human-readable name
  priority?: number;    // Toolbar ordering (lower = first)
  dependencies?: string[]; // Required plugin IDs

  init(context: PluginContext): void;
  destroy?(): void;
  onStateChange?(oldState, newState, tr): void;
  onReady?(): void;
}
```

Plugins register through the `PluginContext`:

- **`registerNodeSpec()`** — New block types (heading, list_item, table, etc.)
- **`registerMarkSpec()`** — New inline marks (bold, font, textColor, etc.)
- **`registerCommand()`** — Named commands (toggleBold, insertTable, etc.)
- **`registerKeymap()`** — Keyboard shortcuts (Mod-B, Mod-K, etc.)
- **`registerInputRule()`** — Text patterns (# → heading, --- → horizontal rule)
- **`registerToolbarItem()`** — Toolbar buttons and dropdowns
- **`registerMiddleware()`** — Transaction interceptors
- **`registerService()`** — Typed services for inter-plugin communication

## Plugin Composition

Use plugins with the `toolbar` config for a visual toolbar:

```ts
const editor = await createEditor({
  toolbar: [
    [new TextFormattingPlugin()],
    [new HeadingPlugin()],
    [new ListPlugin()],
  ],
});
```

Or use `plugins` for headless mode (no toolbar):

```ts
const editor = await createEditor({
  plugins: [
    new TextFormattingPlugin(),
    new HeadingPlugin(),
  ],
});
```

## Auto-Registration

`TextFormattingPlugin` is auto-registered with default settings if not explicitly provided. All other plugins must be added manually.
