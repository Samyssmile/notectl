---
title: Keyboard Navigation
description: Complete guide to keyboard navigation, selection types, and movement commands in notectl.
---

import { Aside } from '@astrojs/starlight/components';

notectl provides comprehensive keyboard navigation that mirrors native text editing behavior across platforms. This guide covers all movement, selection, and deletion shortcuts.

## Selection Types

notectl uses three selection types to represent the cursor position:

| Type | Description | When it occurs |
|------|-------------|----------------|
| **Collapsed** | A single cursor position (anchor = head) | Normal text editing |
| **Range** | A span from anchor to head | Shift+arrow, click-drag, Select All |
| **NodeSelection** | An entire void block is selected | Arrow into an image, horizontal rule, etc. |
| **GapCursorSelection** | Virtual cursor at a void-block boundary | Arrow past a NodeSelection to a position with no text block |

## Character Movement

| Action | Mac | Windows / Linux |
|--------|-----|-----------------|
| Move one character right | `ArrowRight` | `ArrowRight` |
| Move one character left | `ArrowLeft` | `ArrowLeft` |
| Extend selection right | `Shift+ArrowRight` | `Shift+ArrowRight` |
| Extend selection left | `Shift+ArrowLeft` | `Shift+ArrowLeft` |

Character movement counts grapheme clusters (not code points), so multi-byte emoji and combining characters are traversed as single units. Movement crosses block boundaries — pressing ArrowRight at the end of a paragraph moves into the next block.

## Word Movement

| Action | Mac | Windows / Linux |
|--------|-----|-----------------|
| Move one word right | `Alt+ArrowRight` | `Ctrl+ArrowRight` |
| Move one word left | `Alt+ArrowLeft` | `Ctrl+ArrowLeft` |
| Extend one word right | `Shift+Alt+ArrowRight` | `Ctrl+Shift+ArrowRight` |
| Extend one word left | `Shift+Alt+ArrowLeft` | `Ctrl+Shift+ArrowLeft` |

Word movement uses the browser's `Selection.modify()` API to respect the platform's word-boundary rules (e.g. punctuation handling differs between macOS and Windows).

## Line Movement

| Action | Mac | Windows / Linux |
|--------|-----|-----------------|
| Move to line start | `Cmd+ArrowLeft` | `Home` |
| Move to line end | `Cmd+ArrowRight` | `End` |
| Extend to line start | `Cmd+Shift+ArrowLeft` | `Shift+Home` |
| Extend to line end | `Cmd+Shift+ArrowRight` | `Shift+End` |
| Move one line up | `ArrowUp` | `ArrowUp` |
| Move one line down | `ArrowDown` | `ArrowDown` |
| Extend one line up | `Shift+ArrowUp` | `Shift+ArrowUp` |
| Extend one line down | `Shift+ArrowDown` | `Shift+ArrowDown` |

Line start/end refers to the **visual line** (soft-wrapped), not the block boundary. In a long paragraph that wraps to three lines, `Home` moves to the start of the current visual line, not to offset 0 of the block.

## Document Boundary

| Action | Mac | Windows / Linux |
|--------|-----|-----------------|
| Move to document start | `Cmd+ArrowUp` | `Ctrl+Home` |
| Move to document end | `Cmd+ArrowDown` | `Ctrl+End` |
| Extend to document start | `Cmd+Shift+ArrowUp` | `Ctrl+Shift+Home` |
| Extend to document end | `Cmd+Shift+ArrowDown` | `Ctrl+Shift+End` |

## Void Block Navigation

Void blocks (images, horizontal rules, etc.) cannot hold a text cursor. When you arrow into a void block, notectl transitions through selection types:

```
Text cursor → NodeSelection → GapCursor → Text cursor (next block)
```

1. **Arrow into a void block** — the block becomes a NodeSelection (visually highlighted).
2. **Arrow past the void block** — if there is a text block on the other side, the cursor lands there. If not (e.g. two consecutive void blocks), a GapCursor appears at the boundary.
3. **Type at a GapCursor** — a new paragraph is inserted with the typed character.
4. **Enter at a GapCursor** — an empty paragraph is inserted.

## Gap Cursor

The gap cursor is a virtual cursor at void-block boundaries. It appears as a blinking horizontal line.

| Key | Action |
|-----|--------|
| `ArrowLeft` / `ArrowUp` | Navigate away (previous position) |
| `ArrowRight` / `ArrowDown` | Navigate away (next position) |
| `Enter` | Insert new empty paragraph |
| `Backspace` | Delete adjacent void block (after side) or navigate |
| `Delete` | Delete adjacent void block (before side) or navigate |
| Any character | Insert paragraph with that character |

See the [Gap Cursor plugin documentation](/notectl/plugins/gap-cursor/) for details.

## Table Cell Navigation

Inside tables, navigation is scoped to the current cell with some special shortcuts:

| Key | Action |
|-----|--------|
| `Tab` | Move to next cell (creates a new row at the end of the table) |
| `Shift+Tab` | Move to previous cell |
| `ArrowUp` / `ArrowDown` | Move between rows when at cell boundary |

Table cells are isolating — word movement and line-boundary movement do not escape the current cell.

## Deletion

| Action | Mac | Windows / Linux |
|--------|-----|-----------------|
| Delete backward (character) | `Backspace` | `Backspace` |
| Delete forward (character) | `Delete` | `Delete` |
| Delete word backward | `Alt+Backspace` | `Ctrl+Backspace` |
| Delete word forward | `Alt+Delete` | `Ctrl+Delete` |
| Delete to line start | `Cmd+Backspace` | — |
| Delete to line end | `Cmd+Delete` | — |

At a block boundary, `Backspace` merges the current block into the previous one; `Delete` merges the next block into the current one.

## RTL Support

All horizontal navigation commands are RTL-aware. In a right-to-left block:

- **ArrowLeft** moves *forward* in offset space (toward the end of text)
- **ArrowRight** moves *backward* in offset space (toward the start of text)

This mapping is automatic and per-block — a document can mix LTR and RTL blocks, and each block gets the correct arrow behavior.

## Screen Reader Announcements

The [Caret Navigation plugin](/notectl/plugins/caret-navigation/) announces block-type transitions to screen readers. When the cursor moves into a different block, users hear the block type (e.g. "Heading level 2", "Bullet list item", "Code block"). These announcements are:

- **Debounced** (150 ms) to avoid noise during rapid arrow-key navigation
- **Suppressed** when another plugin has already made an announcement
- **Skipped** for the initial focus (no announcement on first render)

<Aside type="tip">
  Both the [CaretNavigationPlugin](/notectl/plugins/caret-navigation/) and [GapCursorPlugin](/notectl/plugins/gap-cursor/) are included automatically when you use `createEditor()`. You only need to add them explicitly if you are composing plugins manually.
</Aside>
