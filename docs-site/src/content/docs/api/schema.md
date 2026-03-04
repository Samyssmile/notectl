---
title: Schema
description: Schema registry, node specs, mark specs, inline node specs, and content validation.
---

The schema system defines how block types, inline marks, and inline nodes behave. Plugins register specs through the `SchemaRegistry`, which the editor uses for rendering, parsing, serialization, and content validation.

## SchemaRegistry

Central registry for all specs registered by plugins. Model-only — no DOM dependencies.

```ts
import { SchemaRegistry } from '@notectl/core';

const registry = new SchemaRegistry();
```

### Node Spec Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `registerNodeSpec` | `(spec: NodeSpec<T>) => void` | Register a block node type |
| `getNodeSpec` | `(type: string) => NodeSpec \| undefined` | Look up by type name |
| `removeNodeSpec` | `(type: string) => void` | Remove a registered spec |
| `getNodeTypes` | `() => string[]` | List all registered node type names |

### Mark Spec Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `registerMarkSpec` | `(spec: MarkSpec<T>) => void` | Register an inline mark type |
| `getMarkSpec` | `(type: string) => MarkSpec \| undefined` | Look up by type name |
| `removeMarkSpec` | `(type: string) => void` | Remove a registered spec |
| `getMarkTypes` | `() => string[]` | List all registered mark type names |

### Inline Node Spec Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `registerInlineNodeSpec` | `(spec: InlineNodeSpec<T>) => void` | Register an inline node type |
| `getInlineNodeSpec` | `(type: string) => InlineNodeSpec \| undefined` | Look up by type name |
| `removeInlineNodeSpec` | `(type: string) => void` | Remove a registered spec |
| `getInlineNodeTypes` | `() => string[]` | List all registered inline node type names |

### Parse Rule Accessors

| Method | Return Type | Description |
|--------|-------------|-------------|
| `getBlockParseRules()` | `readonly { rule: ParseRule; type: string }[]` | All NodeSpec parse rules, sorted by priority descending |
| `getInlineParseRules()` | `readonly { rule: ParseRule; type: string }[]` | All InlineNodeSpec parse rules, sorted by priority descending |
| `getMarkParseRules()` | `readonly { rule: ParseRule; type: string }[]` | All MarkSpec parse rules, sorted by priority descending |

### Sanitize Accessors

| Method | Return Type | Description |
|--------|-------------|-------------|
| `getAllowedTags()` | `string[]` | All allowed HTML tags from base defaults + all spec sanitize configs |
| `getAllowedAttrs()` | `string[]` | All allowed HTML attributes from base defaults + all spec sanitize configs |

### Bulk Operations

```ts
registry.clear(); // Remove all registered specs
```

---

## NodeSpec

Defines how a block node type behaves, renders, and serializes.

```ts
interface NodeSpec<T extends string = string> {
  readonly type: T;
  toDOM(node: Omit<BlockNode, 'attrs'> & { readonly attrs: NodeAttrsFor<T> }): HTMLElement;
  readonly attrs?: Readonly<Record<string, AttrSpec>>;
  readonly isVoid?: boolean;
  readonly content?: ContentRule;
  readonly group?: string;
  readonly isolating?: boolean;
  readonly selectable?: boolean;
  readonly excludeMarks?: readonly string[];
  readonly toHTML?: (node: BlockNode, content: string, ctx?: HTMLExportContext) => string;
  readonly parseHTML?: readonly ParseRule[];
  readonly sanitize?: SanitizeConfig;
  wrapper?(node: Omit<BlockNode, 'attrs'> & { readonly attrs: NodeAttrsFor<T> }): WrapperSpec;
}
```

### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `type` | `T` | *required* | Unique type name (e.g. `'heading'`, `'code_block'`) |
| `toDOM` | `(node) => HTMLElement` | *required* | Renders the block to a DOM element. **Must set `data-block-id`** on the root |
| `attrs` | `Record<string, AttrSpec>` | `undefined` | Allowed attributes with defaults |
| `isVoid` | `boolean` | `false` | If true, the node contains no editable text (e.g. image, horizontal rule) |
| `content` | `ContentRule` | `undefined` | Which children this node can contain |
| `group` | `string` | `undefined` | Group membership (`'block'`, `'inline'`, or custom) |
| `isolating` | `boolean` | `false` | If true, selection cannot cross this node's boundary (e.g. table cells) |
| `selectable` | `boolean` | `false` | If true, the node can be selected as an object via mouse |
| `excludeMarks` | `readonly string[]` | `undefined` | Mark types stripped when converting to this block type |
| `toHTML` | `(node, content, ctx?) => string` | `undefined` | Serializes to an HTML string. `content` is pre-serialized inline children |
| `parseHTML` | `readonly ParseRule[]` | `undefined` | Rules for matching HTML elements during parsing |
| `sanitize` | `SanitizeConfig` | `undefined` | Tags and attributes needed through DOMPurify sanitization |
| `wrapper` | `(node) => WrapperSpec` | `undefined` | Groups consecutive blocks into shared wrappers (e.g. `<ul>` around `<li>` items) |

