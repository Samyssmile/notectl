---
title: Print Plugin
description: Print editor content with clean output, customizable styles, headers/footers, and programmatic HTML export.
---

The `PrintPlugin` adds print functionality to the editor. It renders a clean print preview via a hidden iframe — stripping the toolbar, selection highlights, and interactive elements — so only the document content is printed.

## Usage

```ts
import { PrintPlugin } from '@notectl/core/plugins/print';

new PrintPlugin()
// or with custom config:
new PrintPlugin({
  defaults: { title: 'My Document', margin: '2cm' },
  keyBinding: 'Mod-Shift-P',
  showToolbarItem: true,
})
```

## Configuration

### PrintPluginConfig

```ts
interface PrintPluginConfig {
  /** Default options applied to every print() call. */
  readonly defaults?: PrintOptions;
  /** Keyboard shortcut (default: 'Mod-P' = Ctrl+P / Cmd+P). */
  readonly keyBinding?: string;
  /** Show toolbar button (default: true). */
  readonly showToolbarItem?: boolean;
  /** Custom locale strings. */
  readonly locale?: PrintLocale;
}
```

### PrintOptions

```ts
interface PrintOptions {
  /** Page title shown in the browser print dialog. */
  readonly title?: string;
  /** Additional CSS appended to the print stylesheet. */
  readonly customCSS?: string;
  /** Header HTML inserted at the top of the print document. */
  readonly header?: string | (() => string);
  /** Footer HTML inserted at the bottom of the print document. */
  readonly footer?: string | (() => string);
  /** Page margins as CSS value (e.g. '2cm'). */
  readonly margin?: string;
  /** Force page break before these block types. */
  readonly pageBreakBefore?: readonly NodeTypeName[];
  /** Exclude these block types from print output. */
  readonly excludeBlockTypes?: readonly NodeTypeName[];
  /** Print background colors and images. */
  readonly printBackground?: boolean;
  /** Page orientation. */
  readonly orientation?: 'portrait' | 'landscape';
  /** Paper size for @page CSS rule. Overrides default A4. */
  readonly paperSize?: PaperSize;
}
```

## Commands

| Command | Description | Returns |
|---------|-------------|---------|
| `print` | Open the browser print dialog with clean editor content | `boolean` |

```ts
editor.executeCommand('print');
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+P` / `Cmd+P` | Print |

The shortcut can be customized via `keyBinding` in the plugin config.

## Toolbar

The print button is registered in the `actions` toolbar group. It is shown by default (controlled by the `showToolbarItem` config option).

## PrintService API

The plugin registers a `PrintService` accessible via the service key. Use this for programmatic access without the toolbar button.

```ts
import { PRINT_SERVICE_KEY } from '@notectl/core/plugins/print';

// Get the service from the editor
const printService = editor.getService(PRINT_SERVICE_KEY);

// Open browser print dialog
printService.print({ title: 'Invoice', margin: '1.5cm' });

// Generate print-ready HTML string (for server-side PDF generation)
const html: string = printService.toHTML({
  title: 'Report',
  orientation: 'landscape',
  customCSS: '.highlight { background: yellow; }',
});
```

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `print` | `(options?: PrintOptions) => void` | Opens the browser print dialog with clean content |
| `toHTML` | `(options?: PrintOptions) => string` | Returns a complete HTML document string for server-side PDF generation |

## Events

The plugin emits events before and after printing, allowing you to modify options or cancel the print.

```ts
import { BEFORE_PRINT, AFTER_PRINT } from '@notectl/core/plugins/print';

// Modify options or cancel before printing
editor.onPluginEvent(BEFORE_PRINT, (event) => {
  event.options = { ...event.options, title: 'Custom Title' };
  // event.cancelled = true; // cancel the print
});

// Access the generated HTML after printing
editor.onPluginEvent(AFTER_PRINT, (event) => {
  console.log('Printed HTML length:', event.html.length);
});
```

| Event | Payload | Description |
|-------|---------|-------------|
| `BEFORE_PRINT` | `{ options: PrintOptions, cancelled: boolean }` | Fired before print. Mutate `options` or set `cancelled = true`. |
| `AFTER_PRINT` | `{ html: string }` | Fired after HTML generation with the final HTML string. |

## WYSIWYG Print with Paper Size

When the editor has a [`paperSize`](/notectl/guides/paper-size/) configured, the print output automatically matches the editor layout pixel-for-pixel:

