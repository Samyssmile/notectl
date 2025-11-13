/**
 * Core type definitions for Notectl editor
 */

import type { FontConfigInput } from '../fonts/types.js';

/**
 * Unique identifier for blocks (UUID/ULID)
 */
export type BlockId = string;

/**
 * Text position within a block (code point offset)
 */
export interface Position {
  blockId: BlockId;
  offset: number;
}

/**
 * Range of text across blocks
 */
export interface Range {
  start: Position;
  end: Position;
}

/**
 * Text mark (inline formatting)
 */
export interface Mark {
  type: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code' | 'link' | string;
  attrs?: Record<string, unknown>;
}

/**
 * Node types in the document
 */
export type NodeType =
  | 'text'
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'list_item'
  | 'table'
  | 'table_row'
  | 'table_cell'
  | 'image'
  | 'code_block'
  | string;

/**
 * Text node
 */
export interface TextNode {
  type: 'text';
  text: string;
  marks?: Mark[];
}

/**
 * Block node attributes
 */
export interface BlockAttrs {
  align?: 'left' | 'center' | 'right' | 'justify';
  level?: number;
  alt?: string;
  src?: string;
  decorative?: boolean;
  dir?: 'ltr' | 'rtl' | 'auto';
  locale?: string;
  [key: string]: unknown;
}

/**
 * Block node (structural element)
 */
export interface BlockNode {
  id: BlockId;
  type: NodeType;
  attrs?: BlockAttrs;
  children?: Node[];
}

/**
 * Union of all node types
 */
export type Node = TextNode | BlockNode;

/**
 * Document structure
 */
export interface Document {
  version: number;
  schemaVersion: string;
  children: BlockNode[];
}

/**
 * Selection state
 */
export interface Selection {
  anchor: Position;
  head: Position;
}

/**
 * Core editor event map with typed payloads
 * Maps event names to their payload types for type safety
 */
export interface CoreEditorEventMap {
  /**
   * Fired when editor content or state changes
   */
  'change': { state: unknown; delta?: unknown };

  /**
   * Fired when selection changes
   */
  'selection-change': { selection: Selection };

  /**
   * Fired when content changes (deprecated, use 'change')
   */
  'content-change': { state: unknown };

  /**
   * Fired when editor gains focus
   */
  'focus': { state: unknown };

  /**
   * Fired when editor loses focus
   */
  'blur': { state: unknown };

  /**
   * Fired when editor is ready and mounted
   */
  'ready': { editor: unknown };

  /**
   * Fired when an error occurs
   */
  'error': { error: Error; code?: string; message: string };

  /**
   * Fired when a plugin is registered
   */
  'plugin-registered': { pluginId: string; plugin: unknown };

  /**
   * Fired when a plugin is unregistered
   */
  'plugin-unregistered': { pluginId: string };

  /**
   * Fired on keydown events (internal)
   */
  'keydown': KeyboardEvent;

  /**
   * Fired on context menu events (internal)
   */
  'contextmenu': MouseEvent;
}

/**
 * Plugin event map (empty interface for declaration merging)
 * Plugins can extend this interface to add their own typed events
 *
 * @example
 * ```typescript
 * declare module '@notectl/core' {
 *   interface PluginEventMap {
 *     'table:inserted': { tableId: string; rows: number; cols: number };
 *     'table:row-inserted': { tableId: string; rowIndex: number };
 *   }
 * }
 * ```
 */
export interface PluginEventMap {}

/**
 * Complete editor event map (core + plugin events)
 * Supports arbitrary string events for maximum plugin flexibility
 */
export type EditorEventMap = CoreEditorEventMap & PluginEventMap & Record<string, unknown>;

/**
 * Union of all known event keys plus string for plugin events
 * The `(string & {})` pattern preserves autocomplete for known events
 * while allowing arbitrary string events from plugins
 */
export type EditorEventKey = keyof EditorEventMap | (string & {});

/**
 * Extract payload type for a given event key
 * Known events return their specific payload type
 * Unknown events return unknown (requiring manual type narrowing)
 */
export type EditorEventPayload<K extends EditorEventKey> =
  K extends keyof EditorEventMap ? EditorEventMap[K] : unknown;

/**
 * Editor event callback with typed payload
 */
export type EditorEventCallback<T = unknown> = (data: T) => void;

/**
 * Editor API interface
 * Public methods exposed by the NotectlEditor class
 */
export interface EditorAPI {
  // Configuration
  configure(config: Partial<EditorConfig>): void;

