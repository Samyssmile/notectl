import { describe, expect, it } from 'vitest';
import { createBlockNode, createDocument, createTextNode } from '../model/Document.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { blockId, nodeType } from '../model/TypeBrands.js';
import { serializeDocumentToHTML } from './DocumentSerializer.js';

/**
 * Creates a minimal SchemaRegistry stub that provides toHTML + sanitize
 * for table, table_row, and table_cell node specs.
 */
function createTableRegistry(): SchemaRegistry {
	const nodeSpecs = new Map<string, { toHTML?: (node: unknown, content: string) => string }>([
		['paragraph', { toHTML: (_n, c) => `<p>${c || '<br>'}</p>` }],
		['table', { toHTML: (_n, c) => `<table>${c}</table>` }],
		['table_row', { toHTML: (_n, c) => `<tr>${c}</tr>` }],
		['table_cell', { toHTML: (_n, c) => `<td>${c}</td>` }],
	]);

	return {
		getNodeSpec: (type: string) => nodeSpecs.get(type) ?? undefined,
		getInlineNodeSpec: () => undefined,
		getMarkSpec: () => undefined,
		getMarkTypes: () => [],
		getAllowedTags: () => ['p', 'br', 'table', 'tbody', 'tr', 'td'],
		getAllowedAttrs: () => ['style', 'colspan', 'rowspan'],
	} as unknown as SchemaRegistry;
}

describe('serializeDocumentToHTML', () => {
	it('serializes simple paragraphs', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello')]),
			createBlockNode(nodeType('paragraph'), [createTextNode('world')]),
		]);

		const html: string = serializeDocumentToHTML(doc);
		expect(html).toContain('<p>hello</p>');
		expect(html).toContain('<p>world</p>');
	});

	it('returns empty paragraph for default document', () => {
		const doc = createDocument();
		const html: string = serializeDocumentToHTML(doc);
		expect(html).toBe('<p><br></p>');
	});

	// Coverage for serializeBlock (via public API)

	it('wraps in <p> by default', () => {
		const doc = createDocument([createBlockNode(nodeType('paragraph'), [createTextNode('hello')])]);
		expect(serializeDocumentToHTML(doc)).toBe('<p>hello</p>');
	});

	it('uses <br> for empty content', () => {
		const doc = createDocument([createBlockNode(nodeType('paragraph'), [createTextNode('')])]);
		expect(serializeDocumentToHTML(doc)).toBe('<p><br></p>');
	});

	// Coverage for serializeInlineContent (via public API)

	it('joins text nodes', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello '), createTextNode('world')]),
		]);
		expect(serializeDocumentToHTML(doc)).toBe('<p>hello world</p>');
	});

	// Coverage for serializeTextNode (via public API)

	it('returns empty string for empty text', () => {
		const doc = createDocument([createBlockNode(nodeType('paragraph'), [createTextNode('')])]);
		expect(serializeDocumentToHTML(doc)).toBe('<p><br></p>');
	});

	it('escapes HTML entities', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('<b>bold</b>')]),
		]);
		const html: string = serializeDocumentToHTML(doc);
		expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
	});

	it('returns plain text when no marks', () => {
		const doc = createDocument([createBlockNode(nodeType('paragraph'), [createTextNode('hello')])]);
		expect(serializeDocumentToHTML(doc)).toBe('<p>hello</p>');
	});

	// Coverage for alignment validation in serializeBlock

	it('injects text-align style for center alignment', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello')], undefined, {
				align: 'center',
			}),
		]);
		const html: string = serializeDocumentToHTML(doc);
		expect(html).toBe('<p style="text-align: center">hello</p>');
	});

	it('injects text-align style for right alignment', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello')], undefined, {
				align: 'right',
			}),
		]);
		const html: string = serializeDocumentToHTML(doc);
		expect(html).toBe('<p style="text-align: right">hello</p>');
	});

	it('injects text-align style for justify alignment', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello')], undefined, {
				align: 'justify',
			}),
		]);
		const html: string = serializeDocumentToHTML(doc);
		expect(html).toBe('<p style="text-align: justify">hello</p>');
	});

	it('does not inject style for left alignment (default)', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello')], undefined, {
				align: 'left',
			}),
		]);
		const html: string = serializeDocumentToHTML(doc);
		expect(html).toBe('<p>hello</p>');
	});

	it('ignores invalid alignment values', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello')], undefined, {
				align: '"><script>alert(1)</script>',
			}),
		]);
		const html: string = serializeDocumentToHTML(doc);
		expect(html).not.toContain('script');
		expect(html).not.toContain('text-align');
		expect(html).toBe('<p>hello</p>');
	});

	it('ignores unknown alignment values', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello')], undefined, {
				align: 'start',
			}),
		]);
		const html: string = serializeDocumentToHTML(doc);
		expect(html).not.toContain('text-align');
		expect(html).toBe('<p>hello</p>');
	});

	// Coverage for compound block serialization (nested BlockNode children)

	it('serializes a table with nested rows, cells, and paragraph content', () => {
		const registry: SchemaRegistry = createTableRegistry();
		const cell = (text: string): ReturnType<typeof createBlockNode> =>
			createBlockNode(
				nodeType('table_cell'),
				[createBlockNode(nodeType('paragraph'), [createTextNode(text)], blockId('p1'))],
				blockId('c1'),
			);

		const doc = createDocument([
			createBlockNode(
				nodeType('table'),
				[createBlockNode(nodeType('table_row'), [cell('AB'), cell('CD')], blockId('r1'))],
				blockId('t1'),
			),
		]);

		const html: string = serializeDocumentToHTML(doc, registry);
		// DOMPurify auto-inserts <tbody> per the HTML spec
		expect(html).toBe(
			'<table><tbody><tr><td><p>AB</p></td><td><p>CD</p></td></tr></tbody></table>',
		);
	});

	it('serializes a table alongside regular paragraphs', () => {
		const registry: SchemaRegistry = createTableRegistry();
		const cell = (text: string): ReturnType<typeof createBlockNode> =>
			createBlockNode(nodeType('table_cell'), [
				createBlockNode(nodeType('paragraph'), [createTextNode(text)]),
			]);

		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('Before')]),
			createBlockNode(nodeType('table'), [createBlockNode(nodeType('table_row'), [cell('X')])]),
			createBlockNode(nodeType('paragraph'), [createTextNode('After')]),
		]);

		const html: string = serializeDocumentToHTML(doc, registry);
		expect(html).toBe(
			'<p>Before</p><table><tbody><tr><td><p>X</p></td></tr></tbody></table><p>After</p>',
		);
	});

	it('serializes empty table cells with <br>', () => {
		const registry: SchemaRegistry = createTableRegistry();
		const emptyCell: ReturnType<typeof createBlockNode> = createBlockNode(nodeType('table_cell'), [
			createBlockNode(nodeType('paragraph'), [createTextNode('')]),
		]);

		const doc = createDocument([
			createBlockNode(nodeType('table'), [createBlockNode(nodeType('table_row'), [emptyCell])]),
		]);

		const html: string = serializeDocumentToHTML(doc, registry);
		expect(html).toBe('<table><tbody><tr><td><p><br></p></td></tr></tbody></table>');
	});
});
