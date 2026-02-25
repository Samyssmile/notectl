---
title: Writing a Plugin
description: Create custom plugins to extend the notectl editor.
---

## Plugin Interface

Every notectl plugin implements the `Plugin` interface:

```ts
import type { Plugin, PluginContext } from '@notectl/core';

class MyPlugin implements Plugin {
  readonly id = 'my-plugin';
  readonly name = 'My Plugin';
  readonly priority = 50;              // Optional: controls init order
  readonly dependencies = [];          // Optional: plugin IDs this depends on

  init(context: PluginContext): void {
    // Register capabilities here
  }

  destroy(): void {
    // Clean up resources
  }

  onStateChange(oldState, newState, tr): void {
    // React to state changes
  }

  onReady(): void {
    // Called after ALL plugins are initialized
  }

  onReadOnlyChange(readonly: boolean): void {
    // Called when the editor's read-only mode changes
  }

  decorations(state: EditorState, tr?: Transaction): DecorationSet {
    // Return decorations for the current state
  }
}
```

## PluginContext API

During `init()`, the `context` object provides everything your plugin needs:

### State & Dispatch

```ts
// Read current state
const state = context.getState();

// Dispatch a transaction
const tr = state.transaction('command').insertText(blockId, offset, 'hello').build();
context.dispatch(tr);
```

### Commands

Register named commands that can be called from anywhere:

```ts
context.registerCommand('myCommand', () => {
  const state = context.getState();
  // Do something...
  return true; // Return true if handled
});

// Execute another plugin's command
context.executeCommand('toggleBold');
```

### Schema Extension

Register new node types and mark types:

```ts
// Register a new block type
context.registerNodeSpec({
  type: 'callout',
  content: 'inline*',
  group: 'block',
  attrs: {
    variant: { default: 'info' },
  },
  toDOM(node) {
    const div = document.createElement('div');
    div.className = `callout callout--${node.attrs.variant}`;
    div.setAttribute('data-block-id', node.id);
    return div;
  },
});

// Register a new inline mark
context.registerMarkSpec({
  type: 'highlight',
  rank: 7,
  attrs: {
    color: { default: 'yellow' },
  },
  toDOM(mark) {
    const span = document.createElement('span');
    span.style.backgroundColor = mark.attrs.color;
    return span;
  },
});
```

### Keymaps

Bind keyboard shortcuts:

```ts
context.registerKeymap({
  'Mod-Shift-h': () => {
    context.executeCommand('myCommand');
    return true;
  },
  'Mod-Enter': () => {
    // Mod = Cmd on Mac, Ctrl on Windows/Linux
    return false; // Return false to let other handlers try
  },
});
```

### Input Rules

Transform text patterns as the user types:

```ts
context.registerInputRule({
  // Match "---" at the start of a line
  pattern: /^---$/,
  handler: (state, match, blockId) => {
    // Replace with horizontal rule
    return state.transaction('input')
      .setBlockType(blockId, nodeType('horizontal_rule'))
      .build();
  },
});
```

### Toolbar Items

Add buttons to the toolbar:

```ts
context.registerToolbarItem({
  id: 'my-button',
  group: 'format',
  icon: '<svg>...</svg>',     // HTML string for the icon
  label: 'My Action',         // Accessible label
  tooltip: 'Do something',
  command: 'myCommand',        // Command to execute on click
  priority: 50,
  isActive: (state) => false,  // Highlight when active
  isDisabled: (state) => false,
});
```

### Block Type Picker

Add custom entries to the block type dropdown (the "Paragraph / Heading / Title" picker provided by `HeadingPlugin`). Your plugin must declare `dependencies: ['heading']` so the picker exists when entries are registered.

```ts
context.registerBlockTypePickerEntry({
  id: 'footer',
  label: 'Footer',
  command: 'setFooter',     // Must be a registered command
  priority: 200,            // Higher = further down the list
  style: {                  // Optional: preview styling in the dropdown
    fontSize: '0.85em',
    fontWeight: '400',
  },
  isActive: (state) => {
    const block = state.getBlock(state.selection.anchor.blockId);
    return block?.type === 'footer';
  },
});
```

Built-in entries use priorities 10–106 (paragraph=10, title=20, subtitle=30, headings=101–106). Use 200+ to place entries after the built-in block types.

### Event Bus

Communicate between plugins:

