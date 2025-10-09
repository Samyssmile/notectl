# @notectl/svelte

Svelte adapter for NotectlEditor - a framework-agnostic rich text editor built on Web Components.

## Installation

```bash
npm install @notectl/svelte @notectl/core
```

## Usage

### Component Usage

```svelte
<script lang="ts">
  import { NotectlEditor } from '@notectl/svelte';
  import type { EditorAPI } from '@notectl/core';

  let content = { type: 'doc', content: [] };

  function handleContentChange(event: CustomEvent<{ content: unknown }>) {
    content = event.detail.content;
    console.log('Content changed:', content);
  }

  function handleReady(event: CustomEvent<{ editor: EditorAPI }>) {
    const editor = event.detail.editor;
    console.log('Editor ready:', editor);
  }
</script>

<NotectlEditor
  {content}
  placeholder="Start writing..."
  readOnly={false}
  on:contentChange={handleContentChange}
  on:ready={handleReady}
/>
```

### Action Usage

```svelte
<script lang="ts">
  import { notectlEditor } from '@notectl/svelte';
  import type { EditorAPI } from '@notectl/core';

  let content = { type: 'doc', content: [] };

  function handleContentChange(newContent: unknown) {
    content = newContent;
    console.log('Content changed:', content);
  }

  function handleReady(editor: EditorAPI) {
    console.log('Editor ready:', editor);
  }
</script>

<div
  use:notectlEditor={{
    content,
    placeholder: 'Start writing...',
    onContentChange: handleContentChange,
    onReady: handleReady,
  }}
/>
```

### Store Usage

```svelte
<script lang="ts">
  import { NotectlEditor, createEditorStore } from '@notectl/svelte';
  import type { EditorAPI } from '@notectl/core';

  // Create reactive stores
  const editorStore = createEditorStore({ type: 'doc', content: [] });
  const { content, ready, error, isReady, hasError } = editorStore;

  function handleReady(event: CustomEvent<{ editor: EditorAPI }>) {
    const editor = event.detail.editor;

    // Bind content store to editor
    const unbind = $content.bindToEditor(editor);

    // Set ready state
    ready.set(true);

    // Cleanup on component destroy
    return () => {
      unbind();
    };
  }

  function handleContentChange(event: CustomEvent<{ content: unknown }>) {
    content.set(event.detail.content);
  }

  function handleError(event: CustomEvent<{ error: Error }>) {
    error.set(event.detail.error);
  }
</script>

{#if $isReady}
  <p>Editor is ready!</p>
{/if}

{#if $hasError}
  <p>Error: {$error?.message}</p>
{/if}

<NotectlEditor
  content={$content}
  on:ready={handleReady}
  on:contentChange={handleContentChange}
  on:error={handleError}
/>

<pre>{JSON.stringify($content, null, 2)}</pre>
```

## API

### Component Props

- `debug?: boolean` - Enable debug mode
- `content?: string | object` - Initial editor content
- `placeholder?: string` - Placeholder text
- `readOnly?: boolean` - Read-only mode
- `accessibility?: object` - Accessibility configuration
- `i18n?: object` - Internationalization settings
- `theme?: object` - Theme configuration
- `className?: string` - Custom CSS class

### Component Events

- `on:contentChange` - Fired when content changes
- `on:selectionChange` - Fired when selection changes
- `on:focus` - Fired when editor gains focus
- `on:blur` - Fired when editor loses focus
- `on:ready` - Fired when editor is ready
- `on:error` - Fired when an error occurs

### Component Methods

Access via `bind:this`:

```svelte
<script>
  let editor;
</script>

<NotectlEditor bind:this={editor} />

<button on:click={() => console.log(editor.getContent())}>
  Get Content
</button>
```

- `getContent(): unknown` - Get current content
- `setContent(content: unknown): void` - Set content
- `getState(): unknown` - Get editor state
- `executeCommand(command: string, ...args: unknown[]): void` - Execute command
- `registerPlugin(plugin: unknown): void` - Register a plugin
- `unregisterPlugin(pluginId: string): void` - Unregister a plugin

### Actions

#### `notectlEditor(node, options)`

Initialize NotectlEditor on any element.

**Options:**
- All component props
- `onContentChange?: (content: unknown) => void`
- `onSelectionChange?: (selection: unknown) => void`
- `onFocus?: () => void`
- `onBlur?: () => void`
- `onReady?: (editor: EditorAPI) => void`
- `onError?: (error: Error) => void`

### Stores

#### `createEditorStore(initialContent?)`

Create a composite store with all editor state.

Returns:
- `content: EditorContentStore` - Content store with two-way binding
- `selection: EditorSelectionStore` - Selection state
- `ready: Writable<boolean>` - Ready state
- `error: EditorErrorStore` - Error state
- `isReady: Readable<boolean>` - Derived ready state
- `hasError: Readable<boolean>` - Derived error state

#### Individual Store Creators

- `createEditorContentStore(initial?)` - Content store
- `createEditorSelectionStore()` - Selection store
- `createEditorReadyStore()` - Ready state store
- `createEditorErrorStore()` - Error store

## License

MIT
