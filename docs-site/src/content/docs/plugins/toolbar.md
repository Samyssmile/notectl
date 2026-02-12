---
title: Toolbar Plugin
description: The toolbar UI renderer — automatically created when using the toolbar config.
---

The `ToolbarPlugin` renders the editor toolbar UI. It is **automatically created** when you use the `toolbar` configuration option — you don't need to instantiate it manually.

## Automatic Setup

```ts
const editor = await createEditor({
  toolbar: [
    [new TextFormattingPlugin()],
    [new HeadingPlugin()],
  ],
});
// ToolbarPlugin is automatically created and registered
```

## Manual Setup

For advanced use cases, you can create the ToolbarPlugin manually:

```ts
import { ToolbarPlugin } from '@notectl/core';

const toolbar = new ToolbarPlugin({
  groups: [['text-formatting'], ['heading']],
});

const editor = await createEditor({
  plugins: [
    new TextFormattingPlugin(),
    new HeadingPlugin(),
    toolbar,
  ],
});
```

## Layout Configuration

```ts
interface ToolbarLayoutConfig {
  /** Plugin ID groups — each inner array is a visual toolbar group */
  groups: string[][];
}
```

## Toolbar Items

Plugins register toolbar items via `context.registerToolbarItem()`:

```ts
interface ToolbarItem {
  id: string;
  group: string;
  icon: string;                    // HTML string
  label: string;                   // Accessible label
  tooltip?: string;
  command: string;                 // Command to execute
  priority: number;                // Order within group
  separatorAfter?: boolean;
  popupType?: 'dropdown' | 'gridPicker' | 'custom';
  popupConfig?: GridPickerConfig | DropdownConfig;
  renderPopup?: (container, context) => void;
  isActive?: (state) => boolean;
  isEnabled?: (state) => boolean;
  isDisabled?: (state) => boolean;
}
```

## Popup Types

- **`dropdown`** — A list of options (used by HeadingPlugin)
- **`gridPicker`** — A 2D grid (used by TablePlugin for row/column selection)
- **`custom`** — Full control over popup rendering (used by FontPlugin, TextColorPlugin, LinkPlugin)

## Services

The toolbar exposes a service for other plugins:

```ts
import { ToolbarServiceKey } from '@notectl/core';

const toolbarService = context.getService(ToolbarServiceKey);
```
