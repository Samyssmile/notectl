/**
 * Editor state management
 * Maintains the document state and provides methods for querying and updating
 */

import type { Document, Selection, BlockNode, BlockId, Node } from '../types/index.js';
import { Schema, createDefaultSchema } from '../schema/Schema.js';
import { NodeFactory, createNodeFactory } from '../schema/NodeFactory.js';
import type { Delta } from '../delta/Delta.js';
import type { Operation } from '../delta/Operations.js';

/**
 * History entry for undo/redo
 */
interface HistoryEntry {
  delta: Delta;
  inverseOps: Operation[];
  timestamp: number;
}

/**
 * Editor state class
 */
export class EditorState {
  private document: Document;
  private selection: Selection | null = null;
  private history: HistoryEntry[] = [];
  private historyIndex: number = -1;
  private maxHistoryDepth: number;
  
  readonly schema: Schema;
  readonly nodeFactory: NodeFactory;

  constructor(
    initialDoc?: Document,
    schema?: Schema,
    options?: { maxHistoryDepth?: number }
  ) {
    this.schema = schema || createDefaultSchema();
    this.nodeFactory = createNodeFactory(this.schema);
    this.maxHistoryDepth = options?.maxHistoryDepth || 100;

    this.document = initialDoc || {
      version: 0,
      schemaVersion: '1.0.0',
      children: [this.nodeFactory.paragraph()],
    };
  }

  /**
   * Get current document
   */
  getDocument(): Document {
    return this.document;
  }

  /**
   * Get document version
   */
  getVersion(): number {
    return this.document.version;
  }

  /**
   * Get current selection
   */
  getSelection(): Selection | null {
    return this.selection;
  }

  /**
   * Set selection
   */
  setSelection(selection: Selection | null): void {
    this.selection = selection;
  }

  /**
   * Apply a delta to the state
   */
  applyDelta(delta: Delta): void {
    // Validate delta version
    if (delta.baseVersion !== this.document.version) {
      throw new Error(
        `Delta version mismatch: expected ${this.document.version}, got ${delta.baseVersion}`
      );
    }

    // Store in history (only if not a selection update)
    const hasContentOps = delta.ops.some((op) => op.op !== 'update_selection');
    if (hasContentOps) {
      this.addToHistory(delta);
    }

    // Apply each operation
    for (const op of delta.ops) {
      this.applyOperation(op);
    }

    // Increment version
    this.document.version++;
  }

  /**
   * Apply a single operation
   */
  private applyOperation(op: Operation): void {
    switch (op.op) {
      case 'insert_text':
        this.applyInsertText(op);
        break;
      case 'delete_range':
        this.applyDeleteRange(op);
        break;
      case 'apply_mark':
        this.applyMark(op);
        break;
      case 'insert_block_after':
        this.applyInsertBlockAfter(op);
        break;
      case 'insert_block_before':
        this.applyInsertBlockBefore(op);
        break;
      case 'delete_block':
        this.applyDeleteBlock(op);
        break;
      case 'set_attrs':
        this.applySetAttrs(op);
        break;
      case 'update_selection':
        this.selection = {
          anchor: op.selection.anchor,
          head: op.selection.head,
        };
        break;
      // Table operations would be implemented here
      default:
        console.warn('Unhandled operation type:', (op as Operation).op);
    }
  }

  /**
   * Apply insert text operation
   */
  private applyInsertText(op: Extract<Operation, { op: 'insert_text' }>): void {
    const block = this.findBlock(op.target.blockId);
    if (!block || !block.children) return;

    // Find text node at offset and insert text
    // Simplified implementation - would need proper offset handling
    const textNode = block.children.find((n): n is Extract<Node, { type: 'text' }> => 'text' in n);
    if (textNode) {
      const before = textNode.text.slice(0, op.target.offset);
      const after = textNode.text.slice(op.target.offset);
      textNode.text = before + op.text + after;
      if (op.marks && op.marks.length > 0) {
        textNode.marks = op.marks;
      }
    }
  }

