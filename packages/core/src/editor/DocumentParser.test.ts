import { describe, expect, it } from 'vitest';
import { getBlockText } from '../model/Document.js';
import { parseHTMLToDocument } from './DocumentParser.js';

describe('parseHTMLToDocument', () => {
	it('parses a simple paragraph', () => {
		const doc = parseHTMLToDocument('<p>Hello world</p>');
		expect(doc.children).toHaveLength(1);
		const block = doc.children[0];
		if (!block) return;
		expect(block.type).toBe('paragraph');
		expect(getBlockText(block)).toBe('Hello world');
	});

	it('parses multiple paragraphs', () => {
		const doc = parseHTMLToDocument('<p>First</p><p>Second</p>');
		expect(doc.children).toHaveLength(2);
		const first = doc.children[0];
		const second = doc.children[1];
		if (!first || !second) return;
		expect(getBlockText(first)).toBe('First');
		expect(getBlockText(second)).toBe('Second');
	});

	it('strips unsupported tags without registry', () => {
		// Without a registry, only p/br/div/span are allowed by DOMPurify
		const doc = parseHTMLToDocument('<ul><li>Item 1</li><li>Item 2</li></ul>');
		// List tags are stripped; content falls through as text in paragraphs
		expect(doc.children.length).toBeGreaterThan(0);
	});

	it('returns default document for empty HTML', () => {
		const doc = parseHTMLToDocument('');
		expect(doc.children).toHaveLength(1);
		expect(doc.children[0]?.type).toBe('paragraph');
	});

	it('handles plain text nodes', () => {
		const doc = parseHTMLToDocument('Just text');
		expect(doc.children).toHaveLength(1);
		const block = doc.children[0];
		if (!block) return;
		expect(getBlockText(block)).toBe('Just text');
	});

	// Coverage for parseElementToTextNodes (via public API)

	it('extracts text from a simple element', () => {
		const doc = parseHTMLToDocument('<p>hello</p>');
		expect(doc.children).toHaveLength(1);
		const block = doc.children[0];
		if (!block) return;
		expect(getBlockText(block)).toBe('hello');
	});

	it('produces empty text node for empty element', () => {
		const doc = parseHTMLToDocument('<p></p>');
		expect(doc.children).toHaveLength(1);
		const block = doc.children[0];
		if (!block) return;
		expect(block.children).toHaveLength(1);
		expect(block.children[0]?.text).toBe('');
	});

	// Coverage for matchBlockParseRule (via public API — no registry = no rules)

	it('falls back to paragraph when no block parse rules match', () => {
		// Without a registry, <div> has no matching block parse rule
		const doc = parseHTMLToDocument('<div>content</div>');
		expect(doc.children.length).toBeGreaterThan(0);
		const block = doc.children[0];
		if (!block) return;
		expect(block.type).toBe('paragraph');
		expect(getBlockText(block)).toBe('content');
	});
});
