/**
 * Vue composable for using Notectl programmatically
 */

import { ref, onUnmounted, type Ref } from 'vue';
import { NotectlEditor } from '@notectl/core';
import type { EditorConfig, EditorAPI } from '@notectl/core';

export interface UseNotectlOptions extends EditorConfig {}

export interface UseNotectlReturn {
  /** Editor instance */
  editor: Ref<EditorAPI | null>;
  /** Whether editor is ready */
  isReady: Ref<boolean>;
  /** Initialize editor */
  init: (element: HTMLElement) => void;
  /** Destroy editor */
  destroy: () => void;
}

/**
 * Composable for using Notectl programmatically
 */
export function useNotectl(options: UseNotectlOptions = {}): UseNotectlReturn {
  const editor = ref<EditorAPI | null>(null);
  const isReady = ref(false);
  const editorInstance = ref<NotectlEditor | null>(null);

  const init = (element: HTMLElement) => {
    if (editorInstance.value) {
      destroy();
    }

    const editorElement = document.createElement('notectl-editor') as NotectlEditor;
    editorElement.configure(options);

    editorElement.on('ready', () => {
      isReady.value = true;
    });

    element.appendChild(editorElement);
    editorInstance.value = editorElement;
    editor.value = editorElement;
  };

  const destroy = () => {
    if (editorInstance.value) {
      editorInstance.value.destroy();
      editorInstance.value = null;
      editor.value = null;
      isReady.value = false;
    }
  };

  onUnmounted(() => {
    destroy();
  });

  return {
    editor,
    isReady,
    init,
    destroy,
  };
}