- The `@page` rule uses the correct paper size keyword (e.g. `A4`, `letter`)
- Page margins are set to zero with document margins applied as content padding
- Typography (font, size, line height) is preserved from the editor

No extra configuration is needed — the editor injects `paperSize` into the print options automatically via the `BEFORE_PRINT` event.

```ts
import { createEditor, PaperSize } from '@notectl/core';
import { PrintPlugin } from '@notectl/core/plugins/print';

const editor = await createEditor({
  paperSize: PaperSize.DINA4,
  toolbar: [[new PrintPlugin()]],
});

// Ctrl+P / Cmd+P — print output matches the editor 1:1
```

## Configuration Examples

### Headless (no toolbar button)

```ts
new PrintPlugin({ showToolbarItem: false })
```

The `PrintService` is still available via `editor.getService(PRINT_SERVICE_KEY)` for programmatic use.

### Custom margins and orientation

```ts
new PrintPlugin({
  defaults: {
    margin: '1.5cm',
    orientation: 'landscape',
    printBackground: true,
  },
})
```

### Headers and footers

```ts
new PrintPlugin({
  defaults: {
    header: '<div style="text-align:center;font-size:10px">Confidential</div>',
    footer: () => `<div style="text-align:right;font-size:9px">Printed: ${new Date().toLocaleDateString()}</div>`,
  },
})
```

### Exclude block types and force page breaks

```ts
new PrintPlugin({
  defaults: {
    excludeBlockTypes: ['horizontal_rule'],
    pageBreakBefore: ['heading'],
  },
})
```

## Print Content Preparation

The plugin automatically prepares content for print:

