---
title: Installation
description: How to install notectl in your project.
---

## Package Manager

Install the core package with your preferred package manager:

```bash
# npm
npm install @notectl/core

# pnpm
pnpm add @notectl/core

# yarn
yarn add @notectl/core

# bun
bun add @notectl/core
```

## Requirements

- **Browser**: Any modern browser with Custom Elements v1 support (Chrome 67+, Firefox 63+, Safari 12.1+, Edge 79+)
- **Node.js**: 18+ (for build tooling only — notectl runs entirely in the browser)
- **TypeScript**: 5.0+ recommended (optional but provides the best DX)

## What's Included

The `@notectl/core` package includes:

- The `<notectl-editor>` Web Component
- All 15 built-in plugins (text formatting, headings, lists, tables, fonts, etc.)
- Full TypeScript type definitions
- ESM and CJS builds

## Bundler Setup

notectl ships as standard ESM. It works out of the box with modern bundlers:

### Vite

No extra configuration needed:

```ts
import { createEditor } from '@notectl/core';
```

### Webpack 5

Ensure your config handles ESM:

```js
// webpack.config.js
module.exports = {
  resolve: {
    extensions: ['.ts', '.js'],
  },
};
```

### CDN (No Bundler)

You can use notectl directly from a CDN for prototyping:

```html
<script type="module">
  import { createEditor } from 'https://esm.sh/@notectl/core';

  const editor = await createEditor({
    placeholder: 'Start typing...',
  });
  document.getElementById('editor').appendChild(editor);
</script>

<div id="editor"></div>
```

## Next Steps

Now that notectl is installed, head to the [Quick Start](/getting-started/quick-start/) guide to create your first editor.
