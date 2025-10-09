/**
 * Factory for creating document nodes
 */

import type { BlockNode, TextNode, BlockId, NodeType, Mark, BlockAttrs } from '../types/index.js';
import { Schema } from './Schema.js';

/**
 * Generate a unique block ID
 */
export function generateBlockId(): BlockId {
  // Simple UUID v4 implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Node factory for creating valid nodes
 */
export class NodeFactory {
  constructor(private schema: Schema) {}

  /**
   * Create a text node
   */
  text(text: string, marks?: Mark[]): TextNode {
    return {
      type: 'text',
      text,
      marks: marks || [],
    };
  }

  /**
   * Create a paragraph node
   */
  paragraph(content?: TextNode[], attrs?: BlockAttrs): BlockNode {
    return {
      id: generateBlockId(),
      type: 'paragraph',
      attrs,
      children: content || [],
    };
  }

  /**
   * Create a heading node
   */
  heading(level: number, content?: TextNode[], attrs?: BlockAttrs): BlockNode {
    return {
      id: generateBlockId(),
      type: 'heading',
      attrs: { ...attrs, level },
      children: content || [],
    };
  }

  /**
   * Create a list node
   */
  list(items: BlockNode[], attrs?: BlockAttrs): BlockNode {
    return {
      id: generateBlockId(),
      type: 'list',
      attrs,
      children: items,
    };
  }

  /**
   * Create a list item node
   */
  listItem(content: BlockNode[], attrs?: BlockAttrs): BlockNode {
    return {
      id: generateBlockId(),
      type: 'list_item',
      attrs,
      children: content,
    };
  }

  /**
   * Create a table node
   */
  table(rows: BlockNode[], attrs?: BlockAttrs): BlockNode {
    return {
      id: generateBlockId(),
      type: 'table',
      attrs,
      children: rows,
    };
  }

  /**
   * Create a table row node
   */
  tableRow(cells: BlockNode[], attrs?: BlockAttrs): BlockNode {
    return {
      id: generateBlockId(),
      type: 'table_row',
      attrs,
      children: cells,
    };
  }

  /**
   * Create a table cell node
   */
  tableCell(content: BlockNode[], attrs?: BlockAttrs): BlockNode {
    return {
      id: generateBlockId(),
      type: 'table_cell',
      attrs,
      children: content,
    };
  }

  /**
   * Create an image node
   */
  image(src: string, alt?: string, attrs?: BlockAttrs): BlockNode {
    return {
      id: generateBlockId(),
      type: 'image',
      attrs: { src, alt: alt || '', decorative: !alt, ...attrs },
      children: [],
    };
  }

  /**
   * Create a code block node
   */
  codeBlock(content: string, attrs?: BlockAttrs): BlockNode {
    return {
      id: generateBlockId(),
      type: 'code_block',
      attrs,
      children: [this.text(content)],
    };
  }

  /**
   * Create a generic block node
   */
  block(type: NodeType, attrs?: BlockAttrs, children?: (TextNode | BlockNode)[]): BlockNode {
    const spec = this.schema.node(type);
    if (!spec) {
      throw new Error(`Unknown node type: ${type}`);
    }

    return {
      id: generateBlockId(),
      type,
      attrs,
      children,
    };
  }

  /**
   * Create a mark
   */
  mark(type: string, attrs?: Record<string, unknown>): Mark {
    const spec = this.schema.mark(type);
    if (!spec) {
      throw new Error(`Unknown mark type: ${type}`);
    }

    return {
      type,
      attrs,
    };
  }

  /**
   * Clone a node with new children
   */
  cloneNode(node: BlockNode, children?: (TextNode | BlockNode)[]): BlockNode {
    return {
      ...node,
      id: generateBlockId(), // Generate new ID for cloned node
      children: children !== undefined ? children : node.children,
    };
  }
}

/**
 * Create a node factory with the given schema
 */
export function createNodeFactory(schema: Schema): NodeFactory {
  return new NodeFactory(schema);
}
