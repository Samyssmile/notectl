# Notectl - An API Driven Rich Text Editor

> **Status:** Early Development (v0.0.6) - API may change

Notectl is a powerful and flexible rich text editor designed to provide an intuitive user experience while leveraging
the capabilities of modern web technologies. It is built with a focus on extensibility, allowing developers to easily
integrate it into their applications and customize its functionality to meet specific needs.

**Main Goal:** Provide a type-safe, extensible Web Component that delivers a modern rich text editor experience without
depending on framework-specific wrappers.

![img.png](img.png)

## 🚀 Quick Start

### Installation

```bash
# Core editor (Web Component)
npm install @notectl/core

# Toolbar plugin (formatting, tables, history, etc.)
npm install @notectl/plugin-toolbar

> Table creation, keyboard navigation, and the contextual menu now live inside the toolbar plugin. Use `createToolbarPlugin({ table: { enabled: boolean, config } })` to turn them on/off or override defaults.
```

## Fonts

Schriften lassen sich jetzt vollständig deklarativ laden – keine manuellen `@font-face`-Snippets mehr nötig.

1. **Assets bereitstellen**: Lege deine TTF/OTF/WOFF/WOFF2-Dateien z. B. im `public/fonts` Ordner ab.
2. **JSON-Manifest erzeugen** (Pfad ist relativ zu `basePath`):

```json
{
  "basePath": "/fonts/fira_code",
  "fonts": [
    {
      "family": "Fira Code",
      "label": "Fira Code",
      "variants": [
        {
          "weight": 400,
          "style": "normal",
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

3. **Manifest an den Editor übergeben**:

```typescript
import fontManifest from './fonts.json';
import { createEditor } from '@notectl/core';
import { createToolbarPlugin } from '@notectl/plugin-toolbar';

const editor = createEditor(container, {
  fonts: fontManifest,
  appearance: { fontFamily: `'Fira Code', monospace` },
});

const toolbar = createToolbarPlugin(); // Font-Dropdown wird automatisch erweitert
```

Notectl erzeugt daraus `@font-face`-Regeln, lädt die Dateien und synchronisiert die Toolbar: Der Font-Dropdown zeigt jederzeit den tatsächlich aktiven Font an.
