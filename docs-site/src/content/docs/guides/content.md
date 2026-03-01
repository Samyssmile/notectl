---
title: Working with Content
description: Read, write, and manipulate editor content programmatically.
---

## Output Formats

notectl supports three output formats:

### JSON (Document Model)

The canonical format — a structured tree of blocks, text nodes, and marks:

```ts
const doc = editor.getJSON();
```

Returns a `Document` object:

```json
{
  "children": [
    {
      "type": "heading",
      "id": "abc123",
      "attrs": { "level": 1 },
      "children": [
        { "type": "text", "text": "Hello ", "marks": [] },
        { "type": "text", "text": "World", "marks": [{ "type": "bold" }] }
      ]
    },
    {
      "type": "paragraph",
      "id": "def456",
      "children": [
        { "type": "text", "text": "Some text here.", "marks": [] }
      ]
    }
  ]
}
```

### HTML

Sanitized HTML output suitable for rendering or storage:

```ts
const html = editor.getContentHTML();
// "<h1>Hello <strong>World</strong></h1><p>Some text here.</p>"
```

For indented, human-readable output pass the `pretty` option:

```ts
const pretty = editor.getContentHTML({ pretty: true });
```

The HTML is sanitized with DOMPurify. The allowed tags and attributes are **schema-driven** — each plugin declares which HTML elements it produces. With a full preset, the allowed set includes:

- **Tags**: `p`, `div`, `span`, `br`, `h1`-`h6`, `strong`, `b`, `em`, `i`, `u`, `s`, `a`, `sup`, `sub`, `ul`, `ol`, `li`, `input`, `blockquote`, `hr`, `pre`, `code`, `table`, `tbody`, `tr`, `td`, `figure`, `img`
- **Attributes**: `style`, `href`, `target`, `rel`, `colspan`, `rowspan`, `src`, `alt`, `width`, `height`, `class`

If you use a subset of plugins, only the tags relevant to those plugins are allowed.

### HTML with CSS Classes (CSP-Compliant)

For environments with strict Content Security Policy where inline `style` attributes are blocked, use the `cssMode: 'classes'` option. Instead of inline styles, dynamic marks and alignment are emitted as CSS class names:

```ts
const { html, css } = editor.getContentHTML({ cssMode: 'classes' });
```

This returns a `ContentCSSResult` object with two fields:

- **`html`** — The HTML with `class="..."` attributes instead of `style="..."`
- **`css`** — A stylesheet containing only the CSS rules used in the document

Example output:

```html
<!-- html -->
<p class="notectl-align-center">
  <strong><span class="notectl-s0">Hello World</span></strong>
</p>
```

```css
/* css */
.notectl-s0 { color: #ff0000; background-color: #fff176; }
.notectl-align-center { text-align: center; }
```

Semantic marks (`<strong>`, `<em>`, `<u>`, `<s>`) are unaffected — they always use HTML elements. Only dynamic style marks (text color, highlight, font size, font family) and block alignment are converted to classes.

Identical style combinations are deduplicated: if multiple text spans share the same color and font size, they share a single CSS class.

The `pretty` option works with class mode:

```ts
const { html, css } = editor.getContentHTML({ cssMode: 'classes', pretty: true });
```

See the [CSP guide](/notectl/guides/content-security-policy/#class-based-html-export) for how to integrate the generated CSS into your page.

### Plain Text

Plain text content with blocks joined by newlines:

```ts
const text = editor.getText();
// "Hello World\nSome text here."
```

## Setting Content

### From HTML

```ts
editor.setContentHTML('<h1>Welcome</h1><p>Start editing...</p>');
```

The HTML is parsed into the document model. Supported elements depend on registered plugins. With a full preset:

| HTML | Block Type |
|------|-----------|
| `<p>`, `<div>` | `paragraph` |
| `<h1>` - `<h6>` | `heading` (level 1-6) |
| `<ul><li>` | `list_item` (bullet) |
| `<ol><li>` | `list_item` (ordered) |
| `<li>` with checkbox | `list_item` (checklist) |
| `<hr>` | `horizontal_rule` |
| `<blockquote>` | `blockquote` |
| `<pre><code>` | `code_block` |
| `<table>`, `<tr>`, `<td>` | `table`, `table_row`, `table_cell` |
| `<figure>`, `<img>` | `image` |

Inline formatting maps:

| HTML | Mark / Inline Type |
|------|----------|
| `<strong>`, `<b>` | `bold` |
| `<em>`, `<i>` | `italic` |
| `<u>` | `underline` |
| `<s>` | `strikethrough` |
| `<sup>` | `superscript` |
| `<sub>` | `subscript` |
| `<a href="...">` | `link` |
| `<span style="color: ...">` | `textColor` |
| `<span style="background-color: ...">` | `highlight` |
| `<span style="font-family: ...">` | `font` |
| `<span style="font-size: ...">` | `fontSize` |
| `<br>` | `hard_break` (InlineNode) |

### From JSON

```ts
import { createDocument, createBlockNode, createTextNode, nodeType } from '@notectl/core';

const doc = createDocument([
  createBlockNode(nodeType('paragraph'), [
    createTextNode('Hello world'),
  ]),
]);

editor.setJSON(doc);
```

## Checking Empty State

```ts
if (editor.isEmpty()) {
  console.log('Editor has no content');
}
```

The editor is considered empty when it contains a single empty paragraph.

## Listening for Changes

```ts
editor.on('stateChange', ({ oldState, newState, transaction }) => {
  // Called on every state change
  const html = editor.getContentHTML();
  saveToBackend(html);
});
```

## Programmatic Editing

Use the command API for common operations:

```ts
// Toggle inline marks
editor.commands.toggleBold();
editor.commands.toggleItalic();
editor.commands.toggleUnderline();

// Execute named commands from plugins
editor.executeCommand('toggleStrikethrough');
editor.executeCommand('insertHorizontalRule');
editor.executeCommand('toggleList:ordered');
editor.executeCommand('toggleList:bullet');
editor.executeCommand('toggleBlockquote');

// Undo / Redo
editor.commands.undo();
editor.commands.redo();

// Select all
editor.commands.selectAll();
```

## Check Command Availability

```ts
const canToggle = editor.can();

if (canToggle.toggleBold()) {
  editor.commands.toggleBold();
}

if (canToggle.undo()) {
  editor.commands.undo();
}
```

## Advanced: Direct State Access

For advanced use cases, you can access the editor state directly:

```ts
const state = editor.getState();

// Inspect the document
console.log(state.doc.children.length, 'blocks');

// Check selection
console.log(state.selection);

// Access schema
console.log(state.schema.nodeTypes);
console.log(state.schema.markTypes);
```
