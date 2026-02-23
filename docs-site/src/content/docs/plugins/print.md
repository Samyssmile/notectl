---
title: Print Plugin
description: Print editor content with clean output, customizable styles, headers/footers, and programmatic HTML export.
---

The `PrintPlugin` adds print functionality to the editor. It renders a clean print preview via a hidden iframe — stripping the toolbar, selection highlights, and interactive elements — so only the document content is printed.

## Usage

```ts
import { PrintPlugin } from '@notectl/core';

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

## PrintService API

The plugin registers a `PrintService` accessible via the service key. Use this for programmatic access without the toolbar button.

```ts
import { PRINT_SERVICE_KEY } from '@notectl/core';

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
import { BEFORE_PRINT, AFTER_PRINT } from '@notectl/core';

// Modify options or cancel before printing
editor.on(BEFORE_PRINT, (event) => {
  event.options = { ...event.options, title: 'Custom Title' };
  // event.cancelled = true; // cancel the print
});

// Access the generated HTML after printing
editor.on(AFTER_PRINT, (event) => {
  console.log('Printed HTML length:', event.html.length);
});
```

| Event | Payload | Description |
|-------|---------|-------------|
| `BEFORE_PRINT` | `{ options: PrintOptions, cancelled: boolean }` | Fired before print. Mutate `options` or set `cancelled = true`. |
| `AFTER_PRINT` | `{ html: string }` | Fired after HTML generation with the final HTML string. |

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
- **Applies** block filters (exclusion, page breaks)
- **Inserts** header/footer elements

## CSS Customization

Use `data-notectl-no-print` on any element to exclude it from print output:

```html
<div data-notectl-no-print>This won't appear in print</div>
```

The plugin generates `@media print` rules that handle code block wrapping, image page breaks, and table layout. Additional styles can be injected via `customCSS`.
