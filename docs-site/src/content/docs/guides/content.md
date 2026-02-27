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

The HTML is sanitized with DOMPurify. Only safe tags and attributes are included:

- **Tags**: `p`, `h1`-`h6`, `strong`, `em`, `u`, `s`, `a`, `span`, `ul`, `ol`, `li`, `hr`, `blockquote`, `div`, `br`
- **Attributes**: `href`, `target`, `rel`, `style`

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

The HTML is parsed into the document model. Supported elements:

| HTML | Block Type |
|------|-----------|
| `<p>`, `<div>` | `paragraph` |
| `<h1>` - `<h6>` | `heading` (level 1-6) |
| `<ul><li>` | `list_item` (bullet) |
| `<ol><li>` | `list_item` (ordered) |
| `<li>` with checkbox | `list_item` (checklist) |
| `<hr>` | `horizontal_rule` |
| `<blockquote>` | `blockquote` |

Inline formatting maps:

| HTML | Mark Type |
|------|----------|
| `<strong>`, `<b>` | `bold` |
| `<em>`, `<i>` | `italic` |
| `<u>` | `underline` |
| `<s>` | `strikethrough` |
| `<a href="...">` | `link` |
| `<span style="color: ...">` | `textColor` |
| `<span style="font-family: ...">` | `font` |

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
