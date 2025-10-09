/**
 * Svelte stores for NotectlEditor state management
 */

import { writable, derived, get, type Readable, type Writable } from 'svelte/store';
import type { EditorAPI } from '@notectl/core';

/**
 * Editor content store
 */
export interface EditorContentStore extends Writable<unknown> {
  bindToEditor: (editor: EditorAPI) => () => void;
}

/**
 * Create a writable store for editor content with two-way binding
 */
export function createEditorContentStore(initialContent?: unknown): EditorContentStore {
  const store = writable(initialContent);
  let editor: EditorAPI | null = null;
  let unsubscribe: (() => void) | null = null;

  return {
    ...store,
    /**
     * Bind store to editor instance for two-way sync
     * Returns cleanup function
     */
    bindToEditor: (editorInstance: EditorAPI) => {
      editor = editorInstance;

      // Set initial content
      const currentContent = get(store);
      if (currentContent !== undefined && currentContent !== null) {
        if (typeof currentContent === 'string') {
          editor.setContent(currentContent);
        }
      }

      // Subscribe to store changes -> update editor
      unsubscribe = store.subscribe((content) => {
        if (editor && content !== undefined && content !== null) {
          const editorContent = editor.getContent();
          if (JSON.stringify(editorContent) !== JSON.stringify(content)) {
            if (typeof content === 'string') {
              editor.setContent(content);
            }
          }
        }
      });

      // Listen to editor changes -> update store
      // Note: This would require the editor to support event listeners
      // For now, users should manually update the store via contentChange event

      return () => {
        unsubscribe?.();
        unsubscribe = null;
        editor = null;
      };
    },
  };
}

/**
 * Editor selection store
 */
export interface EditorSelectionStore extends Readable<unknown> {
  bindToEditor: (editor: EditorAPI, onSelectionChange: (data: { selection: unknown }) => void) => () => void;
}

/**
 * Create a readable store for editor selection
 */
export function createEditorSelectionStore(): EditorSelectionStore {
  const { subscribe, set } = writable(null);

  return {
    subscribe,
    /**
     * Bind store to editor instance
     * Requires onSelectionChange event handler
     */
    bindToEditor: (_editor: EditorAPI, onSelectionChange: (data: { selection: unknown }) => void) => {
      // This is a placeholder - actual implementation would require editor event system
      const _handler = (data: { selection: unknown }) => {
        set(data.selection as any);
        onSelectionChange?.(data);
      };

      return () => {
        // Cleanup
        set(null);
      };
    },
  };
}

/**
 * Editor ready state store
 */
export function createEditorReadyStore(): Writable<boolean> {
  return writable(false);
}

/**
 * Editor error store
 */
export interface EditorErrorStore extends Readable<Error | null> {
  clear: () => void;
}

/**
 * Create a store for editor errors
 */
export function createEditorErrorStore(): EditorErrorStore {
  const { subscribe, set } = writable<Error | null>(null);

  return {
    subscribe,
    clear: () => set(null),
  };
}

/**
 * Composite editor state store
 */
export interface EditorStateStore {
  content: EditorContentStore;
  selection: EditorSelectionStore;
  ready: Writable<boolean>;
  error: EditorErrorStore;
  isReady: Readable<boolean>;
  hasError: Readable<boolean>;
}

/**
 * Create a composite store for all editor state
 */
export function createEditorStore(initialContent?: unknown): EditorStateStore {
  const content = createEditorContentStore(initialContent);
  const selection = createEditorSelectionStore();
  const ready = createEditorReadyStore();
  const error = createEditorErrorStore();

  const isReady = derived(ready, ($ready) => $ready);
  const hasError = derived(error, ($error) => $error !== null);

  return {
    content,
    selection,
    ready,
    error,
    isReady,
    hasError,
  };
}
