---
title: Caret Navigation
description: Platform-aware keyboard navigation with RTL support and screen reader announcements.
---

The **CaretNavigationPlugin** provides platform-aware keyboard navigation for all caret movement — character, word, line boundary, and document boundary. It maps visual arrow-key intent to logical forward/backward direction, handles RTL text correctly, and announces block-type changes to screen readers on cross-block navigation.

## Usage

```ts
import { createEditor, CaretNavigationPlugin } from '@notectl/core';

const editor = await createEditor({
  plugins: [new CaretNavigationPlugin()],
});
```

No configuration is needed. The plugin auto-detects macOS vs Windows/Linux and registers the appropriate keymaps.

## Keyboard Shortcuts

All shortcuts below work in both LTR and RTL text. The plugin maps visual direction (left/right) to logical direction (forward/backward) based on the text direction of the focused block.

### Character Movement

| Action | Mac | Windows / Linux |
|--------|-----|-----------------|
| Extend selection right | `Shift+ArrowRight` | `Shift+ArrowRight` |
| Extend selection left | `Shift+ArrowLeft` | `Shift+ArrowLeft` |

Basic character movement (ArrowLeft/ArrowRight without Shift) is handled natively by the browser.

### Word Movement

| Action | Mac | Windows / Linux |
|--------|-----|-----------------|
| Move one word right | `Alt+ArrowRight` | `Ctrl+ArrowRight` |
| Move one word left | `Alt+ArrowLeft` | `Ctrl+ArrowLeft` |
| Extend selection one word right | `Shift+Alt+ArrowRight` | `Ctrl+Shift+ArrowRight` |
| Extend selection one word left | `Shift+Alt+ArrowLeft` | `Ctrl+Shift+ArrowLeft` |

### Line Boundary

| Action | Mac | Windows / Linux |
|--------|-----|-----------------|
| Move to line start | `Cmd+ArrowLeft` | `Home` |
| Move to line end | `Cmd+ArrowRight` | `End` |
| Extend to line start | `Cmd+Shift+ArrowLeft` | `Shift+Home` |
| Extend to line end | `Cmd+Shift+ArrowRight` | `Shift+End` |

### Line Up / Down

| Action | Mac | Windows / Linux |
|--------|-----|-----------------|
| Extend selection one line up | `Shift+ArrowUp` | `Shift+ArrowUp` |
| Extend selection one line down | `Shift+ArrowDown` | `Shift+ArrowDown` |

### Document Boundary

| Action | Mac | Windows / Linux |
|--------|-----|-----------------|
| Move to document start | `Cmd+ArrowUp` | `Ctrl+Home` |
| Move to document end | `Cmd+ArrowDown` | `Ctrl+End` |
| Extend to document start | `Cmd+Shift+ArrowUp` | `Ctrl+Shift+Home` |
| Extend to document end | `Cmd+Shift+ArrowDown` | `Ctrl+Shift+End` |

## Accessibility

When the cursor moves into a different block, the plugin announces the block type to screen readers (e.g. "Heading level 2", "Bullet list item", "Paragraph"). Announcements are debounced by 150 ms to avoid noise during rapid navigation. If another plugin has already announced something (e.g. CodeBlockPlugin's "Left code block"), the caret navigation announcement is suppressed.

## How It Works

The plugin registers keymaps at `navigation` priority and splits movement into two categories:

- **Model-based commands** — Character movement and document-boundary movement operate on the immutable document model directly. They count grapheme clusters and InlineNode boundaries without touching the DOM.
- **View-based commands** — Word, line-boundary, and line-up/down movement delegate to the browser's `Selection.modify()` API, then read the resulting DOM position back into the model. This ensures correct behavior with complex text shaping, ligatures, and soft-wrapped lines.

For RTL text, visual left/right arrow keys are flipped to the correct logical forward/backward direction by inspecting the computed text direction of the focused block element.
