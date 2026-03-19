---
title: View Utilities
description: Caret navigation, node views, cursor wrapper, platform detection, and CSS style injection.
---

View-layer utilities for DOM interaction, caret positioning, and platform-specific behavior. These are used internally by the editor and exported for advanced plugin development.

## Caret Navigation

Functions for navigating the cursor using DOM-based caret positioning.

### `endOfTextblock(container, state, direction, caretRect?)`

Returns `true` if the caret is at the edge of a text block in the given direction. Used to determine when to cross block boundaries.

```ts
import { endOfTextblock } from '@notectl/core';

const atEnd: boolean = endOfTextblock(container, state, 'right');
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `container` | `HTMLElement` | The editor's content element |
| `state` | `EditorState` | Current editor state |
| `direction` | `CaretDirection` | `'left'`, `'right'`, `'up'`, or `'down'` |
| `caretRect` | `DOMRect \| null` | Optional cached caret rect for performance |

### `navigateAcrossBlocks(state, direction)`

Moves the cursor to the adjacent block when at a block boundary:

```ts
import { navigateAcrossBlocks } from '@notectl/core';

const tr = navigateAcrossBlocks(state, 'down');
```

### `navigateVerticalWithGoalColumn(container, state, direction, goalColumn)`

Vertical navigation with goal column preservation (standard behavior for up/down arrow keys):

```ts
import { navigateVerticalWithGoalColumn } from '@notectl/core';

const tr = navigateVerticalWithGoalColumn(container, state, 'up', goalColumn);
```

### `skipInlineNode(state, direction)`

Skips over an inline node (width-1 in offset space) when the cursor is adjacent to one:

```ts
import { skipInlineNode } from '@notectl/core';

const tr = skipInlineNode(state, 'right');
```

### `navigateFromGapCursor(state, direction, container?)`

Navigates from a gap cursor position to the nearest editable block:

```ts
import { navigateFromGapCursor } from '@notectl/core';

const tr = navigateFromGapCursor(state, 'down', container);
```

### `getCaretRectFromSelection(domSel, container?)`

Returns the bounding rect of the current DOM selection's caret, or `null` if unavailable:

```ts
import { getCaretRectFromSelection } from '@notectl/core';

const rect: DOMRect | null = getCaretRectFromSelection(window.getSelection()!);
// With optional container for scoped lookups:
const rect2: DOMRect | null = getCaretRectFromSelection(window.getSelection()!, container);
```

### CaretDirection

```ts
type CaretDirection = 'left' | 'right' | 'up' | 'down';
```

---

## NodeView

Custom rendering for block node types. When a `NodeView` is registered for a block type, the reconciler delegates rendering to it instead of using the default `NodeSpec.toDOM()`.

```ts
interface NodeView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement | null;
  getContentDOM?(childId: string): HTMLElement | null;
  update?(node: BlockNode): boolean;
  destroy?(): void;
  selectNode?(): void;
  deselectNode?(): void;
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `dom` | `HTMLElement` | The root DOM element managed by this view |
| `contentDOM` | `HTMLElement \| null` | The element where text content is rendered. `null` for void nodes |

### Methods

| Method | Description |
|--------|-------------|
| `getContentDOM(childId)` | Returns the content container for a nested child block |
| `update(node)` | Called when the block's data changes. Return `true` if handled, `false` to recreate |
| `destroy()` | Clean up DOM event listeners and resources |
| `selectNode()` | Called when the node receives a node selection |
| `deselectNode()` | Called when the node loses its node selection |

### NodeViewFactory

```ts
type NodeViewFactory = (
  node: BlockNode,
  getState: () => EditorState,
  dispatch: (tr: Transaction) => void,
) => NodeView;
```

Register via `PluginContext.registerNodeView()`:

```ts
context.registerNodeView('code_block', (node, getState, dispatch) => {
  const dom = document.createElement('pre');
  dom.dataset.blockId = node.id;
  const contentDOM = document.createElement('code');
  dom.appendChild(contentDOM);
  return { dom, contentDOM };
});
```

---

## NodeViewRegistry

Stores `NodeViewFactory` registrations.

```ts
import { NodeViewRegistry } from '@notectl/core';

const registry = new NodeViewRegistry();
```

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `registerNodeView` | `(type: string, factory: NodeViewFactory) => void` | Register a factory for a node type |
| `getNodeViewFactory` | `(type: string) => NodeViewFactory \| undefined` | Look up by type |
| `removeNodeView` | `(type: string) => void` | Remove a registration |
| `clear` | `() => void` | Remove all registrations |

---

## CursorWrapper

Manages cursor display during IME composition, ensuring the cursor remains visible and correctly positioned.

```ts
import { CursorWrapper } from '@notectl/core';

const wrapper = new CursorWrapper(container, schemaRegistry);
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `isActive` | `boolean` | Whether the cursor wrapper is currently active |

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `onCompositionStart` | `(state: EditorState) => void` | Activate the wrapper when composition begins |
| `cleanup` | `() => void` | Deactivate and remove the wrapper element |

---

## Platform Detection

Utility functions for detecting the current platform and text direction.

```ts
import { isMac, isFirefox, isWebKit, getTextDirection, isRtlContext } from '@notectl/core';
```

| Function | Return Type | Description |
|----------|-------------|-------------|
| `isMac()` | `boolean` | Returns `true` on macOS (used for Cmd vs Ctrl keybindings) |
| `isFirefox()` | `boolean` | Returns `true` in Firefox |
| `isWebKit()` | `boolean` | Returns `true` in WebKit/Safari |
| `getTextDirection(element)` | `'ltr' \| 'rtl'` | Computes the text direction of an element |
| `isRtlContext(element)` | `boolean` | Returns `true` if the element is in a right-to-left context |

---

## CSS Style Injection

Utilities for injecting CSS styles into the document or shadow DOM. Used by plugins that need to register custom stylesheets.

### `injectContentStyles(css, options?)`

Injects CSS into the document via a `<style>` element:

```ts
import { injectContentStyles } from '@notectl/core';

const styleEl = injectContentStyles('.highlight { background: yellow }', {
  id: 'my-plugin-styles',
  nonce: 'abc123',
});
```

### Options

```ts
interface InjectStylesOptions {
  readonly nonce?: string;
  readonly document?: Document;
  readonly container?: HTMLElement;
  readonly id?: string;
}
```

### `removeContentStyles(id, doc?)`

Removes a previously injected `<style>` element by its `id`:

```ts
import { removeContentStyles } from '@notectl/core';

removeContentStyles('my-plugin-styles');
```

### `adoptContentStyles(css, options?)`

Creates and adopts a `CSSStyleSheet` (for shadow DOM):

```ts
import { adoptContentStyles } from '@notectl/core';

const sheet = adoptContentStyles('.highlight { background: yellow }', {
  target: shadowRoot,
});
```

### Options

```ts
interface AdoptStylesOptions {
  readonly target?: Document | ShadowRoot;
  readonly replace?: boolean;
}
```

### `removeAdoptedStyles(sheet, target?)`

Removes a previously adopted stylesheet:

```ts
import { removeAdoptedStyles } from '@notectl/core';

removeAdoptedStyles(sheet, shadowRoot);
```

---

## Related

- [Commands](/notectl/api/commands/) — view movement commands that use caret navigation
- [Plugin Interface](/notectl/api/plugin-interface/) — `registerNodeView()`, `registerStyleSheet()`
- [Schema](/notectl/api/schema/) — `NodeSpec.toDOM()` which NodeView overrides
