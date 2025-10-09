/**
 * Svelte actions for NotectlEditor
 */

import { NotectlEditor as NotectlEditorCore } from '@notectl/core';
import type { EditorConfig, EditorAPI } from '@notectl/core';

export interface NotectlEditorActionOptions extends EditorConfig {
  onContentChange?: (content: unknown) => void;
  onSelectionChange?: (selection: unknown) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onReady?: (editor: EditorAPI) => void;
  onError?: (error: Error) => void;
}

/**
 * Svelte action to initialize NotectlEditor on an element
 *
 * Usage:
 * ```svelte
 * <div use:notectlEditor={{ content: initialContent, onContentChange: handleChange }} />
 * ```
 */
export function notectlEditor(node: HTMLElement, options: NotectlEditorActionOptions = {}) {
  let editor: NotectlEditorCore | null = null;

  function init() {
    // Create editor instance
    editor = document.createElement('notectl-editor') as NotectlEditorCore;

    // Configure editor
    const {
      onContentChange,
      onSelectionChange,
      onFocus,
      onBlur,
      onReady,
      onError,
      ...config
    } = options;

    editor.configure(config);

    // Attach event listeners
    if (onContentChange) {
      editor.on('content-change', (data) => {
        const eventData = data as { content?: unknown };
        onContentChange(eventData.content);
      });
    }
    if (onSelectionChange) {
      editor.on('selection-change', (data) => {
        const eventData = data as { selection?: unknown };
        onSelectionChange(eventData.selection);
      });
    }
    if (onFocus) {
      editor.on('focus', onFocus);
    }
    if (onBlur) {
      editor.on('blur', onBlur);
    }
    if (onReady) {
      editor.on('ready', () => {
        if (!editor) return;
        onReady(editor as EditorAPI);
      });
    }
    if (onError) {
      editor.on('error', (data) => {
        const eventData = data as { error?: Error };
        if (eventData.error) {
          onError(eventData.error);
        }
      });
    }

    // Mount editor
    node.appendChild(editor);
  }

  function destroy() {
    if (editor) {
      editor.destroy();
      if (node.contains(editor)) {
        node.removeChild(editor);
      }
      editor = null;
    }
  }

  function update(newOptions: NotectlEditorActionOptions) {
    if (!editor) return;

    const {
      onContentChange,
      onSelectionChange,
      onFocus,
      onBlur,
      onReady,
      onError,
      ...config
    } = newOptions;

    editor.configure(config);
  }

  // Initialize
  init();

  return {
    update,
    destroy,
  };
}

/**
 * Get editor API from an element with notectlEditor action
 */
export function getEditorFromElement(element: HTMLElement): EditorAPI | null {
  const editorElement = element.querySelector('notectl-editor') as NotectlEditorCore;
  if (!editorElement) return null;

  return editorElement as EditorAPI;
}