  /**
   * Apply delete range operation
   */
  private applyDeleteRange(op: Extract<Operation, { op: 'delete_range' }>): void {
    const block = this.findBlock(op.range.start.blockId);
    if (!block || !block.children) return;

    const textNode = block.children.find((n): n is Extract<Node, { type: 'text' }> => 'text' in n);
    if (textNode) {
      const before = textNode.text.slice(0, op.range.start.offset);
      const after = textNode.text.slice(op.range.end.offset);
      textNode.text = before + after;
    }
  }

  /**
   * Apply mark operation
   */
  private applyMark(op: Extract<Operation, { op: 'apply_mark' }>): void {
    const block = this.findBlock(op.range.start.blockId);
    if (!block || !block.children) return;

    const textNode = block.children.find((n): n is Extract<Node, { type: 'text' }> => 'text' in n);
    if (textNode) {
      if (op.add) {
        textNode.marks = textNode.marks || [];
        if (!textNode.marks.some((m) => m.type === op.mark.type)) {
          textNode.marks.push(op.mark);
        }
      } else {
        textNode.marks = textNode.marks?.filter((m) => m.type !== op.mark.type);
      }
    }
  }

  /**
   * Apply insert block after operation
   */
  private applyInsertBlockAfter(op: Extract<Operation, { op: 'insert_block_after' }>): void {
    const index = this.document.children.findIndex((b) => b.id === op.after);
    if (index !== -1) {
      this.document.children.splice(index + 1, 0, op.block);
    }
  }

  /**
   * Apply insert block before operation
   */
  private applyInsertBlockBefore(op: Extract<Operation, { op: 'insert_block_before' }>): void {
    const index = this.document.children.findIndex((b) => b.id === op.before);
    if (index !== -1) {
      this.document.children.splice(index, 0, op.block);
    }
  }

  /**
   * Apply delete block operation
   */
  private applyDeleteBlock(op: Extract<Operation, { op: 'delete_block' }>): void {
    const index = this.document.children.findIndex((b) => b.id === op.target.blockId);
    if (index !== -1) {
      this.document.children.splice(index, 1);
    }
  }

  /**
   * Apply set attributes operation
   */
  private applySetAttrs(op: Extract<Operation, { op: 'set_attrs' }>): void {
    const block = this.findBlock(op.target.blockId);
    if (block) {
      block.attrs = { ...block.attrs, ...op.attrs };
    }
  }

  /**
   * Find a block by ID
   */
  findBlock(blockId: BlockId): BlockNode | undefined {
    const search = (nodes: BlockNode[]): BlockNode | undefined => {
      for (const node of nodes) {
        if (node.id === blockId) {
          return node;
        }
        if (node.children) {
          const blockChildren = node.children.filter((n): n is BlockNode => 'id' in n);
          const found = search(blockChildren);
          if (found) return found;
        }
      }
      return undefined;
    };

    return search(this.document.children);
  }

  /**
   * Add delta to history
   */
  private addToHistory(delta: Delta): void {
    // Remove any redo entries
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    // Add to history
    this.history.push({
      delta,
      inverseOps: delta.inverseOps || [],
      timestamp: Date.now(),
    });

    // Maintain max depth
    if (this.history.length > this.maxHistoryDepth) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
  }

  /**
   * Undo last change
   */
  canUndo(): boolean {
    return this.historyIndex >= 0;
  }

  undo(): Delta | null {
    if (!this.canUndo()) return null;

    const entry = this.history[this.historyIndex];
    this.historyIndex--;

    // Create undo delta with inverse operations
    return {
      txnId: `undo-${entry.delta.txnId}`,
      clientId: entry.delta.clientId,
      timestamp: new Date().toISOString(),
      baseVersion: this.document.version,
      ltime: Date.now(),
      intent: 'edit',
      ops: entry.inverseOps,
    };
  }

  /**
   * Redo last undone change
   */
  canRedo(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  redo(): Delta | null {
    if (!this.canRedo()) return null;

    this.historyIndex++;
    const entry = this.history[this.historyIndex];

    return entry.delta;
  }

  /**
   * Export state as JSON
   */
  toJSON(): Document {
    return this.document;
  }

  /**
   * Create state from JSON
   */
  static fromJSON(json: Document, schema?: Schema): EditorState {
    return new EditorState(json, schema);
  }
}
