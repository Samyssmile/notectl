---
title: Plugin Overview
description: All built-in plugins available in notectl with their capabilities at a glance.
---

import { LinkCard, CardGrid } from '@astrojs/starlight/components';

notectl ships with **15 built-in plugins**. Every editor feature — from bold text to tables — is implemented as a plugin. You can use all of them, a subset, or build your own.

![Editor with full plugin set](../../../assets/screenshots/editor-formatted.png)

## Plugin List

| Plugin | ID | Description | Keyboard Shortcuts |
|--------|----|-------------|-------------------|
| [TextFormattingPlugin](/notectl/plugins/text-formatting/) | `text-formatting` | Bold, italic, underline | `Ctrl+B`, `Ctrl+I`, `Ctrl+U` |
| [HeadingPlugin](/notectl/plugins/heading/) | `heading` | Heading levels 1-6 | `Ctrl+Shift+1`-`6` |
| [ListPlugin](/notectl/plugins/list/) | `list` | Bullet, ordered, and checklist | `Tab`, `Shift+Tab` |
| [LinkPlugin](/notectl/plugins/link/) | `link` | Hyperlinks | `Ctrl+K` |
| [TablePlugin](/notectl/plugins/table/) | `table` | Tables with cell selection | `Tab`, `Enter` |
| [BlockquotePlugin](/notectl/plugins/blockquote/) | `blockquote` | Block quotes | `Ctrl+Shift+>` |
| [FontPlugin](/notectl/plugins/font/) | `font` | Custom font families | - |
| [FontSizePlugin](/notectl/plugins/font-size/) | `fontSize` | Font size control | `Ctrl+Shift++`/`-` |
| [TextColorPlugin](/notectl/plugins/text-color/) | `textColor` | Text color picker | - |
| [TextAlignmentPlugin](/notectl/plugins/text-alignment/) | `text-alignment` | Left, center, right, justify | `Ctrl+Shift+L`/`E`/`R`/`J` |
| [StrikethroughPlugin](/notectl/plugins/strikethrough/) | `strikethrough` | Strikethrough text | `Ctrl+Shift+X` |
| [SuperSubPlugin](/notectl/plugins/super-sub/) | `super-sub` | Superscript & subscript | `Ctrl+.`, `Ctrl+,` |
| [HighlightPlugin](/notectl/plugins/highlight/) | `highlight` | Text highlight (background color) | - |
| [HorizontalRulePlugin](/notectl/plugins/horizontal-rule/) | `horizontal-rule` | Horizontal divider lines | - |
| [ToolbarPlugin](/notectl/plugins/toolbar/) | `toolbar` | Toolbar UI (auto-created) | - |

## How Plugins Work

Each plugin implements the `Plugin` interface and registers its capabilities during `init()`:

```ts
interface Plugin {
  /** Unique identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Toolbar ordering (lower = further left). */
  readonly priority?: number;
  /** Required plugin IDs that must be loaded first. */
  readonly dependencies?: string[];

  /** Register schema, commands, keymaps, toolbar items. */
  init(context: PluginContext): void;
  /** Clean up when the editor is destroyed. */
  destroy?(): void;
  /** Called on every state change (for reactive updates). */
  onStateChange?(oldState: EditorState, newState: EditorState, tr: Transaction): void;
  /** Called once after all plugins are initialized. */
  onReady?(): void;
}
```

## What Plugins Can Register

Plugins register through the `PluginContext`:

| Method | What it does | Example |
|--------|-------------|---------|
| `registerNodeSpec()` | New block types | heading, list_item, table, blockquote |
| `registerMarkSpec()` | New inline marks | bold, italic, link, textColor |
| `registerCommand()` | Named commands | toggleBold, insertTable, alignCenter |
| `registerKeymap()` | Keyboard shortcuts | `Mod-B` for bold, `Mod-K` for link |
| `registerInputRule()` | Text pattern transforms | `# ` to heading, `---` to horizontal rule |
| `registerToolbarItem()` | Toolbar buttons/dropdowns | Bold button, heading dropdown, color picker |
| `registerMiddleware()` | Transaction interceptors | Preserve alignment on block type change |
| `registerService()` | Typed services | ToolbarService, TableSelectionService |

## Plugin Composition

Use plugins with the `toolbar` config for a visual toolbar:

```ts
const editor = await createEditor({
  toolbar: [
    [new TextFormattingPlugin()],           // Group 1: B I U
    [new HeadingPlugin()],                  // Group 2: Heading dropdown
    [new ListPlugin(), new BlockquotePlugin()], // Group 3: Lists + blockquote
    [new LinkPlugin(), new TablePlugin()],  // Group 4: Link + table
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

## Learn More

<CardGrid>
  <LinkCard title="Write Your Own Plugin" href="/notectl/guides/writing-plugins/" description="Full guide to building custom plugins." />
  <LinkCard title="Plugin Interface API" href="/notectl/api/plugin-interface/" description="Complete PluginContext API reference." />
</CardGrid>
