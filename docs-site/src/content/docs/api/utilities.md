---
title: Utility Types
description: Branded types, attribute registries, event/service keys, grapheme utilities, HTML helpers, paper sizes, and i18n.
---

Utility types and functions used across the notectl codebase. These are grouped here because each individual API surface is small.

## Branded Types

Nominal types that prevent accidentally passing a raw `string` where a specific identifier is expected. Built on TypeScript's branded type pattern.

```ts
import { blockId, nodeType, markType, inlineType, pluginId, commandName } from '@notectl/core';
```

| Type | Factory Function | Example |
|------|-----------------|---------|
| `BlockId` | `blockId(id)` | `blockId('b1')` |
| `NodeTypeName` | `nodeType(name)` | `nodeType('heading')` |
| `MarkTypeName` | `markType(name)` | `markType('bold')` |
| `InlineTypeName` | `inlineType(name)` | `inlineType('emoji')` |
| `PluginId` | `pluginId(id)` | `pluginId('my-plugin')` |
| `CommandName` | `commandName(name)` | `commandName('toggleBold')` |

Each factory returns the input string cast to the branded type. They are zero-cost at runtime.

---

## Attribute Registries

Module-augmentable interfaces that let plugins declare type-safe block, mark, and inline node attributes.

### NodeAttrRegistry

```ts
interface NodeAttrRegistry {
  paragraph: { align?: BlockAlignment };
}
```

Plugins augment this to add their own types:

```ts
declare module '@notectl/core' {
  interface NodeAttrRegistry {
    heading: { level: number };
    code_block: { language: string };
  }
}
```

### MarkAttrRegistry

```ts
interface MarkAttrRegistry {
  bold: Record<string, never>;
  italic: Record<string, never>;
  underline: Record<string, never>;
}
```

Augment for marks with attributes:

```ts
declare module '@notectl/core' {
  interface MarkAttrRegistry {
    link: { href: string; title?: string };
    textColor: { color: string };
  }
}
```

### InlineNodeAttrRegistry

```ts
interface InlineNodeAttrRegistry {
  // Augment per inline node type
}
```

### Type Helpers

| Type | Description |
|------|-------------|
| `NodeAttrsFor<T>` | Resolves to `NodeAttrRegistry[T]` for known types, `Record<string, unknown>` otherwise |
| `MarkAttrsFor<T>` | Resolves to `MarkAttrRegistry[T]` for known types, `Record<string, unknown>` otherwise |
| `InlineNodeAttrsFor<T>` | Resolves to `InlineNodeAttrRegistry[T]` for known types, `Record<string, unknown>` otherwise |

### Type Guards

```ts
import { isNodeOfType, isMarkOfType, isInlineNodeOfType } from '@notectl/core';
```

| Function | Signature | Description |
|----------|-----------|-------------|
| `isNodeOfType` | `<T>(node, type) => node is ...` | Narrows `BlockNode` to a specific type with typed attrs |
| `isMarkOfType` | `<T>(mark, type) => mark is ...` | Narrows `Mark` to a specific type with typed attrs |
| `isInlineNodeOfType` | `<T>(node, type) => node is ...` | Narrows `InlineNode` to a specific type with typed attrs |

**Example:**

```ts
if (isNodeOfType(block, 'heading')) {
  block.attrs.level; // number — type-safe
}
```

### BlockAlignment

```ts
type BlockAlignment = 'left' | 'center' | 'right' | 'justify';
```

---

## EventKey & ServiceKey

