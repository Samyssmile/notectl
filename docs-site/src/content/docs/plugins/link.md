---
title: Link Plugin
description: Hyperlink support with URL input popup.
---

The `LinkPlugin` adds hyperlink support with a toolbar button that opens a URL input popup.

## Usage

```ts
import { LinkPlugin } from '@notectl/core';

new LinkPlugin()
// or:
new LinkPlugin({ openInNewTab: true })
```

## Configuration

```ts
interface LinkConfig {
  /** Whether links open in new tab (adds target="_blank"). Default: true */
  openInNewTab: boolean;
  separatorAfter?: boolean;
}
```

## Commands

| Command | Description |
|---------|-------------|
| `toggleLink` | Add or remove a link on the selection |
| `removeLink` | Remove link mark from selection |

```ts
editor.executeCommand('toggleLink');
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` / `Cmd+K` | Toggle link (opens URL popup) |

## Toolbar

The link button opens a popup with a URL input field. When the cursor is inside a link, the popup shows the current URL and an option to remove it.

## Mark Spec

| Mark | HTML Tag | Attributes |
|------|----------|-----------|
| `link` | `<a>` | `href: string` |
