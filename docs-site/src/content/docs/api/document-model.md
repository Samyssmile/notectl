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
  createInlineNode, createEmptyParagraph,
  nodeType, inlineType,
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

// Convenience: empty paragraph with optional ID
const para = createEmptyParagraph();
const paraWithId = createEmptyParagraph(blockId('my-id'));

// InlineNode (atomic, width-1 element)
const br = createInlineNode(inlineType('hard_break'));

// Heading that can be targeted by a document-local link (`href="#installation"`)
const anchoredHeading = createBlockNode(
  nodeType('heading'),
  [createTextNode('Installation')],
  undefined,
  { level: 2 },
  'installation',
);
```

## BlockNode

A block-level node (paragraph, heading, list item, etc.):

```ts
interface BlockNode {
  readonly id: BlockId;
  readonly htmlId?: string;
  readonly type: NodeTypeName;
  readonly attrs?: BlockAttrs;
  readonly children: readonly ChildNode[];
}
```

### Internal ID vs. HTML ID

`id` and `htmlId` have deliberately separate responsibilities:

| Field | Purpose | HTML representation |
|-------|---------|---------------------|
| `id` | Internal editor identity used by selections, transactions, and block lookup | `data-block-id` (unless export opts out) |
| `htmlId` | Optional document-local target for links such as `href="#installation"` | `id="installation"` |

`id` is always present and must not be used as a document anchor. `htmlId` is optional, remains
part of the document content, and is rendered on the block in both the live editor and exported
HTML. A valid value is non-empty and contains no ASCII whitespace; keep values unique within a
document.

The fifth `createBlockNode` argument sets `htmlId`:

```ts
createBlockNode(type, children, id, attrs, htmlId);
```

HTML import maps a valid `id` on a model-represented block root to `htmlId`. Wrapper-only and inline
elements without a corresponding `BlockNode` do not retain an ID. This is independent of adopting
an editor-owned `data-block-id` as `id`.

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
| `table` | Table container | `borderColor?`, `columnWidthsPx?: readonly (number \| null)[]` |
| `table_row` | Table row | `minHeightPx?: number` |
| `table_cell` | Table cell | `colspan?`, `rowspan?` |

### Structured block attributes

Block attributes are immutable JSON-compatible values. In addition to scalar strings, numbers,
and booleans, a block attribute can contain a readonly array of scalar values. This is used for
state that is intrinsically structured and must round-trip without delimiter-string encoding:

```ts
type BlockAttrPrimitive = string | number | boolean | null;
type BlockAttrArrayValue = BlockAttrPrimitive;

type BlockAttrValue =
  | Exclude<BlockAttrPrimitive, null>
  | readonly BlockAttrArrayValue[];

interface BlockAttrs {
  readonly [key: string]: BlockAttrValue;
}
```

Table sizing is the canonical example. `table.attrs.columnWidthsPx` has one slot per logical
column, where a finite number is an explicit CSS-pixel width and `null` means automatic. A row's
optional `table_row.attrs.minHeightPx` is a CSS-pixel minimum rather than a fixed height. An
all-automatic width vector and automatic row height are omitted. See the
[Table plugin sizing API](/notectl/plugins/table/#public-sizing-api) for mutation and validation.

## TextNode

An inline text segment with marks:

```ts
interface TextNode {
  readonly type: 'text';
  readonly text: string;
  readonly marks: readonly Mark[];
}
```

### TextNode Factory

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

### InlineNode Factory

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
| `bdi` | `dir: string` | Bidirectional text isolation (registered by TextDirectionPlugin) |

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

### General Utilities

```ts
import {
  generateBlockId,
  marksEqual,
  addMarkToSet,
  removeMarkFromSet,
  normalizeTextNodes,
  normalizeInlineContent,
  walkInlineContent,
  blockOffsetToTextOffset,
} from '@notectl/core';
```

| Function | Signature | Description |
|----------|-----------|-------------|
| `generateBlockId` | `() => BlockId` | Generates a unique block identifier |
| `marksEqual` | `(a: Mark, b: Mark) => boolean` | Checks if two individual marks are equal (type + attrs) |
| `addMarkToSet` | `(marks: readonly Mark[], mark: Mark) => readonly Mark[]` | Adds a mark to a mark set |
| `removeMarkFromSet` | `(marks: readonly Mark[], markType: MarkTypeName) => readonly Mark[]` | Removes a mark type from a mark set |
| `normalizeTextNodes` | `(nodes: readonly TextNode[]) => readonly TextNode[]` | Merges adjacent text nodes with equal marks |
| `normalizeInlineContent` | `(nodes: readonly (TextNode \| InlineNode)[]) => readonly (TextNode \| InlineNode)[]` | Normalizes inline content by merging adjacent compatible text nodes |
| `walkInlineContent` | `(children: readonly (TextNode \| InlineNode)[]) => Generator<...>` | Generator that yields each character/inline node with position info |
| `blockOffsetToTextOffset` | `(block: BlockNode, blockOffset: number) => number` | Converts a block offset to a text-only offset |

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
  getBlockSegmentsInRange,
  getBlockContentSegmentsInRange,
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

// Extract segments for a specific offset range
const segments = getBlockSegmentsInRange(block, 0, 5);         // TextSegment[]
const mixed = getBlockContentSegmentsInRange(block, 0, 5);     // ContentSegment[] (text + inline)
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
