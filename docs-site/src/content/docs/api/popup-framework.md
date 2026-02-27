---
title: Popup Framework
description: Shared popup lifecycle management, positioning, keyboard navigation patterns, and color grid rendering for plugin authors.
---

The popup framework provides a unified API for creating, positioning, and managing popup elements across all plugins. It handles click-outside dismissal, Escape key closing, focus restoration, and popup stacking for nested menus.

## PopupManager

The `PopupManager` is the central lifecycle manager. It is registered as a service and available to all plugins.

### Accessing the Service

```ts
import { PopupServiceKey } from '@notectl/core';

const popups = context.getService(PopupServiceKey);
```

### Opening a Popup

```ts
const handle = popups.open({
  anchor: buttonElement,
  content: (container, close) => {
    const item = document.createElement('button');
    item.textContent = 'Click me';
    item.addEventListener('click', () => {
      // do something
      close();
    });
    container.appendChild(item);
  },
  ariaRole: 'menu',
  ariaLabel: 'My menu',
  restoreFocusTo: buttonElement,
});
```

### PopupConfig

```ts
interface PopupConfig {
  /** The element or DOMRect to anchor the popup to. */
  readonly anchor: HTMLElement | DOMRect;
  /** Callback that renders content into the popup container. */
  readonly content: (container: HTMLElement, close: () => void) => void;
  /** Additional CSS class name(s) for the popup element. */
  readonly className?: string;
  /** ARIA role for the popup. */
  readonly ariaRole?: 'menu' | 'listbox' | 'grid' | 'dialog';
  /** Accessible label for the popup. */
  readonly ariaLabel?: string;
  /** Element to restore focus to when the popup closes. */
  readonly restoreFocusTo?: HTMLElement;
  /** Callback invoked when the popup is closed. */
  readonly onClose?: () => void;
  /** Positioning strategy relative to the anchor. Default: 'below-start'. */
  readonly position?: PopupPosition;
  /** Parent popup handle for nested popup stacking. */
  readonly parent?: PopupHandle;
  /** Override the reference node used to determine the shadow root for appending. */
  readonly referenceNode?: Node;
}
```

### PopupHandle

```ts
interface PopupHandle {
  /** Closes this popup and any child popups. */
  close(): void;
  /** Returns the popup DOM element. */
  getElement(): HTMLElement;
}
```

### PopupServiceAPI

```ts
interface PopupServiceAPI {
  /** Opens a popup with the given configuration. */
  open(config: PopupConfig): PopupHandle;
  /** Closes the topmost popup. */
  close(): void;
  /** Closes all open popups. */
  closeAll(): void;
  /** Returns true if any popup is currently open. */
  isOpen(): boolean;
}
```

### Nested Popups

To create a submenu or nested popup, pass the parent handle:

```ts
const parentHandle = popups.open({ /* ... */ });

// Later, inside the parent popup's content:
const childHandle = popups.open({
  anchor: submenuTrigger,
  parent: parentHandle,
  position: 'right',
  // ...
});
```

Closing a parent popup automatically closes all its children.

### Automatic Behaviors

- **Click outside**: Clicking outside all open popups closes the topmost popup
- **Escape key**: Handled by the keyboard pattern attached to the popup content
- **Focus restoration**: When `restoreFocusTo` is set, focus returns to that element on close
- **Shadow DOM aware**: Popups are appended to the shadow root when the editor lives inside one

## Popup Positioning

### `positionPopup(popup, anchor, options)`

Positions a popup element relative to an anchor rectangle using fixed positioning. Automatically clamps to viewport edges.

```ts
import { positionPopup } from '@notectl/core';

positionPopup(popupElement, anchorRect, {
  position: 'below-start',
  offset: 4,
});
```

### PopupPosition

| Value | Description |
|-------|-------------|
| `'below-start'` | Below the anchor, aligned to the left edge |
| `'below-end'` | Below the anchor, aligned to the right edge |
| `'right'` | To the right of the anchor, aligned to the top edge |

### PositionOptions

```ts
interface PositionOptions {
  readonly position: PopupPosition;
  /** Gap between anchor and popup in pixels. Default: 2. */
  readonly offset?: number;
}
```

### `appendToRoot(element, referenceNode)`

Appends an element to the appropriate root node. If the reference node lives inside a shadow root, the element is appended there; otherwise it is appended to `document.body`.

```ts
import { appendToRoot } from '@notectl/core';

appendToRoot(myElement, context.getContainer());
```

## Keyboard Patterns

Three WAI-ARIA keyboard navigation patterns are available for popup content. Each function returns a cleanup function that removes the event listener.

