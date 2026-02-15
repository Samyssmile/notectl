---
title: Styling & Theming
description: Customize the notectl editor appearance using CSS custom properties.
---

notectl uses **CSS custom properties** (CSS variables) for theming. Set them on the `<notectl-editor>` element to customize colors, spacing, and fonts without touching any JavaScript.

## Editor Layout

```css
notectl-editor {
  /* Minimum height of the editable content area */
  --notectl-content-min-height: 400px;
}
```

## Code Block

The code block ships with a dark theme by default. Override it with CSS custom properties for a light theme or to match your application's design.

### CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--notectl-code-block-bg` | `#1e1e2e` | Body background |
| `--notectl-code-block-color` | `#cdd6f4` | Code text color |
| `--notectl-code-block-header-bg` | `rgba(255,255,255,0.06)` | Header background |
| `--notectl-code-block-header-color` | `#7f849c` | Header label and copy button |
| `--notectl-code-block-header-border` | `rgba(255,255,255,0.08)` | Header bottom border |

### Light Theme Example

```css
notectl-editor {
  --notectl-code-block-bg: #f8f9fa;
  --notectl-code-block-color: #212529;
  --notectl-code-block-header-bg: #e9ecef;
  --notectl-code-block-header-color: #868e96;
  --notectl-code-block-header-border: #dee2e6;
}
```

### Responsive Dark/Light Mode

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

### JavaScript Toggle

You can also set properties dynamically:

```ts
const editor = document.querySelector('notectl-editor');

// Switch to light theme
editor.style.setProperty('--notectl-code-block-bg', '#f8f9fa');
editor.style.setProperty('--notectl-code-block-color', '#212529');

// Reset to defaults
editor.style.removeProperty('--notectl-code-block-bg');
editor.style.removeProperty('--notectl-code-block-color');
```

### Plugin Config Alternative

Colors can also be set via the `CodeBlockPlugin` constructor. This takes priority over CSS custom properties.

```ts
import { CodeBlockPlugin } from '@notectl/core';

new CodeBlockPlugin({
  background: '#f8f9fa',
  headerBackground: '#e9ecef',
  textColor: '#212529',
  headerColor: '#868e96',
})
```

See the [Code Block Plugin](/notectl/plugins/code-block/#theming) documentation for full details on both approaches and their priority order.

## Syntax Highlighting Tokens

When a syntax highlighter is configured on the `CodeBlockPlugin`, token classes are applied to code content. Style them to match your theme:

```css
/* Light theme tokens */
notectl-editor .notectl-token--keyword { color: #d73a49; }
notectl-editor .notectl-token--string  { color: #032f62; }
notectl-editor .notectl-token--number  { color: #005cc5; }
notectl-editor .notectl-token--comment { color: #6a737d; font-style: italic; }

/* Dark theme tokens */
@media (prefers-color-scheme: dark) {
  notectl-editor .notectl-token--keyword { color: #c678dd; }
  notectl-editor .notectl-token--string  { color: #98c379; }
  notectl-editor .notectl-token--number  { color: #d19a66; }
  notectl-editor .notectl-token--comment { color: #5c6370; font-style: italic; }
}
```
