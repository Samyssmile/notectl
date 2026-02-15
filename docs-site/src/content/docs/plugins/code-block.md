---
title: Code Block Plugin
description: Fenced code blocks with syntax highlighting, indentation, language labels, copy button, and customizable theming.
---

The `CodeBlockPlugin` adds fenced code blocks with a non-editable header (language label + copy button), keyboard-driven indentation, Markdown input rules, and full color theming.

## Usage

```ts
import { CodeBlockPlugin } from '@notectl/core';

// Default (dark theme)
new CodeBlockPlugin()

// Light theme
new CodeBlockPlugin({
  background: '#f8f9fa',
  headerBackground: '#e9ecef',
  textColor: '#212529',
  headerColor: '#868e96',
})
```

## Configuration

```ts
interface CodeBlockConfig {
  /** Optional syntax highlighter implementation. */
  readonly highlighter?: SyntaxHighlighter;
  /** Default language when creating new code blocks. */
  readonly defaultLanguage?: string;
  /** Use spaces instead of tabs for indentation. */
  readonly useSpaces?: boolean;
  /** Number of spaces per indent level (default: 2). */
  readonly spaceCount?: number;
  /** Show the copy button in the header (default: true). */
  readonly showCopyButton?: boolean;
  /** Render separator after toolbar item. */
  readonly separatorAfter?: boolean;
  /** Body background color (overrides --notectl-code-block-bg). */
  readonly background?: string;
  /** Header background color (overrides --notectl-code-block-header-bg). */
  readonly headerBackground?: string;
  /** Code text color (overrides --notectl-code-block-color). */
  readonly textColor?: string;
  /** Header/label text color (overrides --notectl-code-block-header-color). */
  readonly headerColor?: string;
}
```

## Theming

There are two ways to customize code block colors:

### Option 1: Plugin Config

Pass colors directly in the constructor. Best for fixed application themes.

```ts
new CodeBlockPlugin({
  background: '#f8f9fa',
  headerBackground: '#e9ecef',
  textColor: '#212529',
  headerColor: '#868e96',
})
```

### Option 2: CSS Custom Properties

Set CSS variables on the `<notectl-editor>` element. Best for dynamic theming (dark/light mode toggle, media queries).

```css
notectl-editor {
  --notectl-code-block-bg: #f8f9fa;
  --notectl-code-block-header-bg: #e9ecef;
  --notectl-code-block-color: #212529;
  --notectl-code-block-header-color: #868e96;
  --notectl-code-block-header-border: #dee2e6;
}
```

Or responsive with media queries:

```css
@media (prefers-color-scheme: light) {
  notectl-editor {
    --notectl-code-block-bg: #f8f9fa;
    --notectl-code-block-color: #212529;
    --notectl-code-block-header-bg: #e9ecef;
    --notectl-code-block-header-color: #868e96;
  }
}

@media (prefers-color-scheme: dark) {
  notectl-editor {
    --notectl-code-block-bg: #1e1e2e;
    --notectl-code-block-color: #cdd6f4;
    --notectl-code-block-header-bg: rgba(255, 255, 255, 0.06);
    --notectl-code-block-header-color: #7f849c;
  }
}
```

### Available CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--notectl-code-block-bg` | `#1e1e2e` | Body background |
| `--notectl-code-block-color` | `#cdd6f4` | Code text color |
| `--notectl-code-block-header-bg` | `rgba(255,255,255,0.06)` | Header background |
| `--notectl-code-block-header-color` | `#7f849c` | Header label and copy button color |
| `--notectl-code-block-header-border` | `rgba(255,255,255,0.08)` | Header bottom border |

### Priority

When both methods are used, plugin config wins because it sets inline CSS custom properties on each `<pre>` element:

1. CSS defaults in stylesheet (lowest)
2. External CSS custom properties on `notectl-editor`
3. Plugin config (highest)

## Commands

| Command | Description | Returns |
|---------|-------------|---------|
| `toggleCodeBlock` | Toggle between paragraph and code block | `boolean` |
| `insertCodeBlock` | Convert the current block to a code block | `boolean` |
| `exitCodeBlock` | Exit the code block (same as Escape) | `boolean` |

```ts
editor.executeCommand('toggleCodeBlock');
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+M` / `Cmd+Shift+M` | Toggle code block |
| `Enter` | Insert newline within code block |
| `Enter` (twice, on empty last line) | Exit code block, create paragraph below |
| `Tab` | Insert indent (tab or spaces) |
| `Shift+Tab` | Remove indent from current line |
| `Escape` | Exit code block to next block or new paragraph |
| `ArrowDown` (on last line) | Exit code block to next block or new paragraph |
| `ArrowUp` (on first line) | Exit to previous block |
| `Backspace` (at position 0) | Convert code block back to paragraph |

## Input Rules

| Pattern | Result |
|---------|--------|
| `` ``` `` + Space | Create empty code block |
| `` ```typescript `` + Space | Create code block with language set to "typescript" |

## Toolbar

The code block button appears in the **block** toolbar group with the `</>` icon. It shows as active when the cursor is inside a code block.

## Node Spec

| Type | HTML Tag | Attributes | Description |
|------|----------|-----------|-------------|
| `code_block` | `<pre><code>` | `language`, `backgroundColor` | Fenced code block |

## Service API

The plugin registers a typed service for programmatic access:

```ts
import { CODE_BLOCK_SERVICE_KEY } from '@notectl/core';

const service = editor.getService(CODE_BLOCK_SERVICE_KEY);

service.setLanguage(blockId, 'python');
service.getLanguage(blockId);        // 'python'
service.setBackground(blockId, '#282c34');
service.getBackground(blockId);      // '#282c34'
service.isCodeBlock(blockId);        // true
service.getSupportedLanguages();     // ['typescript', 'python', ...]
```

## Syntax Highlighting

Provide a `SyntaxHighlighter` implementation to enable token-based highlighting:

```ts
interface SyntaxHighlighter {
  tokenize(code: string, language: string): readonly SyntaxToken[];
  getSupportedLanguages(): readonly string[];
}

interface SyntaxToken {
  readonly from: number;
  readonly to: number;
  readonly type: string; // e.g. 'keyword', 'string', 'number', 'comment'
}
```

The plugin generates decoration classes like `notectl-token--keyword`, `notectl-token--string`, etc. Style them in your CSS:

```css
notectl-editor .notectl-token--keyword { color: #c678dd; }
notectl-editor .notectl-token--string  { color: #98c379; }
notectl-editor .notectl-token--number  { color: #d19a66; }
notectl-editor .notectl-token--comment { color: #5c6370; font-style: italic; }
```

## Mark Prevention

The plugin automatically prevents formatting marks (bold, italic, underline, etc.) from being applied inside code blocks via middleware.
