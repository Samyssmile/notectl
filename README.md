<div align="center">

<br />

# notectl

### Drop one tag. Get a full editor.

`<notectl-editor>` — the rich text editor that works everywhere.<br />
React, Vue, Angular, Svelte, or plain HTML. Zero config, full power.

<br />

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Web Component](https://img.shields.io/badge/Web_Component-%3Cnotectl--editor%3E-purple)](https://developer.mozilla.org/en-US/docs/Web/API/Web_components)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@notectl/core)](https://www.npmjs.com/package/@notectl/core)
[![Bundle Size](https://img.shields.io/badge/gzip-~40kb-orange)](https://www.npmjs.com/package/@notectl/core)

<br />

<img src="e2e/demo.gif" alt="notectl editor demo" width="720" />

<br />

[**Try the Playground**](https://samyssmile.github.io/notectl/playground/) &nbsp;&middot;&nbsp; [Documentation](https://samyssmile.github.io/notectl/) &nbsp;&middot;&nbsp; [npm](https://www.npmjs.com/package/@notectl/core)

</div>

<br />

## Quick Start

```bash
npm install @notectl/core
```

### Preset — full editor in 5 lines

```ts
import { createEditor, createFullPreset, ThemePreset } from '@notectl/core';

const editor = await createEditor({
  ...createFullPreset(),
  theme: ThemePreset.Light,
  placeholder: 'Start typing...',
});

document.body.appendChild(editor);
```

All 17 plugins, toolbar groups, and keyboard shortcuts — ready to go.

### Custom — pick exactly what you need

```ts
import {
  createEditor,
  ThemePreset,
  TextFormattingPlugin,
  HeadingPlugin,
  ListPlugin,
  LinkPlugin,
  TablePlugin,
} from '@notectl/core';

const editor = await createEditor({
  theme: ThemePreset.Light,
  toolbar: [
    [new TextFormattingPlugin({ bold: true, italic: true, underline: true })],
    [new HeadingPlugin()],
    [new ListPlugin()],
    [new LinkPlugin(), new TablePlugin()],
  ],
  placeholder: 'Start typing...',
  autofocus: true,
});

document.body.appendChild(editor);
```

<br />

## Why notectl

<table>
<tr>
<td width="50%">

**CSP-compliant — zero inline styles**

The only editor with a built-in CSP-safe rendering pipeline. All styles go through `adoptedStyleSheets` with reference-counted token management. Works with `style-src 'self'` — no `unsafe-inline` needed. ProseMirror, TipTap, Slate, Lexical, Quill all write inline styles.

</td>
<td width="50%">

**One dependency**

The entire editor — state engine, reconciler, plugin system, toolbar, undo/redo, selection sync — is built from scratch with a single production dependency (DOMPurify for HTML sanitization). Tree-shakeable plugin architecture: bundle only what you use.

</td>
</tr>
<tr>
<td>

**True Web Component**

Shadow DOM encapsulation, reactive attributes, framework-agnostic by design. One `<notectl-editor>` tag works in React, Vue, Angular, Svelte, or plain HTML. No wrappers, no adapters, no version lock-in.

</td>
<td>

**Plugin system with full lifecycle**

Dependency-resolved initialization (topological sort), per-plugin teardown tracking, type-safe inter-plugin services via `ServiceKey<T>`, priority-ordered middleware, error isolation. Plugins can't crash the editor or leak memory.

</td>
</tr>
</table>

<br />

## Plugin Ecosystem

Every capability is a plugin. Compose exactly the editor you need.

| Plugin | What you get |
|---|---|
| **TextFormattingPlugin** | Bold, italic, underline |
| **StrikethroughPlugin** | ~~Strikethrough~~ text |
| **SuperSubPlugin** | Superscript and subscript |
| **HeadingPlugin** | H1 – H6 headings with block type picker |
| **BlockquotePlugin** | Block quotes |
| **ListPlugin** | Bullet, ordered, and checklists |
| **LinkPlugin** | Hyperlink insertion and editing |
| **TablePlugin** | Full table support with row/column controls |
| **CodeBlockPlugin** | Code blocks with syntax highlighting |
| **ImagePlugin** | Image upload, resize, and drag-and-drop |
| **TextColorPlugin** | Text color picker |
| **HighlightPlugin** | Text highlighting / background color |
| **AlignmentPlugin** | Left, center, right, justify |
| **FontPlugin** | Font family selection with custom web fonts |
| **FontSizePlugin** | Configurable font sizes |
| **HorizontalRulePlugin** | Horizontal dividers |
| **PrintPlugin** | Print editor content with configurable paper sizes |

See the [plugin documentation](https://samyssmile.github.io/notectl/plugins/overview/) for configuration and examples.

<br />

## Built-in Features

- **Themes** — Dark and Light presets, or create fully custom themes
- **i18n** — 8 languages: English, German, Spanish, French, Chinese, Russian, Arabic, Hindi + auto-detect via `Locale.BROWSER`
- **Paper sizes** — DIN A4, DIN A5, US Letter, US Legal for WYSIWYG page layout
- **CSP-compliant** — Style delivery via `adoptedStyleSheets`, no inline styles required
- **Markdown shortcuts** — `#` → H1, `##` → H2, `-` → bullet list, `1.` → ordered list, `>` → blockquote
- **Syntax highlighting** — Pluggable highlighter for code blocks

<br />

## Content API

Read and write content in any format:

```ts
editor.getContentHTML();                                     // export as HTML
editor.setContentHTML('<p>Hello <strong>world</strong></p>'); // import HTML
editor.getJSON();                                            // structured JSON
editor.setJSON(doc);                                         // import JSON
editor.getText();                                            // plain text
editor.isEmpty();                                            // check if empty
```

<br />

## Works with your stack

| | Framework | How |
|---|---|---|
| **Any** | Vanilla JS, React, Vue, Svelte | `<notectl-editor>` Web Component |
| **Angular** | Angular 17+ | [`@notectl/angular`](https://www.npmjs.com/package/@notectl/angular) native integration |

See [`examples/vanillajs`](examples/vanillajs) and [`examples/angular`](examples/angular) for full working demos.

<br />

## Contributing

```bash
git clone https://github.com/Samyssmile/notectl.git
cd notectl && pnpm install
pnpm build            # build all packages
pnpm test             # run unit tests
pnpm test:e2e         # run e2e tests
pnpm lint             # lint
```

<br />

<div align="center">

**[Get started](https://samyssmile.github.io/notectl/)** &nbsp;&middot;&nbsp; **[Open the playground](https://samyssmile.github.io/notectl/playground/)** &nbsp;&middot;&nbsp; **[View on npm](https://www.npmjs.com/package/@notectl/core)**

MIT License

</div>
