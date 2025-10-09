/**
 * Schema factory unit tests
 */

import { describe, it, expect } from 'vitest';
import { createBlock, createTextNode, createMark } from '../../../src/schema/factory';

describe('Schema Factory', () => {
  describe('createBlock', () => {
    it('should create block with type', () => {
      const block = createBlock('paragraph');

      expect(block).toHaveProperty('id');
      expect(block.type).toBe('paragraph');
      expect(block.attrs).toBeUndefined();
      expect(block.children).toEqual([]);
    });

    it('should generate unique IDs', () => {
      const block1 = createBlock('paragraph');
      const block2 = createBlock('paragraph');

      expect(block1.id).not.toBe(block2.id);
      expect(block1.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should create block with attributes', () => {
      const block = createBlock('heading', { level: 1 });

      expect(block.attrs).toEqual({ level: 1 });
    });

    it('should create block with children', () => {
      const textNode = createTextNode('Hello');
      const block = createBlock('paragraph', undefined, [textNode]);

      expect(block.children).toHaveLength(1);
      expect(block.children[0]).toBe(textNode);
    });

    it('should create block with attributes and children', () => {
      const textNode = createTextNode('Title');
      const block = createBlock('heading', { level: 1 }, [textNode]);

      expect(block.attrs).toEqual({ level: 1 });
      expect(block.children).toHaveLength(1);
      expect(block.children[0]).toBe(textNode);
    });

    it('should handle empty attributes', () => {
      const block = createBlock('paragraph', {});

      expect(block.attrs).toEqual({});
    });

    it('should handle nested blocks', () => {
      const innerBlock = createBlock('paragraph', undefined, [createTextNode('Inner')]);
      const outerBlock = createBlock('list_item', undefined, [innerBlock]);

      expect(outerBlock.children).toHaveLength(1);
      expect(outerBlock.children[0]).toBe(innerBlock);
    });
  });

  describe('createTextNode', () => {
    it('should create text node with text', () => {
      const node = createTextNode('Hello world');

      expect(node.type).toBe('text');
      expect(node.text).toBe('Hello world');
      expect(node.marks).toBeUndefined();
    });

    it('should create text node with marks', () => {
      const boldMark = createMark('bold');
      const node = createTextNode('Bold text', [boldMark]);

      expect(node.marks).toHaveLength(1);
      expect(node.marks![0]).toBe(boldMark);
    });

    it('should create text node with multiple marks', () => {
      const boldMark = createMark('bold');
      const italicMark = createMark('italic');
      const node = createTextNode('Formatted text', [boldMark, italicMark]);

      expect(node.marks).toHaveLength(2);
      expect(node.marks).toContain(boldMark);
      expect(node.marks).toContain(italicMark);
    });

    it('should handle empty text', () => {
      const node = createTextNode('');

      expect(node.text).toBe('');
    });

    it('should handle special characters', () => {
      const node = createTextNode('Text with\nnewlines & special <chars>');

      expect(node.text).toBe('Text with\nnewlines & special <chars>');
    });

    it('should handle unicode characters', () => {
      const node = createTextNode('Unicode: 你好 🌍 café');

      expect(node.text).toBe('Unicode: 你好 🌍 café');
    });
  });

  describe('createMark', () => {
    it('should create mark with type', () => {
      const mark = createMark('bold');

      expect(mark.type).toBe('bold');
      expect(mark.attrs).toBeUndefined();
    });

    it('should create mark with attributes', () => {
      const mark = createMark('link', { href: 'https://example.com' });

      expect(mark.type).toBe('link');
      expect(mark.attrs).toEqual({ href: 'https://example.com' });
    });

    it('should create mark with multiple attributes', () => {
      const mark = createMark('link', {
        href: 'https://example.com',
        title: 'Example',
        target: '_blank',
      });

      expect(mark.attrs).toEqual({
        href: 'https://example.com',
        title: 'Example',
        target: '_blank',
      });
    });

    it('should handle empty attributes', () => {
      const mark = createMark('bold', {});

      expect(mark.attrs).toEqual({});
    });

    it('should create common mark types', () => {
      const marks = [
        createMark('bold'),
        createMark('italic'),
        createMark('underline'),
        createMark('strikethrough'),
        createMark('code'),
      ];

      marks.forEach((mark, index) => {
        expect(mark).toHaveProperty('type');
      });
    });
  });

  describe('integration', () => {
    it('should create complete document structure', () => {
      const boldMark = createMark('bold');
      const italicMark = createMark('italic');

      const text1 = createTextNode('Regular text ');
      const text2 = createTextNode('bold text', [boldMark]);
      const text3 = createTextNode(' and ', []);
      const text4 = createTextNode('italic text', [italicMark]);

      const paragraph = createBlock('paragraph', undefined, [text1, text2, text3, text4]);

      expect(paragraph.children).toHaveLength(4);
      expect(paragraph.children[0]).toBe(text1);
      expect(paragraph.children[1]).toBe(text2);
      expect(paragraph.children[2]).toBe(text3);
      expect(paragraph.children[3]).toBe(text4);
    });

    it('should create nested list structure', () => {
      const listItem1 = createBlock('list_item', undefined, [
        createBlock('paragraph', undefined, [createTextNode('Item 1')]),
      ]);
      const listItem2 = createBlock('list_item', undefined, [
        createBlock('paragraph', undefined, [createTextNode('Item 2')]),
      ]);

      const list = createBlock('bullet_list', undefined, [listItem1, listItem2]);

      expect(list.children).toHaveLength(2);
      expect(list.children[0].children).toHaveLength(1);
    });

    it('should create table structure', () => {
      const cell1 = createBlock('table_cell', undefined, [
        createBlock('paragraph', undefined, [createTextNode('Cell 1')]),
      ]);
      const cell2 = createBlock('table_cell', undefined, [
        createBlock('paragraph', undefined, [createTextNode('Cell 2')]),
      ]);
      const row = createBlock('table_row', undefined, [cell1, cell2]);
      const table = createBlock('table', undefined, [row]);

      expect(table.type).toBe('table');
      expect(table.children).toHaveLength(1);
      expect(table.children[0].children).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('should handle null/undefined gracefully', () => {
      const block = createBlock('paragraph', undefined, undefined);
      expect(block.children).toEqual([]);
    });

    it('should handle empty children array', () => {
      const block = createBlock('paragraph', undefined, []);
      expect(block.children).toEqual([]);
    });

    it('should handle very long text', () => {
      const longText = 'a'.repeat(10000);
      const node = createTextNode(longText);
      expect(node.text).toHaveLength(10000);
    });

    it('should handle deeply nested structures', () => {
      let block = createBlock('paragraph', undefined, [createTextNode('Deep')]);

      for (let i = 0; i < 10; i++) {
        block = createBlock('list_item', undefined, [block]);
      }

      expect(block.type).toBe('list_item');
    });
  });
});
