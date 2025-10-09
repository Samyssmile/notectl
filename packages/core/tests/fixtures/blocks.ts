/**
 * Test fixtures for block structures
 */

import type { Block, TextNode, Mark } from '../../src/schema/types';

export const createMockBlock = (
  type: string = 'paragraph',
  overrides?: Partial<Block>
): Block => ({
  id: crypto.randomUUID(),
  type,
  attrs: {},
  children: [],
  ...overrides,
});

export const createMockTextNode = (
  text: string = 'Sample text',
  marks?: Mark[]
): TextNode => ({
  type: 'text',
  text,
  marks,
});

export const createMockMark = (
  type: string = 'bold',
  attrs?: Record<string, unknown>
): Mark => ({
  type,
  attrs,
});

/**
 * Simple document with one paragraph
 */
export const simpleDocument: Block = {
  id: 'doc-1',
  type: 'doc',
  children: [
    {
      id: 'p-1',
      type: 'paragraph',
      children: [
        {
          type: 'text',
          text: 'Hello world',
        },
      ],
    },
  ],
};

/**
 * Document with multiple paragraphs and formatting
 */
export const complexDocument: Block = {
  id: 'doc-2',
  type: 'doc',
  children: [
    {
      id: 'h1-1',
      type: 'heading',
      attrs: { level: 1 },
      children: [
        {
          type: 'text',
          text: 'Title',
        },
      ],
    },
    {
      id: 'p-2',
      type: 'paragraph',
      children: [
        {
          type: 'text',
          text: 'This is ',
        },
        {
          type: 'text',
          text: 'bold',
          marks: [{ type: 'bold' }],
        },
        {
          type: 'text',
          text: ' and ',
        },
        {
          type: 'text',
          text: 'italic',
          marks: [{ type: 'italic' }],
        },
        {
          type: 'text',
          text: ' text.',
        },
      ],
    },
    {
      id: 'ul-1',
      type: 'bullet_list',
      children: [
        {
          id: 'li-1',
          type: 'list_item',
          children: [
            {
              id: 'p-3',
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  text: 'Item 1',
                },
              ],
            },
          ],
        },
        {
          id: 'li-2',
          type: 'list_item',
          children: [
            {
              id: 'p-4',
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  text: 'Item 2',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/**
 * Empty document
 */
export const emptyDocument: Block = {
  id: 'doc-3',
  type: 'doc',
  children: [
    {
      id: 'p-5',
      type: 'paragraph',
      children: [],
    },
  ],
};
