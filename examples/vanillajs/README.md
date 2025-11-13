# Notectl Vanilla JavaScript Example

This example demonstrates how simple it is to integrate Notectl into any web application.

## Quick Start

```bash
npm install
npm run dev
```

## The Complete Setup (29 lines!)

```typescript
import { createEditor } from '@notectl/core';
import { createToolbarPlugin } from '@notectl/plugin-toolbar';

// 1. Get container
const host = document.querySelector('#editor-host')!;

// 2. Create editor
const editor = createEditor(host, {
  placeholder: 'Start typing...',
  autofocus: true,
});

// 3. Add toolbar plugin
const toolbar = createToolbarPlugin({
  position: 'top',
  table: { enabled: true },
});

editor.registerPlugin(toolbar);

// Optional: Listen to events (fully type-safe!)
editor.on('change', (data) => {
  console.log('Content changed:', data);
});

editor.on('table:inserted', (data) => {
  console.log('Table inserted:', data.tableId, `${data.rows}x${data.cols}`);
});
```

## Custom Fonts

Das Beispiel lädt den Font jetzt deklarativ über `src/fonts.json`:

```json
{
  "basePath": "/fonts/fira_code_v6_2",
  "fonts": [
    {
      "family": "Fira Code",
      "label": "Fira Code",
      "variants": [
        {
          "weight": 400,
          "sources": [
            { "src": "woff2/FiraCode-Regular.woff2", "format": "woff2" },
            { "src": "woff/FiraCode-Regular.woff", "format": "woff" }
          ]
        }
      ]
    }
  ]
}
```

```typescript
import fontManifest from './fonts.json';

const editor = createEditor(host, {
  fonts: fontManifest,
  appearance: { fontFamily: `'Fira Code', 'Fira Code VF', monospace` },
});

const toolbar = createToolbarPlugin({
  position: 'top',
  fonts: {
    families: fontManifest.fonts.map((font) => ({
      label: font.label ?? font.family,
      value: font.family,
    })),
  },
});
```

Alle @font-face-Regeln werden automatisch erstellt, der Font-Dropdown zeigt den aktiven Font, und zusätzliche Formate (TTF/OTF/WOFF/WOFF2) können jederzeit in der JSON-Datei ergänzt werden.

## HTML (11 lines!)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Notectl Demo</title>
  </head>
  <body>
    <div id="editor-host"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

## Features

- ✅ **Type-safe events** - Full TypeScript autocomplete for all events
- ✅ **Plugin system** - Easy to extend with toolbar, tables, and more
- ✅ **Zero configuration** - Works out of the box
- ✅ **Framework agnostic** - Pure Web Components

## API Highlights

### Create Editor

```typescript
const editor = createEditor(containerElement, {
  placeholder: 'Your placeholder...',
  autofocus: true,
  readonly: false,
});
```

### Add Plugins

```typescript
const toolbar = createToolbarPlugin({
  position: 'top', // or 'bottom'
  sticky: true,
  table: {
    enabled: true,
    config: {
      defaultRows: 3,
      defaultCols: 4,
      allowMerge: true,
      allowSplit: true,
    },
  },
});

await editor.registerPlugin(toolbar);
```

### Listen to Events

```typescript
// Core events
editor.on('change', (data) => console.log(data.state));
editor.on('selection-change', (data) => console.log(data.selection));
editor.on('focus', () => console.log('Editor focused'));

// Plugin events (fully typed!)
editor.on('table:inserted', (data) => {
  console.log(data.tableId, data.rows, data.cols);
});

editor.on('table:row-inserted', (data) => {
  console.log(data.tableId, data.rowIndex, data.position);
});
```

### Get/Set Content

```typescript
// Get content as JSON
const json = editor.getJSON();

// Set content from JSON
editor.setJSON({
  version: 1,
  schemaVersion: '1.0.0',
  children: [
    {
      id: crypto.randomUUID(),
      type: 'paragraph',
      children: [{ type: 'text', text: 'Hello World', marks: [] }],
    },
  ],
});

// Get HTML
const html = editor.getHTML();

// Set HTML
editor.setHTML('<p>Hello World</p>');
```

## That's it!

No complex configuration, no boilerplate - just a clean, type-safe API. 🚀
