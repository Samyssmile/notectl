/**
 * Helper utilities for selection, blocks, and node operations
 */

import type {
  Selection,
  Position,
  BlockNode,
  TextNode,
  Node as NotectlNode,
  SelectionHelpers,
  BlockHelpers,
} from '../types/index.js';

/**
 * Selection helper implementation
 */
export const selectionHelpers: SelectionHelpers = {
  /**
   * Check if selection is collapsed (cursor)
   */
  isCollapsed(selection: Selection): boolean {
    return (
      selection.anchor.blockId === selection.head.blockId &&
      selection.anchor.offset === selection.head.offset
    );
  },

  /**
   * Check if selection spans multiple blocks
   */
  isMultiBlock(selection: Selection): boolean {
    return selection.anchor.blockId !== selection.head.blockId;
  },

  /**
   * Get the direction of selection (forward/backward)
   */
  getDirection(selection: Selection): 'forward' | 'backward' | 'none' {
    if (this.isCollapsed(selection)) {
      return 'none';
    }

    if (selection.anchor.blockId === selection.head.blockId) {
      return selection.anchor.offset < selection.head.offset ? 'forward' : 'backward';
    }

    // For multi-block selections, would need document order comparison
    // Simplified: assume forward
    return 'forward';
  },

  /**
   * Create a collapsed selection at a position
   */
  createCollapsed(position: Position): Selection {
    return {
      anchor: position,
      head: position,
    };
  },

  /**
   * Create a selection range
   */
  createRange(start: Position, end: Position): Selection {
    return {
      anchor: start,
      head: end,
    };
  },
};

/**
 * Block helper implementation
 */
export const blockHelpers: BlockHelpers = {
  /**
   * Check if a node is a text node
   */
  isTextNode(node: NotectlNode): node is TextNode {
    return 'text' in node && node.type === 'text';
  },

  /**
   * Check if a node is a block node
   */
  isBlockNode(node: NotectlNode): node is BlockNode {
    return 'id' in node && 'type' in node;
  },

  /**
   * Get all text content from a block
   */
  getTextContent(block: BlockNode): string {
    if (!block.children) {
      return '';
    }

    return block.children
      .map((child) => {
        if (this.isTextNode(child)) {
          return child.text;
        } else if (this.isBlockNode(child)) {
          return this.getTextContent(child);
        }
        return '';
      })
      .join('');
  },

  /**
   * Check if block is empty
   */
  isEmpty(block: BlockNode): boolean {
    if (!block.children || block.children.length === 0) {
      return true;
    }

    return this.getTextContent(block).trim() === '';
  },
};