### Example

```ts
const headingSpec: NodeSpec<'heading'> = {
  type: 'heading',
  attrs: { level: { default: 1 } },
  toDOM(node) {
    const el = document.createElement(`h${node.attrs.level}`);
    el.dataset.blockId = node.id;
    return el;
  },
  toHTML(node, content) {
    const level = node.attrs?.level ?? 1;
    return `<h${level}>${content}</h${level}>`;
  },
  parseHTML: [
    { tag: 'H1', getAttrs: () => ({ level: 1 }) },
    { tag: 'H2', getAttrs: () => ({ level: 2 }) },
  ],
};
```

---

## MarkSpec

Defines how an inline mark type renders and serializes.

```ts
interface MarkSpec<T extends string = string> {
  readonly type: T;
  toDOM(mark: Omit<Mark, 'attrs'> & { readonly attrs: MarkAttrsFor<T> }): HTMLElement;
  readonly rank?: number;
  readonly attrs?: Readonly<Record<string, AttrSpec>>;
  readonly toHTMLString?: (mark: Mark, content: string, ctx?: HTMLExportContext) => string;
  readonly toHTMLStyle?: (mark: Mark) => string | null;
  readonly parseHTML?: readonly ParseRule[];
  readonly sanitize?: SanitizeConfig;
}
```

### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `type` | `T` | *required* | Unique type name (e.g. `'bold'`, `'link'`) |
| `toDOM` | `(mark) => HTMLElement` | *required* | Wraps text content in a DOM element |
| `rank` | `number` | `undefined` | Nesting priority — lower rank renders closer to the text |
| `attrs` | `Record<string, AttrSpec>` | `undefined` | Allowed attributes with defaults |
| `toHTMLString` | `(mark, content, ctx?) => string` | `undefined` | Serializes as an HTML wrapper string |
| `toHTMLStyle` | `(mark) => string \| null` | `undefined` | Returns CSS declarations. When defined, the serializer merges all style marks into a single `<span style="...">` |
| `parseHTML` | `readonly ParseRule[]` | `undefined` | Rules for matching HTML elements during parsing |
| `sanitize` | `SanitizeConfig` | `undefined` | Tags and attributes needed through DOMPurify sanitization |

---

## InlineNodeSpec

Defines how an inline node type (atomic, non-text inline element) renders and serializes. Registered via `PluginContext.registerInlineNodeSpec()`.

```ts
interface InlineNodeSpec<T extends string = string> {
  readonly type: T;
  toDOM(node: InlineNode): HTMLElement;
  readonly attrs?: Readonly<Record<string, AttrSpec>>;
  readonly group?: string;
  readonly toHTMLString?: (node: InlineNode) => string;
  readonly parseHTML?: readonly ParseRule[];
  readonly sanitize?: SanitizeConfig;
}
```

### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `type` | `T` | *required* | Unique type name (e.g. `'emoji'`, `'mention'`) |
| `toDOM` | `(node) => HTMLElement` | *required* | Renders the inline node. Should set `contentEditable="false"` |
| `attrs` | `Record<string, AttrSpec>` | `undefined` | Allowed attributes with defaults |
| `group` | `string` | `'inline'` | Group membership for content rules |
| `toHTMLString` | `(node) => string` | `undefined` | Serializes to an HTML string |
| `parseHTML` | `readonly ParseRule[]` | `undefined` | Rules for matching HTML elements during parsing |
| `sanitize` | `SanitizeConfig` | `undefined` | Tags and attributes needed through DOMPurify sanitization |

---

## Supporting Types

### AttrSpec

Describes a single attribute with an optional default value:

```ts
interface AttrSpec {
  readonly default?: string | number | boolean;
}
```

### ContentRule

Describes which children a node type can contain:

```ts
interface ContentRule {
  readonly allow: readonly string[];
  readonly min?: number;
  readonly max?: number;
}
```

- `allow` — child types or group names that are permitted
- `min` / `max` — optional count constraints

### WrapperSpec

