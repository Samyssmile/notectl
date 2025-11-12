import { describe, expect, it } from 'vitest';
import { NotectlEditor } from '../../../src/editor/NotectlEditor.js';
import type { Document, BlockNode } from '../../../src/types/index.js';

const accessEditor = (editor: NotectlEditor) =>
  editor as unknown as {
    htmlToDocument(input: string): Document;
    documentToHTML(doc: Document): string;
  };

describe('NotectlEditor HTML parsing', () => {
  it('creates structured nodes for headings followed by ordered lists', () => {
    const editor = new NotectlEditor();
    const doc = accessEditor(editor).htmlToDocument('<h1>Hello World</h1><ol><li>Alpha</li><li>Gamma</li></ol>');

    expect(doc.children).toHaveLength(2);

    const heading = doc.children[0];
    expect(heading.type).toBe('heading');
    expect(heading.attrs?.level).toBe(1);
    expect(heading.children?.[0]).toMatchObject({ type: 'text', text: 'Hello World' });

    const list = doc.children[1];
    expect(list.type).toBe('list');
    expect(list.attrs?.listType).toBe('ordered');
    expect(list.children).toHaveLength(2);

    (list.children as BlockNode[]).forEach((item, index) => {
      expect(item.type).toBe('list_item');
      expect(item.children?.[0]?.type).toBe('paragraph');
      const paragraph = item.children?.[0];
      expect(paragraph?.children?.[0]).toMatchObject({
        type: 'text',
        text: index === 0 ? 'Alpha' : 'Gamma',
      });
    });
  });

  it('roundtrips unordered lists back to semantic HTML', () => {
    const editor = new NotectlEditor();
    const doc = accessEditor(editor).htmlToDocument('<ul><li>First</li><li>Second</li></ul>');
    const html = accessEditor(editor).documentToHTML(doc);

    expect(html).toBe('<ul><li><p>First</p></li><li><p>Second</p></li></ul>');
  });

  it('extracts lists nested inside execCommand wrappers', () => {
    const editor = new NotectlEditor();
    const doc = accessEditor(editor).htmlToDocument(
      '<h1>Heading</h1><div><ol><li>Alpha</li><li>Gamma</li></ol></div>'
    );

    expect(doc.children).toHaveLength(2);
    expect(doc.children[0].type).toBe('heading');

    const list = doc.children[1];
    expect(list.type).toBe('list');
    expect(list.attrs?.listType).toBe('ordered');
    expect(list.children).toHaveLength(2);
  });
});
