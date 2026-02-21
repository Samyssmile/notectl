import { describe, expect, it } from 'vitest';
import { createBlockNode, createDocument, createTextNode } from '../model/Document.js';
import { nodeType } from '../model/TypeBrands.js';
import { serializeDocumentToHTML } from './DocumentSerializer.js';

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
});
