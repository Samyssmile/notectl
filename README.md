<div align="center">

# notectl

### The rich text editor that gets out of your way.

A modular, accessible rich text editor — shipped as a Web Component.
Use what you need, nothing more.

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Web Component](https://img.shields.io/badge/Web_Component-%3Cnotectl--editor%3E-purple)](https://developer.mozilla.org/en-US/docs/Web/API/Web_components)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@notectl/core)](https://www.npmjs.com/package/@notectl/core)

<br />

<img src="docs-site/src/assets/screenshots/hero-editor-rich.png" alt="notectl editor with rich content" width="720" />

[Documentation](https://samyssmile.github.io/notectl/) &bull; [Playground](https://samyssmile.github.io/notectl/playground/) &bull; [npm](https://www.npmjs.com/package/@notectl/core)

</div>

<br />

**Try it live** — [Open the playground](https://samyssmile.github.io/notectl/playground/) (no install required)

<br />

## Why notectl?

- **Web Component** — drop `<notectl-editor>` into React, Vue, Svelte, Angular, or plain HTML
- **Plugin architecture** — every feature is a plugin; add only what you need
- **Accessible by default** — full keyboard navigation, ARIA roles and labels, screen reader support
- **Immutable state** — predictable updates, time-travel undo/redo, zero mutation bugs
- **Native Angular integration** — available as [`@notectl/angular`](https://www.npmjs.com/package/@notectl/angular)
- **Single dependency** — only DOMPurify at runtime

<br />

## Quick Start

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

A full-featured editor in 16 lines.

<br />

## Accessibility

notectl is built with accessibility as a first-class concern, not an afterthought.

- Full **keyboard navigation** — every feature reachable without a mouse
- Semantic **ARIA roles and labels** on all interactive elements
- Proper **focus management** across toolbar, dialogs, and editor content
- **Screen reader** friendly — announces formatting changes and editor state
- **High-contrast** compatible with `ThemePreset.Light` and `ThemePreset.Dark`

<br />

## Plugins

Every capability is a plugin. Compose exactly the editor you need.
See the [plugin documentation](https://samyssmile.github.io/notectl/) for configuration details and examples.

| Plugin | What it does |
|---|---|
| **TextFormattingPlugin** | Bold, italic, underline |
| **StrikethroughPlugin** | ~~Strikethrough~~ text |
| **HeadingPlugin** | H1 – H6 headings |
| **BlockquotePlugin** | Block quotes |
| **ListPlugin** | Bullet and ordered lists |
| **LinkPlugin** | Hyperlink insertion and editing |
| **TablePlugin** | Full table support with row/column controls |
| **TextColorPlugin** | Text color picker |
| **HighlightPlugin** | Text highlighting / background color |
| **AlignmentPlugin** | Left, center, right, justify |
| **FontPlugin** | Font family selection with custom fonts |
| **FontSizePlugin** | Configurable font sizes |
| **HorizontalRulePlugin** | Horizontal dividers |
| **SuperSubPlugin** | Superscript and subscript |

<br />

## Full Working Examples

See notectl in action with every plugin, custom fonts, and the complete API:

- [`examples/vanillajs`](examples/vanillajs) — Vanilla JavaScript
- [`examples/angular`](examples/angular) — Angular with `@notectl/angular`

```bash
git clone https://github.com/Samyssmile/notectl.git
cd notectl && pnpm install && pnpm dev
```

<br />

## Content API

```ts
editor.getHTML();                                        // read HTML
editor.setHTML('<p>Hello <strong>world</strong></p>');    // write HTML
editor.getJSON();                                        // read JSON
editor.getText();                                        // read plain text
editor.isEmpty();                                        // check if empty
```

<br />

## Documentation

Full guides, API reference, and plugin docs are available at **[samyssmile.github.io/notectl](https://samyssmile.github.io/notectl/)**.

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

## License

[MIT](LICENSE)