- **Clones** the editor content (original DOM is never modified)
- **Removes** `contenteditable`, selection classes, and placeholder text
- **Collects** all editor styles including adopted stylesheets and theme tokens
- **Carries** host page [CSS Shadow Part](/notectl/guides/styling/#shadow-parts) styling into print (see below)
- **Applies** block filters (exclusion, page breaks)
- **Inserts** header/footer elements

## CSS Customization

Use `data-notectl-no-print` on any element to exclude it from print output:

```html
<div data-notectl-no-print>This won't appear in print</div>
```

The plugin generates `@media print` rules that handle code block wrapping, image page breaks, and table layout. Additional styles can be injected via `customCSS`.

### Shadow Part styling in print

Styling you apply through the exposed [CSS Shadow Parts](/notectl/guides/styling/#shadow-parts) is carried into print automatically, so the printed page matches the editor:

```css
/* Applies both in the editor and in print output. */
notectl-editor::part(table-cell) {
  padding: 0;
}
```

The print document preserves the editor's shadow boundary using Declarative Shadow DOM: the cloned content lives in a real shadow root, and the host page's stylesheets are copied verbatim into the print document (inside a `notectl-host` cascade layer). `::part()` selectors, selector specificity, custom properties (`var(--...)`), `@media`/`@supports`/`@layer` conditions, CSS nesting, and `@import` chains therefore behave exactly as in the live editor. Stylesheets from enclosing shadow roots are included, cross-origin stylesheets are re-referenced via `@import` so the print document loads them itself (in the `print()` iframe and in standalone-rendered exports; a page that merely embeds `toHTML()` output never loads them, see the embedding notes below), and disabled stylesheets are skipped. Relative `url()` references (fonts, background images) are rewritten to absolute URLs against their stylesheet's location, so they keep resolving from the print document. An `@import`'s own `layer(...)` assignment and `supports(...)` condition survive the copy as well, so layered-import cascade results match the live page. When the editor runs under a strict CSP with a style nonce, the nonce is applied to the styles of the transient print iframe; the HTML returned by `toHTML()` (and broadcast via `AFTER_PRINT`) deliberately never contains the nonce — it is a per-session secret that must not be persisted, so apply your own current nonce when embedding that output under a strict CSP.

Host-page rules that style the editor widget itself (for example `notectl-editor { height: 400px; border: 1px solid }`) are neutralized in print, so screen chrome never constrains the paginated output. The same applies to page-level hiding and clipping from the host page, such as the classic `@media print { body * { visibility: hidden } }` pattern or an app shell's `html, body { height: 100%; overflow: hidden }`, and to screen scroll constraints on the content area (`--notectl-content-max-height` or `::part(content)` height rules): print always flows the full document. All of these guards, and the forced light theme, hold even against `!important` host rules. With the default `forceLightTheme: true`, theme-conditional rules such as `html.dark notectl-editor::part(...)` stay inactive; with `forceLightTheme: false` the page's theme context (`class` and `data-*` attributes on `<html>` and `<body>`) is carried, so they apply exactly as live, and the printed page's background is pinned to the background the editor content visually sits on (so a dark theme prints dark instead of light text on white paper). Theme tokens set as inline style on the editor element, `<html>`, or `<body>` (the way runtime theme switchers work) are re-emitted inline on the replicated elements, keeping their live precedence over every copied stylesheet rule. In addition, all computed `--notectl-*` tokens are snapshotted onto the replica, so tokens coming from rules on wrapper elements (which do not exist in the print document) keep their live values instead of falling back to defaults. The snapshot pins what the user saw; a host page that wants a print-specific token override must mark it `!important` (or use `customCSS`).

The editor's own base styles sit in a `@layer notectl-base` cascade layer inside the shadow root, so `customCSS` overrides the editor's built-in element styling regardless of selector specificity. The flip side: broad `customCSS` resets such as `* { margin: 0; padding: 0 }` also beat every base rule and will collapse list indents and table cell padding, so scope print resets to the elements you actually mean. `customCSS` is applied both at document level (for `@page` or `body` rules) and inside the editor's shadow root (for content rules such as `[part~="table-cell"]`). Host-page `::part()` rules rank above `customCSS` for the same property, exactly as in the live editor. To deliberately restyle the print host element itself (for example give it a border back) or override the forced light theme tokens, mark those `customCSS` declarations `!important`: they are the strongest rules in the print document and win over both the neutralization and any host rule.

Not carried: rules that reach the editor through a wrapper component's `exportparts`, `@container` conditions whose container elements only exist on the host page, and rules scoped to ancestor elements of the editor (for example `.dashboard-card notectl-editor::part(table-cell)`): the print document replicates only the host element, so a wrapper-scoped selector has nothing to match. Use an unscoped `notectl-editor::part(...)` rule (or `customCSS`) for styling that must survive into print.

Note for embedding the `toHTML()` output: the returned document uses Declarative Shadow DOM and is built to be embed-safe. All of its inline styles are qualified with the replica marker (`notectl-editor[data-notectl-static]`), and everything page-level (the copied host CSS, hoisted `@import`s, `html`/`body`/`@page` rules, `:root` tokens, the page-level `customCSS` copies) ships inside an inert `<template data-notectl-print-styles>` bundle. The embedded fallback script activates that bundle only when the export is rendered as its own document (file, iframe `document.write`/`srcdoc`, HTML-to-PDF engines), detected via a marker `<meta>` that only then sits in `document.head`. Injecting the output into an existing page therefore cannot restyle the page, hide or re-theme live editors, or load foreign stylesheets. Two things do carry over on embedding by nature of the platform: the editor's typed custom properties (`@property` registrations apply document-wide, which can change how `--notectl-*` values serialize, never their color), and the content itself. When embedding into the page that styles the editor, host `::part()` rules apply to the embedded replica natively, exactly like to the live editor. Rendering paths: an iframe (`document.write`, `srcdoc`) or a new window gets full page fidelity via the script-activated bundle; `setHTMLUnsafe()` parses the declarative shadow root for a faithful inline preview; plain `innerHTML` parses neither declarative shadow roots nor scripts and renders the built-in static fallback, a statically styled light-DOM copy. All paths are safe even in a page that has `<notectl-editor>` registered: the component defers shadow-root creation out of its constructor, so the declarative root attaches even when the bundle is loaded as a classic script in `<head>` before the markup is parsed, and the `data-notectl-static` marker keeps the replica static (calling `init()` on such a replica throws; if the marker gets stripped by a sanitizer, the element boots a clean, empty editor instead of stacking one below the print markup). Consumers relying on scripts without Declarative Shadow DOM support (older WebViews, PDF engines) get the shadow root attached by the fallback script, which is strictly scoped to marked replicas and never touches the embedding page's own templates; engines without scripts keep the static fallback, and a no-script standalone rendering falls back to the replica-scoped baseline styles (readable output without host `::part()` fidelity or `@page` setup). Note that the raw HTML string contains the content twice (shadow template plus static fallback) — text extractors operating on the string rather than a rendered DOM should read only the `<template shadowrootmode>` content.

## Requirements

The PrintPlugin requires the editor to be inside a **ShadowRoot** (which is the default when using `<notectl-editor>`). If the editor is used outside a ShadowRoot, the print service will be a no-op.
