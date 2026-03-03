import { describe, expect, it } from 'vitest';
import { createBlockNode, createDocument, createTextNode } from '../model/Document.js';
import { blockId, nodeType } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import {
	getEditorContentHTML,
	getEditorJSON,
	getEditorText,
	isEditorEmpty,
	setEditorJSON,
} from './ContentSerializer.js';

function singleParagraphDoc(text: string): ReturnType<typeof createDocument> {
	return createDocument([
		createBlockNode(nodeType('paragraph'), [createTextNode(text)], blockId('b1')),
	]);
}

function emptyParagraphDoc(): ReturnType<typeof createDocument> {
	return createDocument([
		createBlockNode(nodeType('paragraph'), [createTextNode('')], blockId('b1')),
	]);
}

describe('getEditorJSON', () => {
	it('returns the document from state', () => {
		const doc = singleParagraphDoc('hello');
		const state: EditorState = EditorState.create({ doc });

		const result = getEditorJSON(state);

		expect(result).toBe(doc);
	});
});

describe('setEditorJSON', () => {
	it('calls replaceState with a new EditorState', () => {
		const doc = singleParagraphDoc('new content');
		let captured: EditorState | null = null;
		const replaceState = (s: EditorState): void => {
			captured = s;
		};

		setEditorJSON(doc, undefined, replaceState);

		expect(captured).not.toBeNull();
		expect(captured?.doc).toBe(doc);
	});

	it('sets selection to first block offset 0', () => {
		const doc = singleParagraphDoc('abc');
		let captured: EditorState | null = null;

		setEditorJSON(doc, undefined, (s) => {
			captured = s;
		});

		expect(captured?.selection.anchor.blockId).toBe('b1');
		expect(captured?.selection.anchor.offset).toBe(0);
	});
});

describe('getEditorText', () => {
	it('returns text joined by newlines', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello')], blockId('b1')),
			createBlockNode(nodeType('paragraph'), [createTextNode('world')], blockId('b2')),
		]);
		const state: EditorState = EditorState.create({ doc });

		expect(getEditorText(state)).toBe('hello\nworld');
	});

	it('returns empty string for empty paragraph', () => {
		const doc = emptyParagraphDoc();
		const state: EditorState = EditorState.create({ doc });

		expect(getEditorText(state)).toBe('');
	});
});

describe('isEditorEmpty', () => {
	it('returns true for undefined doc', () => {
		expect(isEditorEmpty(undefined)).toBe(true);
	});

	it('returns true for document with no children', () => {
		const doc = createDocument([]);
		expect(isEditorEmpty(doc)).toBe(true);
	});

	it('returns true for single empty paragraph', () => {
		expect(isEditorEmpty(emptyParagraphDoc())).toBe(true);
	});

	it('returns false for single paragraph with text', () => {
		expect(isEditorEmpty(singleParagraphDoc('hello'))).toBe(false);
	});

	it('returns false for multiple blocks', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('')], blockId('b1')),
			createBlockNode(nodeType('paragraph'), [createTextNode('')], blockId('b2')),
		]);
		expect(isEditorEmpty(doc)).toBe(false);
	});
});

describe('getEditorContentHTML', () => {
	it('returns HTML string for a simple document', async () => {
		const doc = singleParagraphDoc('hello');
		const state: EditorState = EditorState.create({ doc });

		const html = await getEditorContentHTML(state, undefined);

		expect(typeof html).toBe('string');
		expect(html).toContain('hello');
	});
});