```ts
import { EventKey } from '@notectl/core';

// Define a typed event
const MyEvent = new EventKey<{ value: string }>('my-event');

// Emit
context.getEventBus().emit(MyEvent, { value: 'hello' });

// Listen
const unsubscribe = context.getEventBus().on(MyEvent, (payload) => {
  console.log(payload.value);
});
```

### Services

Expose typed services for other plugins:

```ts
import { ServiceKey } from '@notectl/core';

interface MyService {
  doSomething(): void;
}

const MyServiceKey = new ServiceKey<MyService>('my-service');

// Register
context.registerService(MyServiceKey, {
  doSomething() { /* ... */ },
});

// Consume (from another plugin)
const service = context.getService(MyServiceKey);
service?.doSomething();
```

### Middleware

Intercept transactions before they're applied:

```ts
context.registerMiddleware((tr, state, next) => {
  // Inspect the transaction
  console.log('Transaction steps:', tr.steps.length);

  // Optionally modify or cancel
  if (shouldCancel(tr)) {
    return; // Don't call next() to cancel
  }

  // Pass through
  next(tr);
}, 100); // Priority: lower = runs first
```

### DOM Access

```ts
// The content-editable element
const contentEl = context.getContainer();

// Plugin container areas (above/below the content)
const topArea = context.getPluginContainer('top');
const bottomArea = context.getPluginContainer('bottom');
```

### Inline Node Specs

Register atomic inline elements (like hard breaks, emoji, or mentions):

```ts
context.registerInlineNodeSpec({
  type: 'emoji',
  attrs: {
    code: { default: '' },
  },
  toDOM(node) {
    const span = document.createElement('span');
    span.textContent = node.attrs.code;
    span.setAttribute('contenteditable', 'false');
    return span;
  },
});
```

### File Handlers

Register handlers for drag-and-drop or paste of files:

```ts
context.registerFileHandler('image/*', async (files, position) => {
  for (const file of files) {
    // Process each file
  }
  return true; // Return true if handled
});
```

### Style Sheets

Inject CSS into the editor's adopted stylesheets:

```ts
context.registerStyleSheet(`
  .callout { padding: 12px; border-left: 4px solid blue; }
`);
```

### Accessibility Announcements

Push announcements to screen readers via the aria-live region:

```ts
context.announce('Image resized to 400 by 300 pixels.');
```

### Read-Only State

Check whether the editor is currently in read-only mode:

```ts
if (context.isReadOnly()) {
  return false; // Skip mutation in read-only mode
}
```

## Complete Example: Highlight Plugin

```ts
import type { Plugin, PluginContext } from '@notectl/core';
import { markType, isMarkActive, toggleMark } from '@notectl/core';

class HighlightPlugin implements Plugin {
  readonly id = 'highlight';
  readonly name = 'Highlight';
  readonly priority = 47;

  init(context: PluginContext): void {
    // Register mark
    context.registerMarkSpec({
      type: 'highlight',
      rank: 7,
      attrs: {
        color: { default: 'yellow' },
      },
      toDOM(mark) {
        const span = document.createElement('span');
        span.style.backgroundColor = mark.attrs?.color ?? 'yellow';
        return span;
      },
    });

    // Register command
    context.registerCommand('toggleHighlight', () => {
      const state = context.getState();
      const tr = toggleMark(state, markType('highlight'));
      if (tr) {
        context.dispatch(tr);
        return true;
      }
      return false;
    });

    // Register keymap
    context.registerKeymap({
      'Mod-Shift-h': () => context.executeCommand('toggleHighlight'),
    });

    // Register toolbar item
    context.registerToolbarItem({
      id: 'highlight',
      group: 'format',
      icon: '&#x1F58D;',
      label: 'Highlight',
      tooltip: 'Highlight (Cmd+Shift+H)',
      command: 'toggleHighlight',
      priority: 47,
      isActive: (state) => isMarkActive(state, markType('highlight')),
    });
  }
}

export { HighlightPlugin };
```

Usage:

```ts
const editor = await createEditor({
  toolbar: [
    [new TextFormattingPlugin()],
    [new HighlightPlugin()],
  ],
});
```

## TypeScript Attribute Registry

For type-safe mark attributes, augment the `MarkAttrRegistry`:

```ts
declare module '@notectl/core' {
  interface MarkAttrRegistry {
    highlight: { color: string };
  }
}
```

This enables type checking when you use `isMarkOfType(mark, 'highlight')` — the compiler knows `mark.attrs.color` exists.