Groups consecutive blocks into a shared wrapper element (e.g. `<ul>` around `<li>` items):

```ts
interface WrapperSpec {
  readonly tag: string;
  readonly key: string;
  readonly className?: string;
  readonly attrs?: Readonly<Record<string, string>>;
}
```

| Property | Description |
|----------|-------------|
| `tag` | HTML tag for the wrapper (e.g. `'ul'`, `'ol'`) |
| `key` | Grouping key — consecutive blocks with the same key share a wrapper |
| `className` | Optional CSS class |
| `attrs` | Optional HTML attributes |

### HTMLExportContext

Passed to `toHTML()` during serialization, providing mode-aware helpers:

```ts
interface HTMLExportContext {
  readonly styleAttr: (declarations: string) => string;
}
```

The `styleAttr` function returns an attribute fragment depending on the CSS mode:
- **Inline mode**: `' style="color: red"'`
- **Class mode**: `' class="notectl-s-a3f2k9"'`
- **Empty input**: `''`

### ParseRule

Describes how an HTML element maps to a document node or mark during parsing:

```ts
interface ParseRule {
  readonly tag: string;
  readonly getAttrs?: (el: HTMLElement) => Record<string, unknown> | false;
  readonly priority?: number;
}
```

- `tag` — HTML tag name to match (e.g. `'STRONG'`, `'H1'`)
- `getAttrs` — extracts attributes from the element. Return `false` to skip this rule
- `priority` — higher values are matched first. Default: `50`

### SanitizeConfig

Declares tags and attributes that a spec needs to survive DOMPurify sanitization:

```ts
interface SanitizeConfig {
  readonly tags?: readonly string[];
  readonly attrs?: readonly string[];
}
```

---

## Content Validation

Two pure functions for validating document structure:

```ts
import { canContain, validateContent } from '@notectl/core';
```

### `canContain(registry, parentType, childType)`

Checks if a parent node type can contain a given child node type, using content rules and the group system:

```ts
const allowed: boolean = canContain(registry, 'table_row', 'table_cell');
```

### `validateContent(registry, parentType, childTypes)`

Validates whether the given children types satisfy a parent's content rules (allow list, min/max constraints):

```ts
const valid: boolean = validateContent(registry, 'table_row', ['table_cell', 'table_cell']);
```

---

## Built-in Specs

The `registerBuiltinSpecs` function registers the built-in paragraph spec on a `SchemaRegistry`:

```ts
import { registerBuiltinSpecs, SchemaRegistry } from '@notectl/core';

const registry = new SchemaRegistry();
registerBuiltinSpecs(registry);
```

This is called automatically by the editor during initialization.

---

## Schema Helpers

### `defaultSchema()`

Creates the default schema with paragraph nodes and bold/italic/underline marks:

```ts
import { defaultSchema } from '@notectl/core';

const schema = defaultSchema();
// { nodeTypes: ['paragraph'], markTypes: ['bold', 'italic', 'underline'] }
```

### `schemaFromRegistry(registry)`

Derives a `Schema` from a `SchemaRegistry`'s registered specs:

```ts
import { schemaFromRegistry } from '@notectl/core';

const schema = schemaFromRegistry(registry);
```

The `Schema` interface includes an optional `getNodeSpec` function:

```ts
interface Schema {
  readonly nodeTypes: readonly string[];
  readonly markTypes: readonly string[];
  readonly getNodeSpec?: (type: string) => NodeSpec | undefined;
}
```

### `isNodeTypeAllowed(schema, nodeType)`

Checks if a node type is allowed by the schema:

```ts
import { isNodeTypeAllowed } from '@notectl/core';

isNodeTypeAllowed(schema, 'heading'); // true
```

### `isMarkAllowed(schema, markType)`

Checks whether a mark type is allowed by the schema:

```ts
import { isMarkAllowed } from '@notectl/core';

isMarkAllowed(schema, 'bold'); // true
```

### `createBlockElement(tag, blockId)`

Creates an `HTMLElement` with the required `data-block-id` attribute. Use this in `NodeSpec.toDOM()` implementations:

```ts
import { createBlockElement, blockId } from '@notectl/core';

const el = createBlockElement('div', blockId('b1'));
// <div data-block-id="b1"></div>
```

---

## Related

- [Document Model](/notectl/api/document-model/) — the immutable data types that specs render
- [Plugin Interface](/notectl/api/plugin-interface/) — registration via `PluginContext`
- [Writing a Plugin](/notectl/guides/writing-plugins/) — practical guide to creating specs
