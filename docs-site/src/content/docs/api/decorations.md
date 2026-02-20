---
title: Decorations
description: Visual annotations over the document — inline highlights, node styles, and widget insertion.
---

Decorations are transient visual annotations applied on top of the document. They do not modify the document model, do not affect undo/redo, and are recomputed on every state change.

Use decorations for syntax highlighting, search result markers, selection indicators, line numbers, or any visual overlay.

## Decoration Types

### InlineDecoration

Applies styling to a text range within a block:

```ts
interface InlineDecoration {
  readonly type: 'inline';
  readonly blockId: BlockId;
  readonly from: number;
  readonly to: number;
  readonly attrs: DecorationAttrs;
}
```

### NodeDecoration

Applies styling to an entire block element:

```ts
interface NodeDecoration {
  readonly type: 'node';
  readonly blockId: BlockId;
  readonly attrs: DecorationAttrs;
}
```

### WidgetDecoration

Inserts a custom DOM element at a specific position:

```ts
interface WidgetDecoration {
  readonly type: 'widget';
  readonly blockId: BlockId;
  readonly offset: number;
  readonly toDOM: () => HTMLElement;
  readonly side: -1 | 1;
  readonly key?: string;
}
```

- `side: -1` — render before the position (default)
- `side: 1` — render after the position
- `key` — optional identifier for stable updates

### DecorationAttrs

```ts
interface DecorationAttrs {
  readonly class?: string;
  readonly style?: string;
  readonly nodeName?: string;
  readonly [key: string]: string | undefined;
}
```

## Factory Functions

```ts
import { inlineDecoration, nodeDecoration, widgetDecoration } from '@notectl/core';

// Highlight a text range
const highlight = inlineDecoration(blockId('b1'), 0, 5, {
  class: 'search-match',
});

// Style an entire block
const active = nodeDecoration(blockId('b1'), {
  class: 'active-block',
});

// Insert a widget at offset 10
const lineNum = widgetDecoration(
  blockId('b1'),
  10,
  () => {
    const el = document.createElement('span');
    el.textContent = '42';
    el.className = 'line-number';
    return el;
  },
  { side: -1, key: 'line-42' },
);
```

## DecorationSet

An immutable collection of decorations indexed by block ID:

```ts
import { DecorationSet, inlineDecoration } from '@notectl/core';

// Create from array
const set = DecorationSet.create([
  inlineDecoration(bid, 0, 5, { class: 'highlight' }),
  inlineDecoration(bid, 10, 15, { class: 'highlight' }),
]);

// Query
set.find(blockId);           // Decoration[]
set.findInline(blockId);     // InlineDecoration[]
set.findNode(blockId);       // NodeDecoration[]
set.findWidget(blockId);     // WidgetDecoration[]
set.isEmpty;                 // boolean

// Immutable operations
const added = set.add([newDeco]);
const filtered = set.remove((d) => d.type === 'widget');
const combined = set.merge(otherSet);
const mapped = set.map(transaction);   // Remap positions after state change

// Equality check
set.equals(otherSet);

// Singleton empty set
DecorationSet.empty;
```

### Position Mapping

`DecorationSet.map(tr)` automatically adjusts decoration positions when the document changes:

- Text insertions shift positions forward
- Text deletions remove overlapping decorations and shift positions backward
- Block splits split decorations across blocks
- Block merges combine decorations into the target block

## Using Decorations in Plugins

Plugins provide decorations via the `decorations()` method:

```ts
import type { Plugin, EditorState } from '@notectl/core';
import { DecorationSet, inlineDecoration, getBlockText } from '@notectl/core';

class SearchHighlightPlugin implements Plugin {
  readonly id = 'search-highlight';
  readonly name = 'Search Highlight';
  private searchTerm = '';

  init(context: PluginContext): void {
    context.registerCommand('setSearchTerm', () => {
      // ... update this.searchTerm
      return true;
    });
  }

  decorations(state: EditorState): DecorationSet {
    if (!this.searchTerm) return DecorationSet.empty;

    const decos: Decoration[] = [];
    for (const bid of state.getBlockOrder()) {
      const block = state.getBlock(bid);
      if (!block) continue;
      const text = getBlockText(block);
      let idx = text.indexOf(this.searchTerm);
      while (idx !== -1) {
        decos.push(inlineDecoration(bid, idx, idx + this.searchTerm.length, {
          class: 'search-match',
        }));
        idx = text.indexOf(this.searchTerm, idx + 1);
      }
    }
    return DecorationSet.create(decos);
  }
}
```

The `decorations()` method is called after every state change, before DOM reconciliation. Plugins should cache computations when possible for performance.

## Built-in Usage

The `CodeBlockPlugin` uses inline decorations for syntax highlighting. It tokenizes code text and maps each token to a CSS class:

```ts
decorations(state: EditorState): DecorationSet {
  if (!this.config.highlighter) return DecorationSet.empty;

  const decos = [];
  for (const bid of state.getBlockOrder()) {
    const block = state.getBlock(bid);
    if (!block || block.type !== 'code_block') continue;

    const lang = block.attrs?.language as string ?? '';
    const text = getBlockText(block);
    const tokens = this.config.highlighter.tokenize(text, lang);

    for (const token of tokens) {
      decos.push(inlineDecoration(bid, token.from, token.to, {
        class: `notectl-token--${token.type}`,
      }));
    }
  }
  return DecorationSet.create(decos);
}
```
