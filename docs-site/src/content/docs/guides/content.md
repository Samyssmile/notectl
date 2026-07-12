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
      "htmlId": "introduction",
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
const html = await editor.getContentHTML();
// "<h1>Hello <strong>World</strong></h1><p>Some text here.</p>"
```

For indented, human-readable output pass the `pretty` option:

```ts
const pretty = await editor.getContentHTML({ pretty: true });
```

The HTML is sanitized with DOMPurify. The allowed tags and attributes are **schema-driven** — each plugin declares which HTML elements it produces. With a full preset, the allowed set includes:

- **Tags**: `p`, `div`, `span`, `br`, `h1`-`h6`, `strong`, `b`, `em`, `i`, `u`, `s`, `a`, `sup`, `sub`, `ul`, `ol`, `li`, `input`, `blockquote`, `hr`, `pre`, `code`, `table`, `colgroup`, `col`, `thead`, `tbody`, `tfoot`, `tr`, `td`, `figure`, `img`
- **Attributes**: `id`, `style`, `href`, `target`, `rel`, `colspan`, `rowspan`, `src`, `alt`, `width`, `height`, `class`, and plugin-owned `data-notectl-*` metadata such as bounded table dimensions

If you use a subset of plugins, only the tags relevant to those plugins are allowed.

#### Clean Export HTML (`includeBlockIds: false`)

By default every block element carries a `data-block-id` attribute. It is notectl's wire format for [round-trip identity](#round-trip-identity) — keep it when content is bound to an external owner that writes back on every keystroke. When you store the HTML in a database, validate it server-side, or hand it to another system, omit the attribute:

```ts
const clean = await editor.getContentHTML({ includeBlockIds: false });
// '<h1 id="introduction">Hello <strong>World</strong></h1><p>Some text here.</p>'
// No data-block-id; semantic id attributes remain.
```

This works in every mode, including `cssMode: 'classes'`. `includeBlockIds` controls only the
internal `data-block-id`; a semantic `id` stored in `BlockNode.htmlId` remains so fragment links keep
their targets. The trade-off is limited to editor identity: round-trips of cleaned HTML generate
fresh `BlockNode.id` values, so the caret is no longer preserved. The default (`true`) keeps that
internal identity contract intact.

### HTML with CSS Classes (CSP-Compliant)

For environments with strict Content Security Policy where inline `style` attributes are blocked, use the `cssMode: 'classes'` option. Instead of inline styles, dynamic marks and alignment are emitted as CSS class names:

```ts
const { html, css } = await editor.getContentHTML({ cssMode: 'classes' });
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
const { html, css } = await editor.getContentHTML({ cssMode: 'classes', pretty: true });
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
await editor.setContentHTML('<h1>Welcome</h1><p>Start editing...</p>');
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
| `<table>`, `<colgroup>/<col>`, `<tr>`, `<td>` | `table`, logical column widths, `table_row`, `table_cell` |
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

A conforming `id` on an element represented as a block root is imported as the separate
`BlockNode.htmlId` field. For example, `<h2 id="installation">` can be targeted by
`<a href="#installation">`. Wrapper-only and inline elements that have no corresponding block in
the document model (for example `<ul>`, `<tbody>`, or `<span>`) do not own a `BlockNode.htmlId`.

For tables, export writes logical widths once through `<colgroup>/<col>` and row minimum heights
on `<tr>`. Import accepts notectl's bounded numeric metadata plus unambiguous numeric or exact
`px` conventional width/height forms. Percentages, other units, CSS expressions, and arbitrary
declarations never enter the document attributes. See
[Table persistence and interchange](/notectl/plugins/table/#persistence-and-interchange).

#### Whitespace handling

HTML whitespace is normalized following the rules a browser uses to render it. Newlines, tabs, and runs of spaces in normal flow content are *insignificant*: they collapse to a single space, and whitespace at block edges is trimmed. Source-formatted or indented HTML therefore imports cleanly, and content copied from another browser (some serialize the clipboard HTML with hard-wrapped lines) is no longer split into extra paragraphs. The same normalization applies to pasted HTML.

Whitespace is preserved verbatim inside `<pre>` (and any element with `white-space: pre*`), so code blocks keep their indentation. A literal line break still requires a `<br>`; a non-breaking space (`&nbsp;`) is significant and is never collapsed.

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

### From Plain Text

Use `setText()` for a fast, lossless plain-text replacement. Each `\n` becomes a paragraph:

```ts
editor.setText('First paragraph\nSecond paragraph');
```

`setText` is preferable to `setContentHTML('<p>...</p>')` for plain-text input — it avoids HTML parsing and preserves block identity (see below).

## Round-Trip Identity

When an external owner (e.g. a form binding) reads the editor content and writes it back unchanged on every keystroke, the caret must not move. notectl guarantees this by ensuring **block identity** survives every `(getX, setX)` pair:

| Pair | Identity carrier |
|---|---|
| `getJSON` / `setJSON` | block IDs are part of the JSON shape |
| `getContentHTML` / `setContentHTML` | `data-block-id` attribute on every block element (present unless you opt out with `includeBlockIds: false`) |
| `getText` / `setText` | `setText` reuses existing top-level block IDs in document order |

Externally pasted HTML without `data-block-id` — including the output of [`getContentHTML({ includeBlockIds: false })`](#clean-export-html-includeblockids-false) — continues to receive fresh IDs, so external content imports behave as before. For `setText`, IDs are reused **by position**, not by content match — this is by design (the cursor stays on the same line index when text is rewritten in place), but means plugins that reference blocks by `BlockId` should not assume content stability across `setText` calls.

Semantic fragment targets use a separate identity plane: `BlockNode.htmlId` round-trips as the
ordinary HTML `id` attribute and remains present even in clean export. It belongs to document
content, not cursor preservation; keep semantic IDs unique within a document.

This contract enables Angular signal forms, RxJS-driven sync pipelines, and any external state owner to round-trip content on every input event without disturbing the user's cursor. See `ARCHITECTURE.md` §9.2 for the full contract.

## Checking Empty State

```ts
if (editor.isEmpty()) {
  console.log('Editor has no content');
}
```

The editor is considered empty when it contains a single empty paragraph.

## Listening for Changes

```ts
editor.on('stateChange', async ({ oldState, newState, transaction }) => {
  // Called on every state change
  const html = await editor.getContentHTML();
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
