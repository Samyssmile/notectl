---
title: Gap Cursor
description: Virtual cursor at void-block boundaries for navigating between non-editable blocks.
---

The **GapCursorPlugin** provides a virtual cursor that appears at the boundary of void blocks (images, horizontal rules, code blocks in some configurations) where no native browser caret can exist. This lets users navigate to positions before or after void blocks and type to insert new content.

## Usage

```ts
import { createEditor, GapCursorPlugin } from '@notectl/core';

const editor = await createEditor({
  plugins: [new GapCursorPlugin()],
});
```

No configuration is needed. The plugin activates automatically when the selection lands on a gap position adjacent to a void block.

## Keyboard Shortcuts

When the gap cursor is active, arrow keys navigate away from it:

| Key | Action |
|-----|--------|
| `ArrowLeft` | Move to previous position (end of previous block, or NodeSelection) |
| `ArrowRight` | Move to next position (start of next block, or NodeSelection) |
| `ArrowUp` | Move up (equivalent to ArrowLeft) |
| `ArrowDown` | Move down (equivalent to ArrowRight) |
| `Enter` | Insert a new empty paragraph at the gap position |
| `Backspace` | Delete the adjacent void block (when gap is after it) or navigate away |
| `Delete` | Delete the adjacent void block (when gap is before it) or navigate away |
| Any character | Insert a new paragraph with the typed character |

These keys only activate when a gap cursor is present. In all other selection states, they pass through to other handlers.

## Accessibility

- When the gap cursor activates, the plugin announces **"Gap cursor active. Type to insert new paragraph."** to screen readers via a live region.
- The gap cursor DOM element uses `role="presentation"` and `aria-hidden="true"` — it is purely visual and not exposed to the accessibility tree.

## How It Works

### DOM Rendering

The gap cursor renders as a `<div class="notectl-gap-cursor">` positioned immediately before or after the void block element, depending on `side`:

- **`before`** — the `<div>` is inserted before the void block (visually above it)
- **`after`** — the `<div>` is inserted after the void block (visually below it)

The element itself has `height: 0` and uses a `::before` pseudo-element to render a full-width, 1px-tall blinking line.

### CSS Animation

The blinking animation uses a step function for a sharp on/off effect:

```css
@keyframes notectl-gap-blink {
  50% { opacity: 0; }
}

.notectl-gap-cursor::before {
  animation: notectl-gap-blink 1.1s step-end infinite;
  background: currentColor;
}
```

- **Animation**: `notectl-gap-blink`, 1.1s cycle, `step-end` timing
- **Color**: `currentColor` — automatically matches your editor's text color and works with any theme
- **Reduced motion**: The animation is disabled when `prefers-reduced-motion: reduce` is active

### Navigation Flow

When arrow keys move the cursor past a void block, the selection progresses through three states:

1. **Text cursor** in an adjacent text block
2. **NodeSelection** on the void block itself
3. **GapCursorSelection** at the boundary where no text block exists

This gives users full keyboard access to every position in the document, even between consecutive void blocks.
