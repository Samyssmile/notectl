---
title: Events & Lifecycle
description: Editor events, lifecycle hooks, and runtime configuration.
---

## Events

notectl emits events through a typed event system. Use `on()` and `off()` to subscribe:

### stateChange

Fired on every state change (typing, formatting, undo/redo):

```ts
editor.on('stateChange', ({ oldState, newState, transaction }) => {
  console.log('Doc changed:', newState.doc);
  console.log('Transaction origin:', transaction.origin);
});
```

The event payload includes:

| Field | Type | Description |
|-------|------|-------------|
| `oldState` | `EditorState` | State before the change |
| `newState` | `EditorState` | State after the change |
| `transaction` | `Transaction` | The transaction that caused the change |

### selectionChange

Fired when the cursor position or selection range changes:

```ts
editor.on('selectionChange', ({ selection }) => {
  console.log('Cursor at block:', selection.anchor.blockId);
  console.log('Offset:', selection.anchor.offset);
});
```

### focus / blur

Fired when the editor gains or loses focus:

```ts
editor.on('focus', () => {
  console.log('Editor focused');
});

editor.on('blur', () => {
  console.log('Editor blurred');
});
```

### ready

Fired once after initialization is complete:

```ts
editor.on('ready', () => {
  console.log('Editor ready');
});
```

## Removing Listeners

```ts
const handler = ({ newState }) => {
  console.log(newState);
};

editor.on('stateChange', handler);
editor.off('stateChange', handler);
```

## Lifecycle

### Initialization

The editor initializes when it's added to the DOM or when `init()` is called explicitly:

```ts
// Option 1: Auto-init via createEditor()
const editor = await createEditor({ /* config */ });
document.body.appendChild(editor);

// Option 2: Manual init
const editor = document.createElement('notectl-editor');
document.body.appendChild(editor);
await editor.init({ /* config */ });
```

### Waiting for Ready

Use `whenReady()` to wait for initialization:

```ts
const editor = document.createElement('notectl-editor');
document.body.appendChild(editor);

await editor.whenReady();
console.log('Editor is fully initialized');
```

### Runtime Configuration

Update editor configuration without reinitializing:

```ts
// Change placeholder
editor.configure({ placeholder: 'New placeholder...' });

// Toggle readonly mode
editor.configure({ readonly: true });
editor.configure({ readonly: false });
```

### Plugin Configuration

Configure individual plugins at runtime:

```ts
editor.configurePlugin('pluginId', { key: 'value' });
```

### Destruction

Clean up when removing the editor:

```ts
await editor.destroy();
```

This:
1. Destroys the view and stops input handling
2. Calls `destroy()` on all plugins (async-safe)
3. Resets internal state

The editor can be re-initialized after destruction by calling `init()` again.

## Observed Attributes

The Web Component observes these HTML attributes:

```html
<!-- Placeholder text -->
<notectl-editor placeholder="Type here..."></notectl-editor>

<!-- Readonly mode -->
<notectl-editor readonly></notectl-editor>

<!-- Theme preset -->
<notectl-editor theme="dark"></notectl-editor>

<!-- Paper size -->
<notectl-editor paper-size="din-a4"></notectl-editor>
```

Changes to these attributes are reflected immediately.

## Additional Public API

Beyond events and lifecycle, `NotectlEditor` exposes these methods:

| Method | Description |
|--------|-------------|
| `setTheme(theme)` | Change theme at runtime |
| `getTheme()` | Get the current theme |
| `getPaperSize()` | Get the current paper size |
| `get isReadOnly` | Check if the editor is in read-only mode |
| `getService(key)` | Retrieve a typed plugin service |
| `onPluginEvent(key, callback)` | Subscribe to typed plugin events (returns unsubscribe function) |
| `registerPlugin(plugin)` | Register a plugin before initialization (throws if called after init) |

See the [NotectlEditor API reference](/notectl/api/editor/) for full details.
