<script lang="ts">
  /**
   * Svelte component wrapper for NotectlEditor
   */

  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { NotectlEditor as NotectlEditorCore } from '@notectl/core';
  import type { EditorConfig, EditorAPI } from '@notectl/core';

  // Props
  export let debug: boolean | undefined = undefined;
  export let content: string | object | undefined = undefined;
  export let placeholder: string | undefined = undefined;
  export let readOnly: boolean | undefined = undefined;
  export let accessibility: EditorConfig['accessibility'] | undefined = undefined;
  export let i18n: EditorConfig['i18n'] | undefined = undefined;
  export let theme: EditorConfig['theme'] | undefined = undefined;
  export let className: string = '';

  // Editor instance
  let containerRef: HTMLDivElement;
  let editor: NotectlEditorCore | null = null;

  // Event dispatcher
  const dispatch = createEventDispatcher<{
    contentChange: { content: unknown };
    selectionChange: { selection: unknown };
    focus: void;
    blur: void;
    ready: { editor: EditorAPI };
    error: { error: Error };
  }>();

  /**
   * Initialize editor
   */
  function initEditor() {
    if (!containerRef || editor) return;

    // Create editor instance
    editor = document.createElement('notectl-editor') as NotectlEditorCore;

    // Configure editor
    const config: EditorConfig = {
      debug,
      content,
      placeholder,
      readOnly,
      accessibility,
      i18n,
      theme,
    };
    editor.configure(config);

    // Attach event listeners
    editor.on('content-change', (data) => {
      dispatch('contentChange', { content: data.content });
    });

    editor.on('selection-change', (data) => {
      dispatch('selectionChange', { selection: data.selection });
    });

    editor.on('focus', () => {
      dispatch('focus');
    });

    editor.on('blur', () => {
      dispatch('blur');
    });

    editor.on('ready', () => {
      dispatch('ready', { editor: getEditorAPI() });
    });

    editor.on('error', (data) => {
      dispatch('error', { error: data.error });
    });

    // Mount editor
    containerRef.appendChild(editor);
  }

  /**
   * Destroy editor
   */
  function destroyEditor() {
    if (editor) {
      editor.destroy();
      if (containerRef?.contains(editor)) {
        containerRef.removeChild(editor);
      }
      editor = null;
    }
  }

  /**
   * Update editor configuration
   */
  function updateConfig() {
    if (!editor) return;

    const config: EditorConfig = {
      debug,
      content,
      placeholder,
      readOnly,
      accessibility,
      i18n,
      theme,
    };
    editor.configure(config);
  }

  /**
   * Get editor API
   */
  function getEditorAPI(): EditorAPI {
    if (!editor) {
      throw new Error('Editor not initialized');
    }
    return {
      getContent: () => editor!.getContent(),
      setContent: (content) => editor!.setContent(content),
      getState: () => editor!.getState(),
      executeCommand: (command, ...args) => editor!.executeCommand(command, ...args),
      registerPlugin: (plugin) => editor!.registerPlugin(plugin),
      unregisterPlugin: (pluginId) => editor!.unregisterPlugin(pluginId),
      destroy: () => editor!.destroy(),
    };
  }

  // Public API methods
  export function getContent(): unknown {
    return editor?.getContent();
  }

  export function setContent(newContent: unknown): void {
    editor?.setContent(newContent);
  }

  export function getState(): unknown {
    return editor?.getState();
  }

  export function executeCommand(command: string, ...args: unknown[]): void {
    editor?.executeCommand(command, ...args);
  }

  export function registerPlugin(plugin: unknown): void {
    editor?.registerPlugin(plugin);
  }

  export function unregisterPlugin(pluginId: string): void {
    editor?.unregisterPlugin(pluginId);
  }

  // Lifecycle
  onMount(() => {
    initEditor();
  });

  onDestroy(() => {
    destroyEditor();
  });

  // Reactive updates
  $: if (editor) {
    updateConfig();
  }
</script>

<div
  bind:this={containerRef}
  class={className}
  data-notectl-svelte-wrapper
/>

<style>
  div {
    display: block;
  }
</style>
