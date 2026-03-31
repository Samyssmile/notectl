import { describe, expect, it } from 'vitest';
import type { Mark } from '../model/Document.js';
import { createBlockNode, createDocument, createTextNode } from '../model/Document.js';
import { SchemaRegistry } from '../model/SchemaRegistry.js';
import { blockId, markType, nodeType } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import {
	getEditorContentHTML,
	getEditorJSON,
	getEditorText,
	isEditorEmpty,
	normalizeCompositeBlocks,
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

	it('sets selection to the first leaf block for nested documents', () => {
		const doc = createDocument([
			createBlockNode(
				nodeType('table'),
				[
					createBlockNode(
						nodeType('table_row'),
						[
							createBlockNode(
								nodeType('table_cell'),
								[createBlockNode(nodeType('paragraph'), [createTextNode('cell')], blockId('p1'))],
								blockId('cell1'),
							),
						],
						blockId('row1'),
					),
				],
				blockId('tbl1'),
			),
		]);
		let captured: EditorState | null = null;

		setEditorJSON(doc, undefined, (s) => {
			captured = s;
		});

		expect(captured?.selection.anchor.blockId).toBe('p1');
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
	it('returns HTML string for a simple document', () => {
		const doc = singleParagraphDoc('hello');
		const state: EditorState = EditorState.create({ doc });

		const html = getEditorContentHTML(state, undefined);

		expect(typeof html).toBe('string');
		expect(html).toContain('hello');
	});
});

describe('normalizeCompositeBlocks', () => {
	function createTableRegistry(): SchemaRegistry {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'paragraph',
			group: 'block',
			toDOM(node) {
				const el = document.createElement('p');
				el.setAttribute('data-block-id', node.id);
				return el;
			},
		});
		registry.registerNodeSpec({
			type: 'table',
			group: 'block',
			content: { allow: ['table_row'], min: 1 },
			toDOM(node) {
				const el = document.createElement('table');
				el.setAttribute('data-block-id', node.id);
				return el;
			},
		});
		registry.registerNodeSpec({
			type: 'table_row',
			group: 'table_content',
			content: { allow: ['table_cell'], min: 1 },
			toDOM(node) {
				const el = document.createElement('tr');
				el.setAttribute('data-block-id', node.id);
				return el;
			},
		});
		registry.registerNodeSpec({
			type: 'table_cell',
			group: 'table_content',
			content: { allow: ['paragraph'] },
			toDOM(node) {
				const el = document.createElement('td');
				el.setAttribute('data-block-id', node.id);
				return el;
			},
		});
		return registry;
	}

	it('wraps bare inline children of composite blocks in a paragraph', () => {
		const registry = createTableRegistry();
		const boldMark: Mark = { type: markType('bold') };
		const doc = createDocument([
			createBlockNode(
				nodeType('table'),
				[
					createBlockNode(
						nodeType('table_row'),
						[
							createBlockNode(
								nodeType('table_cell'),
								[createTextNode('Feature', [boldMark])],
								blockId('cell1'),
							),
						],
						blockId('row1'),
					),
				],
				blockId('tbl1'),
			),
		]);

		const result = normalizeCompositeBlocks(doc, registry);

		const cell = result.children[0]?.children[0]?.children[0];
		expect(cell).toBeDefined();
		expect(cell?.type).toBe('table_cell');
		// Cell should now have a paragraph child wrapping the text
		expect(cell?.children).toHaveLength(1);
		const para = cell?.children[0];
		expect(para).toBeDefined();
		expect(para?.type).toBe('paragraph');
		const paraChildren = (para as { children: unknown[] }).children;
		expect(paraChildren).toHaveLength(1);
		expect(paraChildren[0]).toMatchObject({
			type: 'text',
			text: 'Feature',
			marks: [{ type: 'bold' }],
		});
	});

	it('wraps multiple inline children into a single paragraph', () => {
		const registry = createTableRegistry();
		const doc = createDocument([
			createBlockNode(
				nodeType('table'),
				[
					createBlockNode(
						nodeType('table_row'),
						[
							createBlockNode(
								nodeType('table_cell'),
								[createTextNode('Hello '), createTextNode('World')],
								blockId('cell1'),
							),
						],
						blockId('row1'),
					),
				],
				blockId('tbl1'),
			),
		]);

		const result = normalizeCompositeBlocks(doc, registry);

		const cell = result.children[0]?.children[0]?.children[0];
		expect(cell?.children).toHaveLength(1);
		const para = cell?.children[0];
		expect(para?.type).toBe('paragraph');
		const paraChildren = (para as { children: unknown[] }).children;
		expect(paraChildren).toHaveLength(2);
		expect(paraChildren[0]).toMatchObject({ type: 'text', text: 'Hello ' });
		expect(paraChildren[1]).toMatchObject({ type: 'text', text: 'World' });
	});

	it('handles empty composite block children with default text node', () => {
		const registry = createTableRegistry();
		const doc = createDocument([
			createBlockNode(
				nodeType('table'),
				[
					createBlockNode(
						nodeType('table_row'),
						[createBlockNode(nodeType('table_cell'), [], blockId('cell1'))],
						blockId('row1'),
					),
				],
				blockId('tbl1'),
			),
		]);

		const result = normalizeCompositeBlocks(doc, registry);

		const cell = result.children[0]?.children[0]?.children[0];
		expect(cell?.children).toHaveLength(1);
		const para = cell?.children[0];
		expect(para?.type).toBe('paragraph');
		const paraChildren = (para as { children: unknown[] }).children;
		expect(paraChildren).toHaveLength(1);
		expect(paraChildren[0]).toMatchObject({ type: 'text', text: '' });
	});

	it('preserves already-normalized composite blocks', () => {
		const registry = createTableRegistry();
		const doc = createDocument([
			createBlockNode(
				nodeType('table'),
				[
					createBlockNode(
						nodeType('table_row'),
						[
							createBlockNode(
								nodeType('table_cell'),
								[
									createBlockNode(
										nodeType('paragraph'),
										[createTextNode('Feature')],
										blockId('p1'),
									),
								],
								blockId('cell1'),
							),
						],
						blockId('row1'),
					),
				],
				blockId('tbl1'),
			),
		]);

		const result = normalizeCompositeBlocks(doc, registry);

		const cell = result.children[0]?.children[0]?.children[0];
		expect(cell?.children).toHaveLength(1);
		const para = cell?.children[0];
		expect(para?.type).toBe('paragraph');
	});

	it('does not modify leaf blocks', () => {
		const registry = createTableRegistry();
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello')], blockId('p1')),
		]);

		const result = normalizeCompositeBlocks(doc, registry);

		expect(result.children[0]?.children).toHaveLength(1);
		expect(result.children[0]?.children[0]).toMatchObject({ type: 'text', text: 'hello' });
	});

	it('does not wrap leaf blocks with text content rules', () => {
		const registry = createTableRegistry();
		registry.registerNodeSpec({
			type: 'heading',
			group: 'block',
			content: { allow: ['text'] },
			toDOM(node) {
				const el = document.createElement('h1');
				el.setAttribute('data-block-id', node.id);
				return el;
			},
		});
		const doc = createDocument([
			createBlockNode(nodeType('heading'), [createTextNode('Title')], blockId('h1'), { level: 1 }),
		]);

		const result = normalizeCompositeBlocks(doc, registry);

		expect(result.children[0]?.type).toBe('heading');
		expect(result.children[0]?.children).toHaveLength(1);
		expect(result.children[0]?.children[0]).toMatchObject({ type: 'text', text: 'Title' });
	});
});
