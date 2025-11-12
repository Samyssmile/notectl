/**
 * Plugin interface and types for Notectl
 */

import type { EditorState } from '../state/EditorState.js';
import type { Delta } from '../delta/Delta.js';
import type {
  Selection,
  BlockNode,
  Mark,
  BlockId,
  EditorEventKey,
  EditorEventPayload,
  EditorEventCallback
} from '../types/index.js';

/**
 * Plugin context provided to plugins
 */
export interface PluginContext {
  // === Core State & Delta Operations ===

  /**
   * Get current editor state
   */
  getState(): EditorState;

  /**
   * Apply a delta to the editor
   */
  applyDelta(delta: Delta): void;

  // === Selection Helpers ===

  /**
   * Get current selection
   */
  getSelection(): Selection | null;

  /**
   * Set selection
   */
  setSelection(selection: Selection): void;

  /**
   * Get the block containing the current cursor/selection
   */
  getSelectedBlock(): BlockNode | null;

  // === Node Queries ===

  /**
   * Find all blocks of a specific type
   * @param type - Block type to search for (e.g., 'table', 'heading', 'paragraph')
   * @returns Array of matching blocks
   */
  findBlocksByType(type: string): BlockNode[];

  /**
   * Find a block by its ID
   * @param blockId - Block identifier
   * @returns Block or undefined if not found
   */
  findBlockById(blockId: BlockId): BlockNode | undefined;

  /**
   * Find parent block of a given block
   * @param block - Child block
   * @returns Parent block or null if block is at root level
   */
  findParentBlock(block: BlockNode): BlockNode | null;

  /**
   * Get block at current cursor position
   */
  getBlockAtCursor(): BlockNode | null;

  // === Block Mutations (Delta-based) ===

  /**
   * Insert a block after another block
   * @param block - Block to insert
   * @param afterId - ID of block to insert after (if undefined, appends to end)
   */
  insertBlockAfter(block: BlockNode, afterId?: BlockId): void;

  /**
   * Insert a block before another block
   * @param block - Block to insert
   * @param beforeId - ID of block to insert before (if undefined, prepends to start)
   */
  insertBlockBefore(block: BlockNode, beforeId?: BlockId): void;

  /**
   * Update block attributes
   * @param blockId - Block to update
   * @param attrs - Attributes to merge
   */
  updateBlockAttrs(blockId: BlockId, attrs: Record<string, unknown>): void;

  /**
   * Delete a block
   * @param blockId - Block to delete
   */
  deleteBlock(blockId: BlockId): void;

  // === Mark Utilities ===

  /**
   * Add mark to current selection
   * @param mark - Mark to add
   */
  addMark(mark: Mark): void;

  /**
   * Remove mark from current selection
   * @param markType - Type of mark to remove
   */
  removeMark(markType: string): void;

  /**
   * Toggle mark on current selection
   * @param markType - Type of mark to toggle
   */
  toggleMark(markType: string): void;

  // === Events ===

  /**
   * Register event listener with type-safe payload
   * @param event - Event name (autocomplete for known core + plugin events)
   * @param callback - Callback function with typed payload
   * @example
   * ```typescript
   * context.on('change', (data) => {
   *   // data is typed as { state: EditorState; delta?: Delta }
   *   console.log(data.state);
   * });
   *
   * context.on('table:inserted', (data) => {
   *   // data is typed based on plugin's event declaration
   *   console.log(data.tableId);
   * });
   * ```
   */
  on<K extends EditorEventKey>(
    event: K,
    callback: EditorEventCallback<EditorEventPayload<K>>
  ): void;

  /**
   * Unregister event listener
   * @param event - Event name
   * @param callback - Callback function to remove
   */
  off<K extends EditorEventKey>(
    event: K,
    callback: EditorEventCallback<EditorEventPayload<K>>
  ): void;

  /**
   * Emit an event with typed payload
   * @param event - Event name
   * @param data - Event payload (typed based on event)
   * @example
   * ```typescript
   * context.emit('table:inserted', {
   *   tableId: 'table-123',
   *   rows: 3,
   *   cols: 4
   * });
   * ```
   */
  emit<K extends EditorEventKey>(
    event: K,
    data?: EditorEventPayload<K>
  ): void;

  // === Commands ===

  /**
   * Register a command
   */
  registerCommand(name: string, handler: CommandHandler): void;

  /**
   * Execute a command
   */
  executeCommand(name: string, ...args: unknown[]): unknown;

  // === DOM Access (discouraged, use Delta operations instead) ===

  /**
   * Access DOM container (editable area)
   * @deprecated Prefer using Delta operations instead of direct DOM manipulation
   */
  getContainer(): HTMLElement;

  /**
   * Access plugin container for UI elements (toolbar, etc.)
   * @param position - 'top' or 'bottom'
   */
  getPluginContainer(position: 'top' | 'bottom'): HTMLElement;
}

/**
 * Command handler function
 */
export type CommandHandler = (...args: unknown[]) => unknown;

/**
 * Plugin interface
 */
export interface Plugin {
  /**
   * Unique plugin identifier
   */
  id: string;

  /**
   * Plugin name
   */
  name: string;

  /**
   * Plugin version
   */
  version: string;

  /**
   * Plugin dependencies (optional)
   */
  dependencies?: string[];

  /**
   * Initialize the plugin
   */
  init(context: PluginContext): Promise<void> | void;

  /**
   * Cleanup the plugin
   */
  destroy?(): Promise<void> | void;

  /**
   * Handle state updates (optional)
   */
  onStateUpdate?(oldState: EditorState, newState: EditorState): void;

  /**
   * Handle delta application (optional)
   */
  onDeltaApplied?(delta: Delta): void;
}

/**
 * Plugin factory function type
 */
export type PluginFactory<TConfig = unknown> = (config?: TConfig) => Plugin;

/**
 * Base plugin class for convenience
 */
export abstract class BasePlugin implements Plugin {
  abstract id: string;
  abstract name: string;
  abstract version: string;
  dependencies?: string[];

  protected context?: PluginContext;

  async init(context: PluginContext): Promise<void> {
    this.context = context;
  }

  async destroy(): Promise<void> {
    this.context = undefined;
  }

  protected getContext(): PluginContext {
    if (!this.context) {
      throw new Error('Plugin not initialized');
    }
    return this.context;
  }
}
