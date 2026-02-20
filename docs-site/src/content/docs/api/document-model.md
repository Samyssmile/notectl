---
title: Document Model
description: Immutable document data types — Document, BlockNode, TextNode, InlineNode, Mark.
---

The document model is a tree of immutable data types. All mutations create new instances.

## Document

The root container holding an array of blocks:

```ts
interface Document {
  readonly children: readonly BlockNode[];
}
```

### Factory Functions

```ts
import {
  createDocument, createBlockNode, createTextNode,
  createInlineNode, nodeType, inlineType,
} from '@notectl/core';

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

// InlineNode (atomic, width-1 element)
const br = createInlineNode(inlineType('hard_break'));
```

## BlockNode

A block-level node (paragraph, heading, list item, etc.):

```ts
interface BlockNode {
  readonly id: BlockId;
  readonly type: NodeTypeName;
  readonly attrs?: BlockAttrs;
  readonly children: readonly ChildNode[];
}
```

### ChildNode

A child of a `BlockNode` can be text, an inline element, or a nested block:

```ts
type ChildNode = TextNode | InlineNode | BlockNode;
```

### Block Types

| Type | Description | Attributes |
|------|-------------|-----------|
| `paragraph` | Standard text block | — |
| `heading` | Heading (H1-H6) | `level: number` |
| `title` | Document title (H1 variant) | — |
| `subtitle` | Document subtitle (H2 variant) | — |
| `list_item` | List entry | `listType`, `indent`, `checked` |
| `blockquote` | Block quote | — |
| `code_block` | Code block with syntax highlighting | `language?: string` |
| `horizontal_rule` | Horizontal line (void) | — |
| `image` | Image block (void) | `src`, `alt?`, `width?`, `height?` |
| `table` | Table container | — |
| `table_row` | Table row | — |
| `table_cell` | Table cell | `colspan?`, `rowspan?` |

## TextNode

An inline text segment with marks:

```ts
interface TextNode {
  readonly type: 'text';
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

## InlineNode

An atomic inline element that occupies width 1 in offset space (e.g., hard break, mention, emoji):

```ts
interface InlineNode {
  readonly type: 'inline';
  readonly inlineType: InlineTypeName;
  readonly attrs: Readonly<Record<string, string | number | boolean>>;
}
```

### Factory

```ts
import { createInlineNode, inlineType } from '@notectl/core';

const br = createInlineNode(inlineType('hard_break'));
const emoji = createInlineNode(inlineType('emoji'), { name: 'rocket' });
```

InlineNodes are rendered with `contenteditable="false"` in the DOM and behave as atomic units for selection and editing.

## Mark

An inline annotation applied to a text range:

```ts
interface Mark {
  readonly type: MarkTypeName;
  readonly attrs?: Readonly<Record<string, string | number | boolean>>;
}
```

### Mark Types

| Type | Attributes | Description |
|------|-----------|-------------|
| `bold` | — | Bold text |
| `italic` | — | Italic text |
| `underline` | — | Underlined text |
| `strikethrough` | — | Strikethrough text |
| `superscript` | — | Superscript text |
| `subscript` | — | Subscript text |
| `link` | `href: string` | Hyperlink |
| `textColor` | `color: string` | Text color |
| `highlight` | `color: string` | Background highlight |
| `font` | `family: string` | Font family |
| `fontSize` | `size: string` | Font size |

## Content Segments

For mark-preserving undo/redo and block range operations:

```ts
interface TextSegment {
  readonly text: string;
  readonly marks: readonly Mark[];
}

type ContentSegment =
  | { readonly kind: 'text'; readonly text: string; readonly marks: readonly Mark[] }
  | { readonly kind: 'inline'; readonly node: InlineNode };
```

## Utility Functions

### Block Inspection

```ts
import {
  getBlockText,
  getBlockLength,
  getTextChildren,
  getInlineChildren,
  getBlockChildren,
  getBlockMarksAtOffset,
  getContentAtOffset,
  isTextNode,
  isInlineNode,
  isBlockNode,
  isLeafBlock,
} from '@notectl/core';

const text = getBlockText(block);              // "Hello World"
const len = getBlockLength(block);             // 11 (InlineNodes count as 1)
const textNodes = getTextChildren(block);      // TextNode[]
const inlines = getInlineChildren(block);      // (TextNode | InlineNode)[]
const blocks = getBlockChildren(block);        // BlockNode[] (nested children)
const marks = getBlockMarksAtOffset(block, 5); // Mark[] at offset
const content = getContentAtOffset(block, 0);  // { kind: 'text', char, marks } | { kind: 'inline', node } | null
```

### Mark Operations

```ts
import { hasMark, markSetsEqual, markType } from '@notectl/core';

hasMark(marks, markType('bold'));           // boolean
markSetsEqual(marks1, marks2);             // boolean
```

### Node Resolution

```ts
import {
  resolveNodeByPath,
  resolveParentByPath,
  findNodePath,
  findNode,
  findNodeWithPath,
  walkNodes,
} from '@notectl/core';

const node = resolveNodeByPath(doc, path);          // BlockNode | undefined
const { parent, index } = resolveParentByPath(doc, path);
const path = findNodePath(doc, blockId);            // string[] | undefined
const node = findNode(doc, blockId);                // BlockNode | undefined
const { node, path } = findNodeWithPath(doc, blockId);
walkNodes(doc, (block, path) => { /* DFS visitor */ });
```

### Type Guards

```ts
import {
  isNodeOfType, isMarkOfType, isInlineNodeOfType,
  isTextNode, isInlineNode, isBlockNode,
} from '@notectl/core';

// These type guards require module augmentation of the attribute registries.
// Plugins like HeadingPlugin, LinkPlugin, and HardBreakPlugin augment the
// registries automatically when imported.

if (isNodeOfType(block, 'heading')) {
  console.log(block.attrs.level); // Type-safe access
}

if (isMarkOfType(mark, 'link')) {
  console.log(mark.attrs.href);   // Type-safe access
}

if (isInlineNodeOfType(node, 'hard_break')) {
  // Type-safe InlineNode access
}
```

## Branded Types

notectl uses branded types for compile-time safety:

```ts
import {
  blockId, nodeType, markType, inlineType,
  pluginId, commandName,
} from '@notectl/core';

const id = blockId('abc123');            // BlockId
const nt = nodeType('paragraph');        // NodeTypeName
const mt = markType('bold');             // MarkTypeName
const it = inlineType('hard_break');     // InlineTypeName
const pid = pluginId('my-plugin');       // PluginId
const cmd = commandName('toggleBold');   // CommandName
```

These prevent accidental mixing of string types at compile time.
