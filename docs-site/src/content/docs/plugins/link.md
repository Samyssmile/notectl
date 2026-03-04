---
title: Link Plugin
description: Hyperlink support with URL input popup and keyboard shortcut.
---

The `LinkPlugin` adds hyperlink support with a toolbar button that opens a URL input popup.

![Link plugin with URL popup](../../../assets/screenshots/plugin-link.png)

## Usage

```ts
import { LinkPlugin } from '@notectl/core/plugins/link';

new LinkPlugin()
// or:
new LinkPlugin({ openInNewTab: true })
```

## Configuration

```ts
interface LinkConfig {
  /** Whether links open in a new tab (adds target="_blank"). Default: true */
  readonly openInNewTab: boolean;
  /** Custom locale for toolbar labels and popup strings. */
  readonly locale?: LinkLocale;
}
```

## Commands

| Command | Description | Returns |
|---------|-------------|---------|
| `toggleLink` | Add or remove a link on the selection | `boolean` |
| `removeLink` | Remove link mark from selection | `boolean` |

The toolbar button is only enabled when there is a text range selection (not a collapsed cursor).

```ts
editor.executeCommand('toggleLink');
editor.executeCommand('removeLink');
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` / `Cmd+K` | Toggle link (opens URL popup if adding) |

## Toolbar

The link button opens a **custom popup** with:
- A URL input field with placeholder text
- An Apply button to confirm the link
- When the cursor is inside an existing link: a "Remove" button to unlink the selection

## Mark Spec

| Mark | HTML Tag | Attributes | Renders As |
|------|----------|-----------|-----------|
| `link` | `<a>` | `href: string` | `<a href="...">` with optional `target="_blank"` |

When `openInNewTab` is `true`, the `toDOM` method adds `target="_blank"` and `rel="noopener noreferrer"` to the rendered `<a>` element.

## Programmatic Link Insertion

To add a link programmatically without the popup:

```ts
import { markType } from '@notectl/core';

// Select text first, then apply the link mark
const state = editor.getState();
const { anchor, head } = state.selection;
const tr = state.transaction('api')
  .addMark(
    anchor.blockId,
    anchor.offset,
    head.offset,
    { type: markType('link'), attrs: { href: 'https://example.com' } }
  )
  .build();
editor.dispatch(tr);
```
