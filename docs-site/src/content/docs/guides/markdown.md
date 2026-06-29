---
title: Markdown Support
description: Import, export, and paste Markdown in notectl. Zero new dependencies, code-split, with a lossless HTML fallback for superset features.
---

notectl includes a built-in CommonMark + GFM Markdown engine as a core capability alongside HTML and JSON interop. The engine is zero-dependency, hand-written, and loaded only on demand via `dynamic import()`, so builds that never touch Markdown pay nothing for it.

## Principles

**Postel's law, applied strictly.**
The serializer emits well-formed, round-trippable Markdown. The parser accepts the full range of real-world Markdown including reference links, soft-break folding, and raw HTML blocks. Strict output, liberal input.

**No silent data loss (by default).**
Features with no portable Markdown form (underline, highlight, color, font, video, sized images, etc.) serialize as valid raw HTML inside the Markdown string (`htmlFallback: true`, the default). A renderer that honours raw HTML (GitHub, any CommonMark-compliant renderer) displays them faithfully. Pass `htmlFallback: false` to get guaranteed-portable output at the cost of dropping styling-only formatting.

**Genuine code-splitting.**
The serializer and parser are referenced only via `dynamic import()` from the async web-component methods. A bundle that never calls `getContentMarkdown` or `setContentMarkdown` never receives the engine. A `size-limit` guard on the package enforces this invariant.

## API

### Web Component methods

Both methods are asynchronous: they lazy-import the engine the first time they are called.

```ts
// Export: returns a Markdown string
const markdown: string = await editor.getContentMarkdown();

// Export with options
const portable: string = await editor.getContentMarkdown({ htmlFallback: false });

// Import: replaces document content from Markdown
await editor.setContentMarkdown('# Hello\n\nSome **bold** text.');

// Import with options
await editor.setContentMarkdown(markdown, { extendedInlineSyntax: true });
```

### Standalone subpath

For use outside the web component (server-side rendering, build tools, data pipelines):

```ts
import {
  serializeDocumentToMarkdown,
  parseMarkdownToDocument,
} from '@notectl/core/markdown';

// Synchronous — no dynamic import overhead
const md: string = serializeDocumentToMarkdown(doc);
const doc2 = parseMarkdownToDocument('# Hello');
```

Both functions accept an optional `SchemaRegistry` (for plugin-owned node types) and an options object. They are pure, synchronous functions with no side effects.

### Serialize options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `flavor` | `'commonmark' \| 'gfm'` | `'gfm'` | Dialect to emit. `gfm` adds tables, task lists, strikethrough, and autolinks. |
| `htmlFallback` | `boolean` | `true` | Emit raw HTML for features with no Markdown form (underline, highlight, color, etc.) to keep the round-trip lossless. |
| `headingStyle` | `'atx' \| 'setext'` | `'atx'` | ATX (`# Heading`) or setext (`Heading\n===`) heading style. Setext applies only to levels 1 and 2. |
| `bullet` | `'-' \| '*' \| '+'` | `'-'` | Bullet marker for unordered list items. |
| `emphasis` | `'*' \| '_'` | `'*'` | Delimiter for italic and bold. |
| `codeFence` | `'\`\`\`' \| '~~~'` | `'\`\`\`'` | Fence character for code blocks. The fence is automatically widened if the code contains the fence character. |
| `listIndent` | `number` | `2` | Spaces per indent level for nested lists. |

