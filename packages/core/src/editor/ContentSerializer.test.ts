import { describe, expect, it } from 'vitest';
import type { BlockNode, Document, Mark } from '../model/Document.js';
import {
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
	getBlockChildren,
	getBlockText,
	isLeafBlock,
} from '../model/Document.js';
import { SchemaRegistry } from '../model/SchemaRegistry.js';
import { blockId, inlineType, markType, nodeType } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import {
	getEditorContentHTML,
	getEditorContentMarkdown,
	getEditorJSON,
	getEditorText,
	isEditorEmpty,
	normalizeCompositeBlocks,
	setEditorContentMarkdown,
	setEditorJSON,
	setEditorText,
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

describe('getEditorContentMarkdown', () => {
	it('lazily serializes the document to Markdown', async () => {
		const doc = createDocument([
			createBlockNode(nodeType('heading'), [createTextNode('Hi')], blockId('h1'), { level: 1 }),
			createBlockNode(nodeType('paragraph'), [createTextNode('body')], blockId('b1')),
		]);
		const state: EditorState = EditorState.create({ doc });

		const markdown: string = await getEditorContentMarkdown(state, undefined);

		expect(markdown).toBe('# Hi\n\nbody\n');
	});
});

describe('setEditorContentMarkdown', () => {
	it('reuses top-level block IDs by position (round-trip identity, D10)', async () => {
		const doc = createDocument([
			createBlockNode(nodeType('heading'), [createTextNode('Hi')], blockId('h1'), { level: 1 }),
			createBlockNode(nodeType('paragraph'), [createTextNode('body')], blockId('b1')),
		]);
		const state: EditorState = EditorState.create({ doc });
		const markdown: string = await getEditorContentMarkdown(state, undefined);

		let next: EditorState | undefined;
		await setEditorContentMarkdown(markdown, state, undefined, (s) => {
			next = s;
		});

		expect(next).toBeDefined();
		const result = next as EditorState;
		expect(result.doc.children.map((b) => b.id)).toEqual(['h1', 'b1']);
		expect(getBlockText(result.doc.children[0] as never)).toBe('Hi');
		expect(getBlockText(result.doc.children[1] as never)).toBe('body');
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

	it('normalizes semantic HTML IDs recursively at the JSON boundary', () => {
		const validChild = {
			...createBlockNode(nodeType('paragraph'), [createTextNode('valid')], blockId('p1')),
			htmlId: '123:überblick',
		};
		const invalidChild = {
			...createBlockNode(nodeType('paragraph'), [createTextNode('invalid')], blockId('p2')),
			htmlId: 'two words',
		};
		const parent = createBlockNode(
			nodeType('blockquote'),
			[validChild, invalidChild],
			blockId('q1'),
		);
		const doc: Document = { children: [parent] };
		let captured: EditorState | null = null;

		setEditorJSON(doc, undefined, (state) => {
			captured = state;
		});

		const children = getBlockChildren((captured as EditorState).doc.children[0] as BlockNode);
		expect(children[0]?.htmlId).toBe('123:überblick');
		expect(children[1]?.htmlId).toBeUndefined();
	});

	it('drops non-string HTML IDs supplied by untyped JSON', () => {
		const block = {
			...createBlockNode(nodeType('paragraph'), [createTextNode('body')], blockId('p1')),
			htmlId: 42,
		} as unknown as BlockNode;
		let captured: EditorState | null = null;

		setEditorJSON({ children: [block] }, undefined, (state) => {
			captured = state;
		});

		expect((captured as EditorState).doc.children[0]?.htmlId).toBeUndefined();
	});

	it('defaults a missing marks array on inline and text nodes from external JSON (#197)', () => {
		// Simulates JSON persisted before inline nodes gained marks: no `marks` field.
		const inlineWithoutMarks = {
			type: 'inline',
			inlineType: inlineType('math_inline'),
			attrs: { mathml: '<math></math>', latex: 'x', alt: '' },
		};
		const textWithoutMarks = { type: 'text', text: 'before ' };
		const doc = {
			children: [
				{
					id: blockId('b1'),
					type: nodeType('paragraph'),
					children: [textWithoutMarks, inlineWithoutMarks],
				},
			],
		} as never;
		let captured: EditorState | null = null;

		setEditorJSON(doc, undefined, (s) => {
			captured = s;
		});

		const children = (captured as EditorState | null)?.doc.children[0]?.children ?? [];
		expect(children).toHaveLength(2);
		for (const child of children) {
			expect((child as { marks?: readonly Mark[] }).marks).toEqual([]);
		}
	});

	it('defaults missing marks inside nested container blocks', () => {
		const doc = {
			children: [
				{
					id: blockId('q1'),
					type: nodeType('blockquote'),
					children: [
						{
							id: blockId('p1'),
							type: nodeType('paragraph'),
							children: [{ type: 'text', text: 'quoted' }],
						},
					],
				},
			],
		} as never;
		let captured: EditorState | null = null;

		setEditorJSON(doc, undefined, (s) => {
			captured = s;
		});

		const paragraph = (captured as EditorState | null)?.doc.children[0]?.children[0];
		const text = (paragraph as { children?: readonly unknown[] })?.children?.[0];
		expect((text as { marks?: readonly Mark[] })?.marks).toEqual([]);
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

	it('runs plugin-owned attribute normalization at the external JSON boundary', () => {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'sized',
			toDOM: () => document.createElement('div'),
			normalizeAttrs(node) {
				const raw: unknown = node.attrs?.sizes;
				if (!Array.isArray(raw)) return undefined;
				const sizes = raw.map((value) =>
					typeof value === 'number' && Number.isFinite(value) ? Math.max(10, value) : null,
				);
				return { sizes };
			},
		});
		const block = createBlockNode(nodeType('sized'), [createTextNode('body')], blockId('s1'), {
			sizes: [1, null, 30],
		});
		let captured: EditorState | null = null;

		setEditorJSON({ children: [block] }, registry, (state) => {
			captured = state;
		});

		expect((captured as EditorState).doc.children[0]?.attrs).toEqual({
			sizes: [10, null, 30],
		});
	});

	it('runs plugin-owned subtree normalization after descendants and attrs', () => {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'container',
			toDOM: () => document.createElement('div'),
			content: { allow: ['paragraph'], min: 0 },
			normalizeNode(node) {
				return { ...node, children: node.children.slice(0, 1) };
			},
		});
		const block = createBlockNode(
			nodeType('container'),
			[
				createBlockNode(nodeType('paragraph'), [createTextNode('one')], blockId('p1')),
				createBlockNode(nodeType('paragraph'), [createTextNode('two')], blockId('p2')),
			],
			blockId('c1'),
		);
		let captured: EditorState | null = null;

		setEditorJSON({ children: [block] }, registry, (state) => {
			captured = state;
		});

		expect((captured as EditorState).doc.children[0]?.children).toHaveLength(1);
		expect((captured as EditorState).doc.children[0]?.children[0]?.id).toBe('p1');
	});

	it('preserves an intentionally empty composite whose content minimum is zero', () => {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'empty_container',
			toDOM: () => document.createElement('div'),
			content: { allow: ['paragraph'], min: 0 },
		});
		const block = createBlockNode(nodeType('empty_container'), [], blockId('empty-container'));
		let captured: EditorState | null = null;

		setEditorJSON({ children: [block] }, registry, (state) => {
			captured = state;
		});

		expect((captured as EditorState).doc.children[0]?.children).toEqual([]);
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

describe('setEditorText', () => {
	it('replaces document content with one paragraph per line', () => {
		const initial = EditorState.create({ doc: singleParagraphDoc('old') });
		let captured: EditorState | null = null;

		setEditorText('first\nsecond', initial, undefined, (s) => {
			captured = s;
		});

		expect(captured?.doc.children).toHaveLength(2);
		expect(captured?.doc.children[0]?.children[0]).toMatchObject({
			type: 'text',
			text: 'first',
		});
		expect(captured?.doc.children[1]?.children[0]).toMatchObject({
			type: 'text',
			text: 'second',
		});
	});

	it('reuses existing top-level block IDs in document order', () => {
		const initial = EditorState.create({
			doc: createDocument([
				createBlockNode(nodeType('paragraph'), [createTextNode('a')], blockId('keep-1')),
				createBlockNode(nodeType('paragraph'), [createTextNode('b')], blockId('keep-2')),
			]),
		});
		let captured: EditorState | null = null;

		setEditorText('x\ny', initial, undefined, (s) => {
			captured = s;
		});

		expect(captured?.doc.children.map((b) => b.id)).toEqual(['keep-1', 'keep-2']);
	});

	it('generates fresh IDs only for additional lines beyond the existing block count', () => {
		const initial = EditorState.create({
			doc: createDocument([
				createBlockNode(nodeType('paragraph'), [createTextNode('a')], blockId('keep-1')),
			]),
		});
		let captured: EditorState | null = null;

		setEditorText('x\ny\nz', initial, undefined, (s) => {
			captured = s;
		});

		const ids: string[] = (captured?.doc.children ?? []).map((b) => b.id as string);
		expect(ids[0]).toBe('keep-1');
		expect(ids[1]).not.toBe('keep-1');
		expect(ids[2]).not.toBe('keep-1');
		expect(ids[1]).toMatch(/^block-/);
		expect(ids[2]).toMatch(/^block-/);
	});

	it('is a no-op when the new text matches the current text', () => {
		const initial = EditorState.create({
			doc: createDocument([
				createBlockNode(nodeType('paragraph'), [createTextNode('a')], blockId('p1')),
				createBlockNode(nodeType('paragraph'), [createTextNode('b')], blockId('p2')),
			]),
		});
		let calls = 0;

		setEditorText('a\nb', initial, undefined, () => {
			calls++;
		});

		expect(calls).toBe(0);
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

	it('returns false for a paragraph holding only an inline node (e.g. inline formula)', () => {
		const doc = createDocument([
			createBlockNode(
				nodeType('paragraph'),
				[createInlineNode(inlineType('math_inline'), { mathml: '<math></math>' })],
				blockId('b1'),
			),
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

	describe('includeBlockIds option', () => {
		it('emits data-block-id by default (inline mode)', () => {
			const state: EditorState = EditorState.create({ doc: singleParagraphDoc('hello') });

			const html = getEditorContentHTML(state, undefined);

			expect(html).toContain('data-block-id="b1"');
		});

		it('omits data-block-id when includeBlockIds is false (inline mode)', () => {
			const state: EditorState = EditorState.create({ doc: singleParagraphDoc('hello') });

			const html = getEditorContentHTML(state, undefined, { includeBlockIds: false });

			expect(html).not.toContain('data-block-id');
			expect(html).toContain('hello');
		});

		it('threads includeBlockIds through pretty formatting (inline mode)', () => {
			const state: EditorState = EditorState.create({ doc: singleParagraphDoc('hello') });

			const html = getEditorContentHTML(state, undefined, {
				includeBlockIds: false,
				pretty: true,
			});

			expect(html).not.toContain('data-block-id');
		});

		it('emits data-block-id by default (class mode)', () => {
			const state: EditorState = EditorState.create({ doc: singleParagraphDoc('hello') });

			const result = getEditorContentHTML(state, undefined, { cssMode: 'classes' });

			expect(typeof result).not.toBe('string');
			expect((result as { html: string }).html).toContain('data-block-id="b1"');
		});

		it('omits data-block-id when includeBlockIds is false (class mode)', () => {
			const state: EditorState = EditorState.create({ doc: singleParagraphDoc('hello') });

			const result = getEditorContentHTML(state, undefined, {
				cssMode: 'classes',
				includeBlockIds: false,
			});

			expect((result as { html: string }).html).not.toContain('data-block-id');
		});
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

	// #194: list_item is a hybrid leaf/container. Its content rule allows both
	// `text` (leaf) and block types (container), so the composite-recursion must
	// still descend into a container item to normalize its nested composites.
	function createHybridListRegistry(): SchemaRegistry {
		const registry = new SchemaRegistry();
		const dom = (tag: string) => (node: BlockNode) => {
			const el = document.createElement(tag);
			el.setAttribute('data-block-id', node.id);
			return el;
		};
		registry.registerNodeSpec({ type: 'paragraph', group: 'block', toDOM: dom('p') });
		registry.registerNodeSpec({
			type: 'blockquote',
			group: 'block',
			content: { allow: ['paragraph', 'list_item', 'blockquote'] },
			toDOM: dom('blockquote'),
		});
		registry.registerNodeSpec({
			type: 'list_item',
			group: 'block',
			content: { allow: ['text', 'paragraph', 'blockquote', 'code_block', 'horizontal_rule'] },
			attrs: {
				listType: { default: 'bullet' },
				indent: { default: 0 },
				checked: { default: false },
			},
			toDOM: dom('li'),
		});
		return registry;
	}

	it('leaves a single-paragraph (leaf) list_item untouched (#194)', () => {
		const registry = createHybridListRegistry();
		const doc = createDocument([
			createBlockNode(nodeType('list_item'), [createTextNode('hi')], blockId('li1'), {
				listType: 'bullet',
				indent: 0,
				checked: false,
			}),
		]);

		const result = normalizeCompositeBlocks(doc, registry);

		expect(isLeafBlock(result.children[0] as BlockNode)).toBe(true);
		expect(getBlockText(result.children[0] as BlockNode)).toBe('hi');
	});

	it('recurses into a container list_item and wraps a nested blockquote’s bare inline (#194)', () => {
		const registry = createHybridListRegistry();
		const badQuote = createBlockNode(nodeType('blockquote'), [createTextNode('quoted')]);
		const para = createBlockNode(nodeType('paragraph'), [createTextNode('foo')]);
		const item = createBlockNode(nodeType('list_item'), [para, badQuote], blockId('li1'), {
			listType: 'bullet',
			indent: 0,
			checked: false,
		});

		const result = normalizeCompositeBlocks(createDocument([item]), registry);

		const li = result.children[0] as BlockNode;
		const quote = getBlockChildren(li).find((c) => c.type === 'blockquote') as BlockNode;
		expect(quote).toBeDefined();
		// The blockquote's bare text is now wrapped in a paragraph.
		expect(isLeafBlock(quote)).toBe(false);
		expect(getBlockChildren(quote).map((c) => c.type)).toEqual(['paragraph']);
		expect(getBlockText(getBlockChildren(quote)[0] as BlockNode)).toBe('quoted');
	});
});