Type-safe keys for the plugin event bus and service registry. See also [Plugin Interface](/notectl/api/plugin-interface/#type-safe-keys).

### EventKey

```ts
import { EventKey } from '@notectl/core';

const SearchChanged = new EventKey<{ query: string }>('search-changed');
```

### ServiceKey

```ts
import { ServiceKey } from '@notectl/core';

interface SpellChecker { check(text: string): string[]; }
const SpellCheckerKey = new ServiceKey<SpellChecker>('spell-checker');
```

---

## EventBus

Standalone event bus class. See [Plugin Interface](/notectl/api/plugin-interface/#eventbus) for full API.

```ts
import { EventBus } from '@notectl/core';

const bus = new EventBus();
const unsub = bus.on(SearchChanged, (payload) => {
  console.log(payload.query); // type-safe
});
bus.emit(SearchChanged, { query: 'hello' });
unsub();
```

---

## Grapheme Utilities

Unicode-aware functions for traversing text by grapheme cluster (not code unit). Essential for correct cursor movement with emoji, combining characters, and other multi-code-unit graphemes.

```ts
import { nextGraphemeSize, prevGraphemeSize } from '@notectl/core';
```

### `nextGraphemeSize(text, offset)`

Returns the number of UTF-16 code units in the grapheme cluster starting at `offset`:

```ts
nextGraphemeSize('Hello', 0);   // 1 (H)
nextGraphemeSize('👨‍👩‍👧', 0);  // 8 (family emoji)
```

### `prevGraphemeSize(text, offset)`

Returns the number of UTF-16 code units in the grapheme cluster ending at `offset`:

```ts
prevGraphemeSize('Hello', 5);   // 1 (o)
```

---

## HTML Utilities

### `escapeHTML(text)`

Escapes `&`, `<`, `>`, and `"` for safe HTML insertion:

```ts
import { escapeHTML } from '@notectl/core';

escapeHTML('<script>alert("xss")</script>');
// '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
```

### `formatHTML(html, indent?)`

Pretty-prints HTML with indentation for block-level elements:

```ts
import { formatHTML } from '@notectl/core';

formatHTML('<div><p>Hello</p></div>');
// '<div>\n  <p>Hello</p>\n</div>'
```

The default indent is two spaces.

---

## Paper Size

Types and utilities for paper dimensions, used by the print plugin and paper mode.

```ts
import { PaperSize, getPaperDimensions, getPaperCSSSize, isValidPaperSize } from '@notectl/core';
```

### PaperSize

```ts
const PaperSize = {
  DINA4: 'din-a4',
  DINA5: 'din-a5',
  USLetter: 'us-letter',
  USLegal: 'us-legal',
} as const;

type PaperSize = 'din-a4' | 'din-a5' | 'us-letter' | 'us-legal';
```

### PaperDimensions

```ts
interface PaperDimensions {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly widthPx: number;
  readonly heightPx: number;
}
```

### Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `getPaperDimensions` | `(size: PaperSize) => PaperDimensions` | Get dimensions in mm and px |
| `getPaperCSSSize` | `(size: PaperSize) => string` | Get CSS `@page size` value (e.g. `'210mm 297mm'`) |
| `isValidPaperSize` | `(value: string) => value is PaperSize` | Type guard for PaperSize values |

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `PAPER_MARGIN_TOP_PX` | `48` | Top margin in paper mode |
| `PAPER_MARGIN_HORIZONTAL_PX` | `56` | Horizontal margins in paper mode |
| `PAPER_VIEWPORT_PADDING_PX` | `24` | Viewport padding around paper |

---

## Internationalization (i18n)

### Locale

Supported locale identifiers:

```ts
const Locale = {
  EN: 'en',
  DE: 'de',
  ES: 'es',
  FR: 'fr',
  ZH: 'zh',
  RU: 'ru',
  AR: 'ar',
  HI: 'hi',
  PT: 'pt',
  BROWSER: 'browser',
} as const;

type Locale = 'en' | 'de' | 'es' | 'fr' | 'zh' | 'ru' | 'ar' | 'hi' | 'pt' | 'browser';
```

Use `Locale.BROWSER` to auto-detect from `navigator.language`.

### LocaleService

Service that provides the current locale to plugins:

```ts
import { LocaleService, LocaleServiceKey } from '@notectl/core';

const service = new LocaleService('en');
service.getLocale(); // 'en'
```

Access from a plugin:

```ts
const locale = context.getService(LocaleServiceKey);
if (locale) {
  const lang = locale.getLocale();
}
```

### `getBlockTypeLabel(typeName, attrs?)`

Returns a human-readable label for a block type name. Used internally by the announcer for screen reader output.

```ts
import { getBlockTypeLabel } from '@notectl/core';

getBlockTypeLabel('paragraph');                    // 'Paragraph'
getBlockTypeLabel('heading');                      // 'Heading'
getBlockTypeLabel('heading', { level: 2 });        // 'Heading 2'
getBlockTypeLabel('code_block');                   // 'Code Block'
getBlockTypeLabel('unknown_type');                 // 'unknown_type' (fallback)
```

```ts
function getBlockTypeLabel(typeName: string, attrs?: Record<string, unknown>): string
```

---

## Related

- [Document Model](/notectl/api/document-model/) — the `BlockNode`, `Mark`, and `InlineNode` types these utilities work with
- [Schema](/notectl/api/schema/) — `NodeSpec` and `MarkSpec` that use `AttrSpec` and `ParseRule`
- [Plugin Interface](/notectl/api/plugin-interface/) — `EventKey`, `ServiceKey` usage in plugins
- [Paper Size Guide](/notectl/guides/paper-size/) — practical guide to paper mode
- [Internationalization Guide](/notectl/guides/internationalization/) — guide to configuring locales
