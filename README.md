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
[![Bundle Size](https://img.shields.io/badge/core-29kb-orange)](https://www.npmjs.com/package/@notectl/core)

<br />

<img src="e2e/demo.gif" alt="notectl editor demo" width="720" />

<br />

[**Try the Playground**](https://samyssmile.github.io/notectl/playground/) &nbsp;&middot;&nbsp; [Documentation](https://samyssmile.github.io/notectl/) &nbsp;&middot;&nbsp; [npm](https://www.npmjs.com/package/@notectl/core)

</div>

<br />

## 30 seconds to a full editor

```bash
npm install @notectl/core
```

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

That's it. A production-ready editor in 16 lines. No build step required.

<br />

## Why teams choose notectl

<table>
<tr>
<td width="50%">

**Ship faster**

One `<notectl-editor>` tag works in every framework. No wrapper libraries, no adapter boilerplate, no version lock-in.

</td>
<td width="50%">

**Stay lean**

34 KB core. One runtime dependency (DOMPurify). Every feature is a plugin — bundle only what you use.

</td>
</tr>
<tr>
<td>

**Accessible out of the box**

Full keyboard navigation, ARIA roles, screen reader announcements, focus management, high-contrast themes. Not an afterthought — it's the foundation.

</td>
<td>

**Built for control**

Immutable state, step-based transactions, time-travel undo/redo. Every change is traceable, testable, and invertible.

</td>
</tr>
</table>

<br />

## Plugin ecosystem

Every capability is a plugin. Compose exactly the editor you need — nothing more, nothing less.

| Plugin | What you get |
|---|---|
| **TextFormattingPlugin** | Bold, italic, underline |
| **StrikethroughPlugin** | ~~Strikethrough~~ text |
| **HeadingPlugin** | H1 – H6 headings |
| **BlockquotePlugin** | Block quotes |
| **ListPlugin** | Bullet, ordered, and checklists |
| **LinkPlugin** | Hyperlink insertion and editing |
| **TablePlugin** | Full table support with row/column controls |
| **CodeBlockPlugin** | Code blocks with syntax highlighting |
| **TextColorPlugin** | Text color picker |
| **HighlightPlugin** | Text highlighting / background color |
| **AlignmentPlugin** | Left, center, right, justify |
| **FontPlugin** | Font family selection with custom fonts |
| **FontSizePlugin** | Configurable font sizes |
| **HorizontalRulePlugin** | Horizontal dividers |
| **SuperSubPlugin** | Superscript and subscript |
| **PrintPlugin** | Print editor content with configurable options |

See the [plugin documentation](https://samyssmile.github.io/notectl/plugins/overview/) for configuration and examples.

<br />

## Content API

Read and write content in any format:

```ts
editor.getContentHTML();                                        // export as HTML
editor.setContentHTML('<p>Hello <strong>world</strong></p>');    // import HTML
editor.getJSON();                                        // structured JSON
editor.getText();                                        // plain text
editor.isEmpty();                                        // check if empty
```

<br />

## Works with your stack

| | Framework | How |
|---|---|---|
| **Any** | Vanilla JS, React, Vue, Svelte | `<notectl-editor>` Web Component |
| **Angular** | Angular 17+ | [`@notectl/angular`](https://www.npmjs.com/package/@notectl/angular) native integration |

```bash
git clone https://github.com/Samyssmile/notectl.git
cd notectl && pnpm install && pnpm dev
```

See [`examples/vanillajs`](examples/vanillajs) and [`examples/angular`](examples/angular) for full working demos.

<br />

## Contributing

```bash
pnpm install          # install dependencies
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
