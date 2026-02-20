---
title: Image Plugin
description: Image block support with file upload, URL input, alignment, and drag-and-drop.
---

The `ImagePlugin` adds image block support with a toolbar button that opens an upload/URL popup, drag-and-drop file handling, and alignment options.

## Usage

```ts
import { ImagePlugin } from '@notectl/core';

new ImagePlugin()
// or with custom config:
new ImagePlugin({
  maxFileSize: 10 * 1024 * 1024, // 10 MB
  acceptedTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'],
  maxWidth: 800,
  resizable: true,
})
```

## Configuration

```ts
interface ImagePluginConfig {
  /** Maximum width in pixels for inserted images. */
  readonly maxWidth: number;
  /** Maximum file size in bytes. */
  readonly maxFileSize: number;
  /** Accepted MIME types for file upload. */
  readonly acceptedTypes: readonly string[];
  /** Enable resize handles on images. */
  readonly resizable: boolean;
  /** Render separator after toolbar item. */
  readonly separatorAfter?: boolean;
}
```

Defaults: `maxWidth: 800`, `maxFileSize: 10 MB`, `acceptedTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']`, `resizable: true`.

## Commands

| Command | Description | Returns |
|---------|-------------|---------|
| `insertImage` | Open the image insertion popup | `boolean` |
| `removeImage` | Remove the currently selected image | `boolean` |

```ts
editor.executeCommand('insertImage');
editor.executeCommand('removeImage');
```

## Toolbar

The image button opens a **custom popup** with:
- A file upload input accepting the configured file types
- A URL input field for remote images
- Upload state feedback during file processing

## Node Spec

| Type | HTML Tag | Attributes | Description |
|------|----------|-----------|-------------|
| `image` | `<figure><img></figure>` | `src`, `alt`, `align`, `width?`, `height?` | Image block (void) |

The image block is a **void block** — it is not editable but can be selected (node selection). The `align` attribute supports `'left'`, `'center'`, and `'right'` with corresponding CSS classes.

## Image Upload Service

Register a custom upload service to handle file uploads:

```ts
import { IMAGE_UPLOAD_SERVICE } from '@notectl/core';

const uploadService: ImageUploadService = {
  upload: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await response.json();
    return { url: data.url };
  },
};

context.registerService(IMAGE_UPLOAD_SERVICE, uploadService);
```

Without a registered upload service, images are inserted as blob URLs (suitable for development).

## File Handling

The plugin registers a file handler for `image/*` MIME types. This enables:
- **Drag-and-drop**: Drop image files directly into the editor
- **Paste**: Paste images from the clipboard

## Custom Node View

The image block uses a custom `NodeView` for:
- Upload progress state visualization
- Blob URL lifecycle management (automatic cleanup on destroy)
- Responsive image sizing with width/height preservation