### `attachMenuKeyboard(config)`

Implements the [WAI-ARIA Menu pattern](https://www.w3.org/WAI/ARIA/apd/patterns/menu/) with roving tabindex.

```ts
import { attachMenuKeyboard } from '@notectl/core';

const cleanup = attachMenuKeyboard({
  container: menuElement,
  itemSelector: '[role="menuitem"]',
  onActivate: (item) => { /* execute action */ },
  onClose: () => handle.close(),
  getActiveElement: () => document.activeElement,
});
```

| Key | Action |
|-----|--------|
| `ArrowDown` | Focus next item |
| `ArrowUp` | Focus previous item |
| `Home` | Focus first item |
| `End` | Focus last item |
| `Enter` / `Space` | Activate focused item |
| `Escape` | Close menu |

### `attachListboxKeyboard(config)`

Implements the [WAI-ARIA Listbox pattern](https://www.w3.org/WAI/ARIA/apd/patterns/listbox/).

```ts
import { attachListboxKeyboard } from '@notectl/core';

const cleanup = attachListboxKeyboard({
  container: listElement,
  itemSelector: '[role="option"]',
  onSelect: (item) => { /* handle selection */ },
  onClose: () => handle.close(),
});
```

| Key | Action |
|-----|--------|
| `ArrowDown` | Focus next option |
| `ArrowUp` | Focus previous option |
| `Enter` / `Space` | Select focused option |
| `Escape` | Close listbox |

### `attachGridKeyboard(config)`

Implements the [WAI-ARIA Grid pattern](https://www.w3.org/WAI/ARIA/apd/patterns/grid/) with 2D arrow navigation.

```ts
import { attachGridKeyboard } from '@notectl/core';

const cleanup = attachGridKeyboard({
  container: gridElement,
  cellSelector: '[role="gridcell"]',
  columns: 10,
  totalCells: 70,
  onSelect: (cell) => { /* handle selection */ },
  onClose: () => handle.close(),
  onNavigate: (index) => { /* optional: update hover state */ },
});
```

| Key | Action |
|-----|--------|
| `ArrowRight` | Focus next cell |
| `ArrowLeft` | Focus previous cell |
| `ArrowDown` | Focus cell below |
| `ArrowUp` | Focus cell above |
| `Home` | Focus first cell in current row |
| `End` | Focus last cell in current row |
| `Enter` / `Space` | Select focused cell |
| `Escape` | Close grid |

## Color Grid

### `renderColorGrid(container, config)`

Renders an accessible color picker grid with `role="grid"` semantics, full keyboard navigation, and active-color indication. Used internally by TextColorPlugin, HighlightPlugin, and table border color pickers.

```ts
import { renderColorGrid } from '@notectl/core';

renderColorGrid(container, {
  colors: ['#000000', '#FF0000', '#00FF00', '#0000FF'],
  columns: 2,
  ariaLabel: 'Color picker',
  ariaLabelPrefix: 'Select color',
  activeColor: '#FF0000',
  onSelect: (color) => { /* apply color */ },
  onClose: () => handle.close(),
});
```

### ColorGridConfig

```ts
interface ColorGridConfig {
  /** Array of hex color strings. */
  readonly colors: readonly string[];
  /** Number of columns per row. */
  readonly columns: number;
  /** Accessible label for the grid element. */
  readonly ariaLabel: string;
  /** Prefix for individual swatch aria-labels (e.g. "Text color"). */
  readonly ariaLabelPrefix: string;
  /** Currently selected color (highlighted with active state). */
  readonly activeColor: string | null;
  /** Called when a color swatch is selected. */
  readonly onSelect: (color: string) => void;
  /** Called when the grid should close (Escape key). */
  readonly onClose: () => void;
  /** Custom label formatter for swatch aria-labels. */
  readonly swatchLabel?: (colorName: string) => string;
  /** When true, swatch title shows human-readable color name instead of hex. */
  readonly titleAsName?: boolean;
}
```

## Exports

All popup framework types and functions are available from the main package:

```ts
import {
  // Popup lifecycle
  PopupManager,
  PopupServiceKey,
  type PopupConfig,
  type PopupHandle,
  type PopupServiceAPI,

  // Keyboard patterns
  attachMenuKeyboard,
  attachListboxKeyboard,
  attachGridKeyboard,
  type MenuKeyboardConfig,
  type ListboxKeyboardConfig,
  type GridKeyboardConfig,

  // Positioning
  positionPopup,
  appendToRoot,
  type PopupPosition,
  type PositionOptions,

  // Color grid
  renderColorGrid,
  type ColorGridConfig,
} from '@notectl/core';
```
