/**
 * Vue component wrapper for NotectlEditor
 */

import { defineComponent, ref, onMounted, onUnmounted, watch, h, type PropType } from 'vue';
import { NotectlEditor as NotectlEditorCore } from '@notectl/core';
import type { EditorConfig } from '@notectl/core';

export interface NotectlEditorProps extends EditorConfig {
  /** On content change callback */
  onContentChange?: (content: unknown) => void;
  /** On selection change callback */
  onSelectionChange?: (selection: unknown) => void;
  /** On focus callback */
  onFocus?: () => void;
  /** On blur callback */
  onBlur?: () => void;
  /** On ready callback */
  onReady?: (editor: NotectlEditorCore) => void;
  /** On error callback */
  onError?: (error: Error) => void;
}

/**
 * NotectlEditor Vue component
 */
export const NotectlEditor = defineComponent({
  name: 'NotectlEditor',
  props: {
    debug: Boolean as PropType<boolean>,
    content: [String, Object] as PropType<string | object>,
    placeholder: String as PropType<string>,
    readOnly: Boolean as PropType<boolean>,
    accessibility: Object as PropType<EditorConfig['accessibility']>,
    i18n: Object as PropType<EditorConfig['i18n']>,
    theme: Object as PropType<EditorConfig['theme']>,
    onContentChange: Function as PropType<(content: unknown) => void>,
    onSelectionChange: Function as PropType<(selection: unknown) => void>,
    onFocus: Function as PropType<() => void>,
    onBlur: Function as PropType<() => void>,
    onReady: Function as PropType<(editor: NotectlEditorCore) => void>,
    onError: Function as PropType<(error: Error) => void>,
  },
  setup(props, { expose }) {
    const containerRef = ref<HTMLDivElement | null>(null);
    const editorRef = ref<NotectlEditorCore | null>(null);

    const init = () => {
      if (!containerRef.value) return;

      // Create editor instance
      const editor = document.createElement('notectl-editor') as NotectlEditorCore;
      editorRef.value = editor;

      // Configure editor
      const config: EditorConfig = {
        debug: props.debug,
        content: props.content,
        placeholder: props.placeholder,
        readOnly: props.readOnly,
        accessibility: props.accessibility,
        i18n: props.i18n,
        theme: props.theme,
      };
      editor.configure(config);

      // Attach event listeners
      if (props.onContentChange) {
        editor.on('content-change', (data) => {
          const eventData = data as { content?: unknown };
          props.onContentChange?.(eventData.content);
        });
      }
      if (props.onSelectionChange) {
        editor.on('selection-change', (data) => {
          const eventData = data as { selection?: unknown };
          props.onSelectionChange?.(eventData.selection);
        });
      }
      if (props.onFocus) {
        editor.on('focus', props.onFocus);
      }
      if (props.onBlur) {
        editor.on('blur', props.onBlur);
      }
      if (props.onReady) {
        editor.on('ready', () => props.onReady?.(editor));
      }
      if (props.onError) {
        editor.on('error', (data) => {
          const eventData = data as { error?: Error };
          if (eventData.error) {
            props.onError?.(eventData.error);
          }
        });
      }

      // Mount editor
      containerRef.value.appendChild(editor);
    };

    const destroy = () => {
      if (editorRef.value) {
        editorRef.value.destroy();
        if (containerRef.value?.contains(editorRef.value)) {
          containerRef.value.removeChild(editorRef.value);
        }
        editorRef.value = null;
      }
    };

    onMounted(() => {
      init();
    });

    onUnmounted(() => {
      destroy();
    });

    // Watch for config changes
    watch(
      () => ({
        debug: props.debug,
        content: props.content,
        placeholder: props.placeholder,
        readOnly: props.readOnly,
        accessibility: props.accessibility,
        i18n: props.i18n,
        theme: props.theme,
      }),
      (config) => {
        if (editorRef.value) {
          editorRef.value.configure(config);
        }
      },
      { deep: true }
    );

    // Expose editor API
    expose({
      editor: editorRef,
      getContent: () => editorRef.value?.getContent(),
      setContent: (content: string, allowHTML?: boolean) => editorRef.value?.setContent(content, allowHTML),
      getState: () => editorRef.value?.getState(),
      executeCommand: (command: string, ...args: unknown[]) =>
        editorRef.value?.executeCommand(command, ...args),
      registerPlugin: (plugin: unknown) => editorRef.value?.registerPlugin(plugin as any),
      unregisterPlugin: (pluginId: string) => editorRef.value?.unregisterPlugin(pluginId),
      destroy,
    });

    return () => h('div', { ref: containerRef, 'data-notectl-vue-wrapper': '' });
  },
});