### Parse options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `flavor` | `'commonmark' \| 'gfm'` | `'gfm'` | Dialect to accept. `gfm` enables GFM tables and task lists. |
| `htmlFallback` | `boolean` | `true` | Parse raw HTML blocks and spans embedded in the Markdown back through the HTML parser, recovering superset features on import. |
| `extendedInlineSyntax` | `boolean` | `false` | Accept Obsidian/Pandoc-style extensions: `==highlight==`, `^sup^`, `~sub~`. These are import-only (single `~` conflicts with `~~` strikethrough and is not portable on output). |
| `syntaxExtensions` | `MarkdownSyntaxExtension[]` | `[]` | Plugin-contributed grammar extensions. When using the web component, extensions registered via `registerMarkdownSyntax` (e.g. the formula plugin's `$...$`) are merged in automatically. |

### Editor configuration

Markdown paste auto-detection is controlled by the `pasteMarkdown` option passed to `createEditor` or `editor.init`:

```ts
import { createEditor } from '@notectl/core';

// Disable Markdown paste — always paste plain text
const editor = await createEditor({
  pasteMarkdown: 'never',
  placeholder: 'Start typing...',
});
```

`pasteMarkdown: 'auto'` is the default and requires no configuration.

| Value | Behaviour |
|-------|-----------|
| `'auto'` (default) | Detects strong block-level Markdown signals in the plain-text clipboard (fenced code, GFM table, a run of two or more list/heading/blockquote markers) and converts to rich content. Stray inline `*` or `_` does not trigger conversion. |
| `'never'` | Always pastes plain text unchanged. |

The detector is synchronous and stays in the base bundle. The heavy parser is dynamically imported only when a positive match is found.

Auto-detection only inspects the plain-text clipboard when there is no usable `text/html`. Code copied from a GUI editor or browser carries HTML and is never reinterpreted. The narrow exception is plain-text code copied from a terminal whose `# ` comments or list-like lines read as Markdown: this is converted as a single, undoable paste. If a field is primarily for pasting plain-text code, set `pasteMarkdown: 'never'`.

## Block mapping table

| Markdown syntax | Block type | Notes |
|----------------|-----------|-------|
| `# H1` through `######  H6` | `heading` (level 1-6) | ATX (default) and setext (levels 1-2 with `headingStyle: 'setext'`) both produced on export; both accepted on import. |
| Plain text paragraph | `paragraph` | Soft line breaks (single `\n`) are folded into a space on import. |
| `> text` | `blockquote` | Recursive nesting. Each line of the serialized children is prefixed with `> `. |
| `- item`, `* item`, `+ item` | `list_item` (bullet) | Nesting via leading spaces (2 per level by default). |
| `1. item`, `2. item`, ... | `list_item` (ordered) | Counters are reset when nesting depth steps back. |
| `- [ ] item`, `- [x] item` | `list_item` (checklist) | Checkbox state is preserved on both import and export. GFM flavor only. |
| `` ``` ``lang`\n...\n` ``` `` | `code_block` | Language string preserved. Fence is widened automatically if code contains the fence character. |
| `---`, `***`, `___` | `horizontal_rule` | Serialized as `---`. |
| `![alt](src "title")` | `image` (block) | Standalone image line. Title optional. Images with explicit width, height, or non-center alignment use an HTML fallback. |
| GFM pipe table | `table` | Column alignment (`left`, `center`, `right`) is read from the delimiter row and preserved on export. Tables with colspan or rowspan cells fall back to raw HTML. |

## Inline mapping table

| Markdown syntax | Mark / inline type | GFM-only |
|----------------|-------------------|----------|
| `**text**` or `__text__` | `bold` | No |
| `*text*` or `_text_` | `italic` | No |
| `~~text~~` | `strikethrough` | Yes |
| `` `code` `` | `code` | No |
| `[text](url "title")` | `link` | No |
| `[text][ref]` / `[ref]` | `link` (reference) | No (import only; exported as inline links) |
| `<https://example.com>` | autolink | No (import only; exported as inline links) |
| `![alt](src)` | `image_inline` | No (mid-paragraph images only; standalone images become block images) |
| `\n` (two trailing spaces or `\` before newline) | `hard_break` | No |
| `$formula$` | `math_inline` (formula plugin) | Plugin must be loaded |
| `$$\nformula\n$$` | `math_display` (formula plugin) | Plugin must be loaded |

### Superset features: HTML fallback vs. graceful degradation

Features that have no portable Markdown form are handled as follows when `htmlFallback` is `true` (default) vs. `false`:

| Feature | `htmlFallback: true` | `htmlFallback: false` |
|---------|---------------------|----------------------|
| Underline | `<u>text</u>` (raw HTML) | Text kept, underline dropped |
| Highlight | `<mark>text</mark>` | Text kept, highlight dropped |
| Text color | `<span style="color: ...">text</span>` | Text kept, color dropped |
| Font family | `<span style="font-family: ...">text</span>` | Text kept, font dropped |
| Font size | `<span style="font-size: ...">text</span>` | Text kept, size dropped |
| Superscript | `<sup>text</sup>` | Text kept, superscript dropped |
| Subscript | `<sub>text</sub>` | Text kept, subscript dropped |
| Sized or aligned image | `<figure><img width="..." ...></figure>` | Plain image `![alt](src)`, styling dropped |
| Title block | `<h1 class="title">...</h1>` | `# title` (level 1 heading) |
| Subtitle block | `<h2 class="subtitle">...</h2>` | `## subtitle` (level 2 heading) |
| Video embed | `<figure data-video="...">...</figure>` | Block removed |
| Table with colspan/rowspan | Full HTML table | Plain GFM table (cell content kept, span dropped) |

With `htmlFallback: true`, the raw HTML embedded in the Markdown string is valid CommonMark — it passes through HTML-aware renderers (GitHub, most CommonMark processors) intact. It is not guaranteed to survive renderers that strip all HTML, such as some static-site Markdown preprocessors. Use `htmlFallback: false` when you need output guaranteed to work in HTML-stripping environments.

A node's lossless round-trip also depends on its owning plugin being loaded at import. For example, the `<figure data-video>` block produced by the video plugin on export is parsed back into a video node only if the video plugin is registered. Without it, the HTML parser has no node spec for the element and it is silently dropped. The same applies to `$formula$` math: the formula plugin contributes the `$...$` / `$$...$$` syntax via `registerMarkdownSyntax`. When using the web component, all registered plugins contribute their extensions automatically; when using the standalone `parseMarkdownToDocument`, pass the same `SchemaRegistry` used to build the document.

## Live Markdown typing

Several feature plugins register input rules that transform Markdown shorthand as you type, without going through the full import parser.

| Type this | And then press... | Result |
|-----------|------------------|--------|
| `# ` | space (at line start) | Heading level 1 |
| `## ` | space (at line start) | Heading level 2 (up to `######`) |
| `**word**` | `*` to close | Bold |
| `*word*` | `*` to close | Italic |
| `~~word~~` | `~` to close | Strikethrough |
| `` `word` `` | `` ` `` to close | Inline code |
| `[text](url)` | `)` to close | Link |
| `$formula$` | `$` to close | Inline math (formula plugin) |
| `$$` | newline | Display math (formula plugin) |

These rules are owned by each feature plugin and controlled by each plugin's `inputRule` config flag (set to `false` to disable). They are best-effort single-line transforms and may diverge from the full import parser in edge cases — the full parser handles multi-line constructs, reference links, and complex nesting that single-line rules cannot.

## Round-trip identity

`setContentMarkdown(await getContentMarkdown())` preserves block identity by reusing existing block IDs in document order. The caret stays stable across a read-write cycle for blocks whose content is unchanged.

```ts
// Safe round-trip: cursor position is preserved for unchanged blocks
const md = await editor.getContentMarkdown();
await editor.setContentMarkdown(md);
```

Identity is matched by position, not by content. This is intentional: the cursor stays on the same block index when content is rewritten in place. Plugins that reference blocks by `BlockId` should not assume content stability across `setContentMarkdown` calls.

Clean Markdown (without embedded block IDs) is the normal case: notectl generates no `data-block-id` annotations in the Markdown output and recognizes none on import. Compare this to the HTML pair, which carries `data-block-id` on every block element for positional matching. Both pairs give the same result; the mechanism differs.

| Pair | Identity carrier |
|------|-----------------|
| `getJSON` / `setJSON` | Block IDs in the JSON tree |
| `getContentHTML` / `setContentHTML` | `data-block-id` attribute (unless opted out) |
| `getContentMarkdown` / `setContentMarkdown` | Position order (IDs matched by index) |
| `getText` / `setText` | Position order |

## Known boundaries

The parser is a pragmatic linear-time scanner, not a complete CommonMark implementation. The following constructs are out of scope:

- **Lazy continuation** — a blockquote or list item whose continuation line omits the leading `> ` or indent marker is not recognized.
- **Indented code blocks** — the four-space indent syntax is not supported; use fenced code blocks instead.
- **Multi-block list items** — a single list item containing multiple paragraphs (blank-line continuation) is not supported. The item body is a single inline content line. Multi-paragraph list items are tracked as a follow-up (#D9).

These boundaries are stable trade-offs of the flat-with-indent list model and the linear-time guarantee. They affect import only; the serializer always produces output that the parser can read back.

<!-- Screenshot: live Markdown typing GIF would go here.
     Generate via: docs-site/screenshots/markdown-live-typing.spec.ts
     Scenario: type `# `, `**bold**`, `~~strike~~` and capture the transformation in a GIF. -->

## Examples

### Export for a static site generator

```ts
// Portable Markdown with no raw HTML — safe for HTML-stripping pipelines
const md = await editor.getContentMarkdown({ htmlFallback: false });
await fs.writeFile('post.md', md);
```

### Import from a file

```ts
const source = await fs.readFile('post.md', 'utf8');
await editor.setContentMarkdown(source);
```

### Server-side rendering

```ts
import { serializeDocumentToMarkdown } from '@notectl/core/markdown';

// Synchronous — no dynamic import, safe in a Node build step
const md: string = serializeDocumentToMarkdown(doc, registry);
```

### Standalone parse in a build tool

```ts
import { parseMarkdownToDocument } from '@notectl/core/markdown';

const doc = parseMarkdownToDocument(markdownSource, registry, {
  extendedInlineSyntax: true, // accept ==highlight==, ^sup^, ~sub~
});
```

### Disable Markdown paste for a plain-text field

```ts
import { createEditor } from '@notectl/core';

const editor = await createEditor({
  pasteMarkdown: 'never',
  placeholder: 'Start typing...',
});
```

### Export with setext headings and asterisk bullets

```ts
const md = await editor.getContentMarkdown({
  headingStyle: 'setext',
  bullet: '*',
  emphasis: '_',
});
```
