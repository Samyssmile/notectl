---
title: Gap Cursor
description: Virtual cursor at void-block boundaries for navigating between non-editable blocks.
---

The **GapCursorPlugin** provides a virtual cursor that appears at the boundary of void blocks (images, horizontal rules, code blocks in some configurations) where no native browser caret can exist. This lets users navigate to positions before or after void blocks and type to insert new content.

## Usage

```ts
import { createEditor } from '@notectl/core';
import { GapCursorPlugin } from '@notectl/core/plugins/gap-cursor';

const editor = await createEditor({
  plugins: [new GapCursorPlugin()],
});
```

## Configuration

The plugin requires no configuration. It activates automatically when the selection lands on a gap position adjacent to a void block.

## Keyboard Shortcuts

The plugin registers arrow key keymaps that activate only when a gap cursor is present:

| Key | Action |
|-----|--------|
| `ArrowLeft` | Move to previous position (end of previous block, or NodeSelection) |
| `ArrowRight` | Move to next position (start of next block, or NodeSelection) |
| `ArrowUp` | Move up (equivalent to ArrowLeft) |
| `ArrowDown` | Move down (equivalent to ArrowRight) |

Other keys such as Enter, Backspace, Delete, and character input are handled by the core InputHandler, not by this plugin. In all other selection states, the arrow key keymaps pass through to other handlers.

## Accessibility

- When the gap cursor activates, the plugin announces **"Gap cursor active. Type to insert new paragraph."** to screen readers via a live region.
- The gap cursor DOM element uses `role="presentation"` and `aria-hidden="true"` — it is purely visual and not exposed to the accessibility tree.

## How It Works

### DOM Rendering

The gap cursor does not create a separate DOM element. Instead, it adds a CSS class to the void block element itself, depending on `side`:

- **`before`** — adds `notectl-gap-cursor--before` to the void block (renders a `::before` pseudo-element visually above it)
- **`after`** — adds `notectl-gap-cursor--after` to the void block (renders an `::after` pseudo-element visually below it)

The pseudo-element renders a full-width, 1px-tall blinking line.

### CSS Animation

The blinking animation uses a step function for a sharp on/off effect:

```css
@keyframes notectl-gap-blink {
  50% { opacity: 0; }
}

.notectl-gap-cursor--before::before,
.notectl-gap-cursor--after::after {
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