  // Content management
  getContent(): Document | string;
  setContent(content: string, allowHTML?: boolean): void;
  getHTML(): string;
  setHTML(html: string): void;
  getJSON(): Document;
  setJSON(doc: Document): void;
  exportHTML(): string;

  // State management
  getState(): unknown;

  // History
  undo(): void;
  redo(): void;

  // Events - Type-safe event system with payload inference
  /**
   * Register an event listener with type-safe payload
   * @param event - Event name (autocomplete for known events)
   * @param callback - Callback function with typed payload
   * @example
   * ```typescript
   * editor.on('change', (data) => {
   *   // data is typed as { state: EditorState; delta?: Delta }
   *   console.log(data.state);
   * });
   *
   * editor.on('table:inserted', (data) => {
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
   * Unregister an event listener
   * @param event - Event name
   * @param callback - Callback function to remove
   */
  off<K extends EditorEventKey>(
    event: K,
    callback: EditorEventCallback<EditorEventPayload<K>>
  ): void;

  // Commands
  registerCommand(name: string, handler: (...args: unknown[]) => unknown): void;
  executeCommand(name: string, ...args: unknown[]): unknown;

  // Plugins
  registerPlugin(plugin: unknown): Promise<void>;
  unregisterPlugin(pluginId: string): Promise<void>;

  // Focus management
  focus(): void;
  blur(): void;

  // Lifecycle
  destroy(): void;
}

export type {
  FontManifest,
  FontDefinition,
  FontVariantDefinition,
  FontSource,
  FontFormat,
  FontConfigInput,
  RegisteredFontSummary,
} from '../fonts/types.js';

/**
 * Visual customization options for the editor host
 */
export interface EditorAppearance {
  fontFamily?: string | null;
  fontSize?: string | number | null;
}

/**
 * Editor configuration options
 */
export interface EditorConfig {
  initialContent?: Document;
  placeholder?: string;
  readonly?: boolean;
  autofocus?: boolean;
  sanitizeHTML?: boolean;
  maxHistoryDepth?: number;
  content?: string | Document;
  fonts?: FontConfigInput;
  appearance?: EditorAppearance;
  [key: string]: unknown;
}

/**
 * Validation constraint types
 */
export type ValidationConstraint =
  | 'noDanglingRefs'
  | 'tableGridConsistent'
  | 'altOrDecorative'
  | 'rtlIntegrity'
  | string;

/**
 * Error response envelope
 */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Command handler function signature
 */
export type CommandHandler<TArgs extends unknown[] = unknown[], TReturn = unknown> = (
  ...args: TArgs
) => TReturn | Promise<TReturn>;

/**
 * Command definition with type safety
 */
export interface CommandDefinition<TArgs extends unknown[] = unknown[], TReturn = unknown> {
  name: string;
  description?: string;
  handler: CommandHandler<TArgs, TReturn>;
}

/**
 * Built-in command registry
 * Maps command names to their handlers
 */
export interface CommandRegistry {
  [key: string]: CommandHandler<unknown[], unknown>;
}

/**
 * Selection helper utilities
 */
export interface SelectionHelpers {
  /**
   * Check if selection is collapsed (cursor)
   */
  isCollapsed(selection: Selection): boolean;

  /**
   * Check if selection spans multiple blocks
   */
  isMultiBlock(selection: Selection): boolean;

  /**
   * Get the direction of selection (forward/backward)
   */
  getDirection(selection: Selection): 'forward' | 'backward' | 'none';

  /**
   * Create a collapsed selection at a position
   */
  createCollapsed(position: Position): Selection;

  /**
   * Create a selection range
   */
  createRange(start: Position, end: Position): Selection;
}

/**
 * Block type utilities
 */
export interface BlockHelpers {
  /**
   * Check if a node is a text node
   */
  isTextNode(node: Node): node is TextNode;

  /**
   * Check if a node is a block node
   */
  isBlockNode(node: Node): node is BlockNode;

  /**
   * Get all text content from a block
   */
  getTextContent(block: BlockNode): string;

  /**
   * Check if block is empty
   */
  isEmpty(block: BlockNode): boolean;
}

/**
 * Table structure for attributes
 */
export interface TableData {
  rows: TableRow[];
}

/**
 * Table row structure
 */
export interface TableRow {
  id?: string;
  cells: TableCell[];
  attrs?: {
    style?: Record<string, string | number>;
    [key: string]: unknown;
  };
}

/**
 * Table cell structure
 */
export interface TableCell {
  id?: string;
  content?: BlockNode[];
  rowSpan?: number;
  colSpan?: number;
  attrs?: {
    style?: Record<string, string | number>;
    [key: string]: unknown;
  };
}
