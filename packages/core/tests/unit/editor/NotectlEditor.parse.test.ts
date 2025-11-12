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

  it('parses tables into structured blocks while preserving simple cell content', () => {
    const editor = new NotectlEditor();
    const html = `
      <h1>My Table</h1>
      <table data-block-id="table-1">
        <tbody>
          <tr data-block-id="row-1">
            <td data-block-id="cell-1">Cell One</td>
            <td data-block-id="cell-2">Cell Two</td>
          </tr>
        </tbody>
      </table>
    `;

    const doc = accessEditor(editor).htmlToDocument(html);
    expect(doc.children).toHaveLength(2);

    const table = doc.children[1];
    expect(table.type).toBe('table');
    expect(table.attrs?.table).toBeDefined();

    const rows = (table.attrs?.table as { rows: any[] }).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].cells).toHaveLength(2);
    const leftCell = rows[0].cells[0];
    const rightCell = rows[0].cells[1];

    expect(Array.isArray(leftCell.content)).toBe(true);
    expect(Array.isArray(rightCell.content)).toBe(true);

    const leftParagraph = leftCell.content?.[0];
    const rightParagraph = rightCell.content?.[0];

    expect(leftParagraph?.type).toBe('paragraph');
    expect(leftParagraph?.children?.[0]).toMatchObject({ type: 'text', text: 'Cell One' });

    expect(rightParagraph?.type).toBe('paragraph');
    expect(rightParagraph?.children?.[0]).toMatchObject({ type: 'text', text: 'Cell Two' });
  });

  it('preserves nested lists and cell styles when parsing tables', () => {
    const editor = new NotectlEditor();
    const html = `
      <table data-block-id="table-rich">
        <tbody>
          <tr data-block-id="row-a">
            <td data-block-id="cell-left">
              <ol>
                <li>Alpha</li>
                <li>Beta</li>
              </ol>
            </td>
            <td data-block-id="cell-right" style="text-align: right;">Align Right Text</td>
          </tr>
        </tbody>
      </table>
    `;

    const doc = accessEditor(editor).htmlToDocument(html);
    expect(doc.children).toHaveLength(1);

    const table = doc.children[0];
    const rows = (table.attrs?.table as { rows: any[] }).rows;
    const [leftCell, rightCell] = rows[0].cells;

    expect(leftCell.content?.[0]?.type).toBe('list');
    const listNode = leftCell.content?.[0];
    expect(listNode?.children).toHaveLength(2);
    expect(listNode?.children?.[0].children?.[0]).toMatchObject({ type: 'text', text: 'Alpha' });

    expect(rightCell.attrs?.style?.textAlign).toBe('right');
    expect(rightCell.content?.[0]?.type).toBe('paragraph');
    expect(rightCell.content?.[0]?.children?.[0]).toMatchObject({ type: 'text', text: 'Align Right Text' });
  });
});
