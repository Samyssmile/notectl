/**
 * Notectl Core - Framework-agnostic rich text editor
 * @packageDocumentation
 */

// Main editor
export { NotectlEditor } from './editor/NotectlEditor.js';
import { NotectlEditor } from './editor/NotectlEditor.js';

// State management
export { EditorState } from './state/EditorState.js';

// Schema
export { Schema, createDefaultSchema } from './schema/Schema.js';
export type { NodeSpec, MarkSpec, AttributeSpec } from './schema/Schema.js';

// Node factory
export { NodeFactory, createNodeFactory, generateBlockId } from './schema/NodeFactory.js';

// Plugin system
export { PluginManager } from './plugins/PluginManager.js';
export { BasePlugin } from './plugins/Plugin.js';
export type {
  Plugin,
  PluginContext,
  PluginFactory,
  CommandHandler,
} from './plugins/Plugin.js';

// Delta system
export { DeltaBuilder, createDelta, computeInverse, validateDelta } from './delta/Delta.js';
export type { Delta, DeltaValidation } from './delta/Delta.js';

// Operations
export type {
  Operation,
  InsertTextOp,
  DeleteRangeOp,
  ApplyMarkOp,
  InsertBlockBeforeOp,
  InsertBlockAfterOp,
  DeleteBlockOp,
  SetAttrsOp,
  WrapInOp,
  LiftOutOp,
  TableInsertRowOp,
  TableDeleteRowOp,
  TableInsertColOp,
  TableDeleteColOp,
  TableMergeCellsOp,
  TableSplitCellOp,
  UpdateSelectionOp,
} from './delta/Operations.js';
export {
  isTextOperation,
  isBlockOperation,
  isTableOperation,
  isSelectionOperation,
} from './delta/Operations.js';

// Transformation
export { transformOperation, transformDelta, composeDelta, canCompose } from './delta/Transform.js';

// Core types
export type {
  BlockId,
  Position,
  Range,
  Mark,
  NodeType,
  TextNode,
  BlockNode,
  BlockAttrs,
  Node,
  Document,
  Selection,
  EditorEvent,
  EditorEventCallback,
  EditorConfig,
  EditorAPI,
  ValidationConstraint,
  ErrorEnvelope,
} from './types/index.js';
import type { EditorConfig } from './types/index.js';

// Utility function to initialize editor
export function createEditor(container: HTMLElement, config?: EditorConfig) {
  const editor = new NotectlEditor();

  // Apply configuration if provided
  if (config) {
    // Config would be applied here
  }

  container.appendChild(editor);
  return editor;
}

// Version
export const VERSION = '0.0.1';
