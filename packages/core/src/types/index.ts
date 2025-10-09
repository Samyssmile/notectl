/**
 * Core type definitions for Notectl editor
 */

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
 * Editor event types
 */
export type EditorEvent =
  | 'change'
  | 'selection-change'
  | 'content-change'
  | 'focus'
  | 'blur'
  | 'ready'
  | 'error'
  | 'plugin-registered'
  | 'plugin-unregistered';

/**
 * Editor event callback
 */
export type EditorEventCallback<T = unknown> = (data: T) => void;

/**
 * Editor API interface
 * Public methods exposed by the NotectlEditor class
 */
export interface EditorAPI {
  // Configuration
  configure(config: EditorConfig): void;

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

  // Events
  on(event: EditorEvent, callback: EditorEventCallback): void;
  off(event: EditorEvent, callback: EditorEventCallback): void;

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
  content: string;
  rowSpan?: number;
  colSpan?: number;
  attrs?: {
    style?: Record<string, string | number>;
    [key: string]: unknown;
  };
}
