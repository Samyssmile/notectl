---
title: Document Model
description: Immutable document data types — Document, BlockNode, TextNode, Mark.
---

The document model is a tree of immutable data types. All mutations create new instances.

## Document

The root container holding an array of blocks:

```ts
interface Document {
  type: 'doc';
  children: readonly BlockNode[];
}
```

### Factory Functions

```ts
import { createDocument, createBlockNode, createTextNode, nodeType } from '@notectl/core';

// Empty document (single empty paragraph)
const doc = createDocument();

// Document with content
const doc = createDocument([
  createBlockNode(nodeType('heading'), [
    createTextNode('Hello World'),
  ], undefined, { level: 1 }),
  createBlockNode(nodeType('paragraph'), [
    createTextNode('Some text'),
  ]),
]);
```

## BlockNode

A block-level node (paragraph, heading, list item, etc.):

```ts
interface BlockNode {
  readonly type: string;
  readonly id: BlockId;
  readonly children: readonly ChildNode[];
  readonly attrs: BlockAttrs;
}
```

### Block Types

| Type | Description | Attributes |
|------|-------------|-----------|
| `paragraph` | Standard text block | — |
| `heading` | Heading (H1–H6) | `level: number` |
| `list_item` | List entry | `listType`, `indent`, `checked` |
| `blockquote` | Block quote | — |
| `horizontal_rule` | Horizontal line (void) | — |
| `table` | Table container | — |
| `table_row` | Table row | — |
| `table_cell` | Table cell | `colspan?`, `rowspan?` |

## TextNode

An inline text segment with marks:

```ts
interface TextNode {
  readonly text: string;
  readonly marks: readonly Mark[];
}
```

### Factory

```ts
import { createTextNode, markType } from '@notectl/core';

// Plain text
const text = createTextNode('hello');

// Text with marks
const bold = createTextNode('bold text', [
  { type: markType('bold') },
]);

// Text with attributed marks
const colored = createTextNode('red text', [
  { type: markType('textColor'), attrs: { color: '#FF0000' } },
]);
```

## Mark

An inline annotation applied to a text range:

```ts
interface Mark {
  readonly type: MarkType;
  readonly attrs?: Record<string, unknown>;
}
```

### Mark Types

| Type | Attributes | Description |
|------|-----------|-------------|
| `bold` | — | Bold text |
| `italic` | — | Italic text |
| `underline` | — | Underlined text |
| `strikethrough` | — | Strikethrough text |
| `link` | `href: string` | Hyperlink |
| `textColor` | `color: string` | Text color |
| `font` | `family: string` | Font family |
| `fontSize` | `size: string` | Font size |

## Utility Functions

### Block Inspection

```ts
import {
  getBlockText,
  getBlockLength,
  getTextChildren,
  getBlockChildren,
  getBlockMarksAtOffset,
  isTextNode,
  isBlockNode,
  isLeafBlock,
} from '@notectl/core';

const text = getBlockText(block);        // "Hello World"
const len = getBlockLength(block);       // 11
const nodes = getTextChildren(block);    // TextNode[]
const marks = getBlockMarksAtOffset(block, 5); // Mark[] at offset
```

### Mark Operations

```ts
import { hasMark, markSetsEqual } from '@notectl/core';

hasMark(marks, markType('bold'));           // boolean
markSetsEqual(marks1, marks2);             // boolean
```

### Type Guards

```ts
import { isNodeOfType, isMarkOfType } from '@notectl/core';

if (isNodeOfType(block, 'heading')) {
  console.log(block.attrs.level); // Type-safe access
}

if (isMarkOfType(mark, 'link')) {
  console.log(mark.attrs.href);   // Type-safe access
}
```

## Branded Types

notectl uses branded types for compile-time safety:

```ts
import { blockId, nodeType, markType, pluginId, commandName } from '@notectl/core';

const id = blockId('abc123');       // BlockId
const nt = nodeType('paragraph');   // NodeTypeName
const mt = markType('bold');        // MarkTypeName
```

These prevent accidental mixing of string types at compile time.
