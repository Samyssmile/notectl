/**
 * @notectl/svelte - Svelte adapter for NotectlEditor
 * @packageDocumentation
 */

// Component
export { default as NotectlEditor } from './NotectlEditor.svelte';

// Actions
export { notectlEditor, getEditorFromElement } from './actions';
export type { NotectlEditorActionOptions } from './actions';

// Stores
export {
  createEditorContentStore,
  createEditorSelectionStore,
  createEditorReadyStore,
  createEditorErrorStore,
  createEditorStore,
} from './stores';
export type {
  EditorContentStore,
  EditorSelectionStore,
  EditorErrorStore,
  EditorStateStore,
} from './stores';
