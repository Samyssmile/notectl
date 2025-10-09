/**
 * Document schema definition for Notectl
 * Defines the structure and validation rules for the document model
 */

import type { NodeType, BlockNode, TextNode, Node, Mark } from '../types/index.js';

/**
 * Node specification in the schema
 */
export interface NodeSpec {
  type: NodeType;
  group?: 'block' | 'inline' | 'table';
  content?: string; // Content expression (e.g., "block+", "inline*", "text*")
  marks?: string; // Allowed marks (e.g., "_", "strong em")
  attrs?: Record<string, AttributeSpec>;
  defining?: boolean; // Node defines its content boundaries
  isolating?: boolean; // Node isolates content from surroundings
  toDOM?: (node: Node) => HTMLElement | [string, Record<string, string>, ...unknown[]];
  parseDOM?: Array<{
    tag?: string;
    attrs?: Record<string, unknown>;
  }>;
}

/**
 * Attribute specification
 */
export interface AttributeSpec {
  default?: unknown;
  validate?: (value: unknown) => boolean;
  required?: boolean;
}

/**
 * Mark specification in the schema
 */
export interface MarkSpec {
  type: string;
  attrs?: Record<string, AttributeSpec>;
  inclusive?: boolean;
  excludes?: string; // Marks that cannot coexist
  group?: string;
  spanning?: boolean;
  toDOM?: (mark: Mark) => [string, Record<string, string>];
  parseDOM?: Array<{
    tag?: string;
    style?: string;
    attrs?: Record<string, unknown>;
  }>;
}

/**
 * Document schema
 */
export class Schema {
  nodes: Map<NodeType, NodeSpec>;
  marks: Map<string, MarkSpec>;
  topNode: NodeType;

  constructor(config: { nodes: NodeSpec[]; marks: MarkSpec[]; topNode?: NodeType }) {
    this.nodes = new Map(config.nodes.map((spec) => [spec.type, spec]));
    this.marks = new Map(config.marks.map((spec) => [spec.type, spec]));
    this.topNode = config.topNode || 'paragraph';
  }

  /**
   * Get node specification
   */
  node(type: NodeType): NodeSpec | undefined {
    return this.nodes.get(type);
  }

  /**
   * Get mark specification
   */
  mark(type: string): MarkSpec | undefined {
    return this.marks.get(type);
  }

  /**
   * Validate if a node conforms to the schema
   */
  validateNode(node: Node): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if ('text' in node) {
      // Text node validation
      const textNode = node as TextNode;
      if (typeof textNode.text !== 'string') {
        errors.push('Text node must have a string text property');
      }
      if (textNode.marks) {
        for (const mark of textNode.marks) {
          if (!this.marks.has(mark.type)) {
            errors.push(`Unknown mark type: ${mark.type}`);
          }
        }
      }
    } else {
      // Block node validation
      const blockNode = node as BlockNode;
      const spec = this.nodes.get(blockNode.type);
      
      if (!spec) {
        errors.push(`Unknown node type: ${blockNode.type}`);
        return { valid: false, errors };
      }

      // Validate required attributes
      if (spec.attrs) {
        for (const [attrName, attrSpec] of Object.entries(spec.attrs)) {
          if (attrSpec.required && (!blockNode.attrs || !(attrName in blockNode.attrs))) {
            errors.push(`Required attribute missing: ${attrName}`);
          }
          if (blockNode.attrs?.[attrName] && attrSpec.validate) {
            if (!attrSpec.validate(blockNode.attrs[attrName])) {
              errors.push(`Invalid attribute value: ${attrName}`);
            }
          }
        }
      }

      // Validate children if present
      if (blockNode.children) {
        for (const child of blockNode.children) {
          const childValidation = this.validateNode(child);
          errors.push(...childValidation.errors);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if a mark is allowed on a node
   */
  markAllowedOn(markType: string, nodeType: NodeType): boolean {
    const nodeSpec = this.nodes.get(nodeType);
    if (!nodeSpec || !nodeSpec.marks) {
      return false;
    }
    
    if (nodeSpec.marks === '_') {
      return true; // All marks allowed
    }
    
    return nodeSpec.marks.split(' ').includes(markType);
  }

  /**
   * Check if two marks can coexist
   */
  marksCompatible(markA: string, markB: string): boolean {
    const specA = this.marks.get(markA);
    const specB = this.marks.get(markB);
    
    if (specA?.excludes && specA.excludes.split(' ').includes(markB)) {
      return false;
    }
    if (specB?.excludes && specB.excludes.split(' ').includes(markA)) {
      return false;
    }
    
    return true;
  }
}

/**
 * Create default Notectl schema
 */
export function createDefaultSchema(): Schema {
  return new Schema({
    nodes: [
      {
        type: 'paragraph',
        group: 'block',
        content: 'inline*',
        marks: '_',
      },
      {
        type: 'heading',
        group: 'block',
        content: 'inline*',
        marks: '_',
        attrs: {
          level: {
            default: 1,
            validate: (val) => typeof val === 'number' && val >= 1 && val <= 6,
          },
        },
      },
      {
        type: 'list',
        group: 'block',
        content: 'list_item+',
      },
      {
        type: 'list_item',
        content: 'paragraph block*',
        defining: true,
      },
      {
        type: 'table',
        group: 'block',
        content: 'table_row+',
        isolating: true,
      },
      {
        type: 'table_row',
        content: 'table_cell+',
      },
      {
        type: 'table_cell',
        content: 'block+',
        isolating: true,
      },
      {
        type: 'image',
        group: 'inline',
        attrs: {
          src: { required: true },
          alt: { default: '' },
          decorative: { default: false },
        },
      },
      {
        type: 'code_block',
        group: 'block',
        content: 'text*',
        marks: '',
      },
      {
        type: 'text',
        group: 'inline',
      },
    ],
    marks: [
      { type: 'bold', excludes: '' },
      { type: 'italic', excludes: '' },
      { type: 'underline', excludes: '' },
      { type: 'strikethrough', excludes: '' },
      { type: 'code', excludes: 'link' },
      {
        type: 'link',
        attrs: {
          href: { required: true },
          title: { default: '' },
        },
        excludes: 'code',
      },
    ],
    topNode: 'paragraph',
  });
}
