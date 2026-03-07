import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mark } from '../model/Document.js';
import {
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
} from '../model/Document.js';
import type { NodeSpec } from '../model/NodeSpec.js';
import { SchemaRegistry } from '../model/SchemaRegistry.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	createSelection,
} from '../model/Selection.js';
import { blockId, inlineType, markType, nodeType } from '../model/TypeBrands.js';
import type { BlockId } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { ClipboardHandler } from './ClipboardHandler.js';
import type { DispatchFn, GetStateFn } from './InputHandler.js';
import { clearRichClipboard, consumeRichClipboard } from './InternalClipboard.js';

// --- Helpers ---

const B1: BlockId = blockId('b1');
const B2: BlockId = blockId('b2');
const B3: BlockId = blockId('b3');

function createClipboardEvent(
	type: 'copy' | 'cut',
): ClipboardEvent & { data: Map<string, string> } {
	const data = new Map<string, string>();
	const event = new ClipboardEvent(type, { cancelable: true });
	Object.defineProperty(event, 'clipboardData', {
		value: {
			setData(mime: string, value: string): void {
				data.set(mime, value);
			},
			getData(mime: string): string {
				return data.get(mime) ?? '';
			},
		},
	});
	return Object.assign(event, { data });
}

function createImageBlock(bid: BlockId): ReturnType<typeof createBlockNode> {
	return createBlockNode(nodeType('image'), [], bid, {
		src: 'https://example.com/photo.png',
		alt: 'A photo',
	});
}

// --- Suite ---

describe('ClipboardHandler copy', () => {
	let element: HTMLElement;
	let handler: ClipboardHandler;
	let dispatch: DispatchFn;

	afterEach(() => {
		handler?.destroy();
		clearRichClipboard();
	});

	it('writes block JSON for NodeSelection', () => {
		const imgBlock = createImageBlock(B1);
		const doc = createDocument([imgBlock]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createNodeSelection(B1, [B1]),
		});
		dispatch = vi.fn();
		element = document.createElement('div');

		handler = new ClipboardHandler(element, {
			getState: () => state,
			dispatch,
		});

		const event = createClipboardEvent('copy');
		element.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		const json: string = event.data.get('application/x-notectl-block') ?? '';
		expect(json).toBeTruthy();
		const parsed: { type: string; attrs: Record<string, unknown> } = JSON.parse(json);
		expect(parsed.type).toBe('image');
		expect(parsed.attrs.src).toBe('https://example.com/photo.png');
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('writes text/html via toHTML when spec exists', () => {
		const imgBlock = createImageBlock(B1);
		const doc = createDocument([imgBlock]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createNodeSelection(B1, [B1]),
		});
		dispatch = vi.fn();
		element = document.createElement('div');

		const registry = new SchemaRegistry();
		const imgSpec: NodeSpec<'image'> = {
			type: 'image',
			isVoid: true,
			toDOM: () => document.createElement('img'),
			toHTML: (node) => `<img src="${(node.attrs as Record<string, string>)?.src ?? ''}" />`,
		};
		registry.registerNodeSpec(imgSpec);

		handler = new ClipboardHandler(element, {
			getState: () => state,
			dispatch,
			schemaRegistry: registry,
		});

		const event = createClipboardEvent('copy');
		element.dispatchEvent(event);

		const html: string = event.data.get('text/html') ?? '';
		expect(html).toContain('<img');
		expect(html).toContain('https://example.com/photo.png');
	});

	it('writes alt text as text/plain for NodeSelection', () => {
		const imgBlock = createImageBlock(B1);
		const doc = createDocument([imgBlock]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createNodeSelection(B1, [B1]),
		});
		dispatch = vi.fn();
		element = document.createElement('div');

		handler = new ClipboardHandler(element, {
			getState: () => state,
			dispatch,
		});

		const event = createClipboardEvent('copy');
		element.dispatchEvent(event);

		expect(event.data.get('text/plain')).toBe('A photo');
	});

	it('writes selected text as text/plain for text selection', () => {
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('Hello world')], B1)]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createSelection({ blockId: B1, offset: 0 }, { blockId: B1, offset: 5 }),
		});
		dispatch = vi.fn();
		element = document.createElement('div');

		handler = new ClipboardHandler(element, {
			getState: () => state,
			dispatch,
		});

		const event = createClipboardEvent('copy');
		element.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		expect(event.data.get('text/plain')).toBe('Hello');
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('skips InlineNodes when deriving plain text and rich clipboard payloads', () => {
		const doc = createDocument([
			createBlockNode(
				'paragraph',
				[
					createTextNode('A'),
					createInlineNode(inlineType('mention'), { id: 'u1' }),
					createTextNode('B'),
				],
				B1,
			),
		]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createSelection({ blockId: B1, offset: 0 }, { blockId: B1, offset: 2 }),
		});
		dispatch = vi.fn();
		element = document.createElement('div');

		handler = new ClipboardHandler(element, {
			getState: () => state,
			dispatch,
		});

		const event = createClipboardEvent('copy');
		element.dispatchEvent(event);

		expect(event.data.get('text/plain')).toBe('A');
		const richBlocks = consumeRichClipboard('A');
		expect(richBlocks).toHaveLength(1);
		expect(richBlocks?.[0]?.text).toBe('A');
		expect(richBlocks?.[0]?.segments).toEqual([{ text: 'A', marks: [] }]);
	});

	it('writes multi-block text selection joined by newlines', () => {
		const doc = createDocument([
			createBlockNode('paragraph', [createTextNode('Hello')], B1),
			createBlockNode('paragraph', [createTextNode('World')], B2),
		]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createSelection({ blockId: B1, offset: 3 }, { blockId: B2, offset: 3 }),
		});
		dispatch = vi.fn();
		element = document.createElement('div');

		handler = new ClipboardHandler(element, {
			getState: () => state,
			dispatch,
		});

		const event = createClipboardEvent('copy');
		element.dispatchEvent(event);

		expect(event.data.get('text/plain')).toBe('lo\nWor');
	});

	it('does not prevent default for collapsed selection', () => {
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('Hello')], B1)]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createCollapsedSelection(B1, 2),
		});
		dispatch = vi.fn();
		element = document.createElement('div');

		handler = new ClipboardHandler(element, {
			getState: () => state,
			dispatch,
		});

		const event = createClipboardEvent('copy');
		element.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(false);
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('writes text/html with mark tags for text selection with marks', () => {
		const supMark: Mark = { type: markType('superscript') };
		const doc = createDocument([
			createBlockNode('paragraph', [createTextNode('x'), createTextNode('2', [supMark])], B1),
		]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createSelection({ blockId: B1, offset: 0 }, { blockId: B1, offset: 2 }),
		});
		dispatch = vi.fn();
		element = document.createElement('div');

		const registry = new SchemaRegistry();
		registry.registerMarkSpec({
			type: 'superscript',
			rank: 4,
			toDOM: () => document.createElement('sup'),
			toHTMLString: (_mark, content) => `<sup>${content}</sup>`,
		});

		handler = new ClipboardHandler(element, {
			getState: () => state,
			dispatch,
			schemaRegistry: registry,
		});

		const event = createClipboardEvent('copy');
		element.dispatchEvent(event);

		expect(event.data.get('text/plain')).toBe('x2');
		const html: string = event.data.get('text/html') ?? '';
		expect(html).toBe('x<sup>2</sup>');
	});
});

describe('ClipboardHandler copy with void blocks', () => {
	let element: HTMLElement;
	let handler: ClipboardHandler;
	let dispatch: DispatchFn;

	afterEach(() => {
		handler?.destroy();
		clearRichClipboard();
	});

	it('uses document serializer for text selection spanning void blocks', () => {
		const para1 = createBlockNode('paragraph', [createTextNode('Hello')], B1);
		const imgBlock = createBlockNode('image', [], B2, {
			src: 'https://example.com/photo.png',
			alt: 'A photo',
			width: 800,
			height: 600,
		});
		const para2 = createBlockNode('paragraph', [createTextNode('World')], B3);
		const doc = createDocument([para1, imgBlock, para2]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createSelection({ blockId: B1, offset: 0 }, { blockId: B3, offset: 5 }),
		});
		dispatch = vi.fn();
		element = document.createElement('div');

		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'image',
			isVoid: true,
			selectable: true,
			attrs: {
				src: { default: '' },
				alt: { default: '' },
				align: { default: 'center' },
			},
			toDOM: () => document.createElement('figure'),
			toHTML: (node) => {
				const src: string = (node.attrs as Record<string, string>)?.src ?? '';
				const alt: string = (node.attrs as Record<string, string>)?.alt ?? '';
				return `<figure><img src="${src}" alt="${alt}"></figure>`;
			},
			parseHTML: [
				{
					tag: 'figure',
					getAttrs(el: HTMLElement) {
						const img: HTMLImageElement | null = el.querySelector('img');
						if (!img) return false;
						return {
							src: img.getAttribute('src') ?? '',
							alt: img.getAttribute('alt') ?? '',
							align: 'center',
						};
					},
				},
			],
			sanitize: { tags: ['figure', 'img'], attrs: ['src', 'alt', 'width', 'height'] },
		});

		handler = new ClipboardHandler(element, {
			getState: () => state,
			dispatch,
			schemaRegistry: registry,
		});

		const event = createClipboardEvent('copy');
		element.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		const html: string = event.data.get('text/html') ?? '';
		// HTML should contain the image figure, not just empty <p> tags
		expect(html).toContain('<figure>');
		expect(html).toContain('<img');
		expect(html).toContain('https://example.com/photo.png');
	});
});

describe('ClipboardHandler copy with composite blocks (tables)', () => {
	let element: HTMLElement;
	let handler: ClipboardHandler;
	let dispatch: DispatchFn;

	afterEach(() => {
		handler?.destroy();
		clearRichClipboard();
	});

	it('serializes only the selected range within a single table', () => {
		const B4: BlockId = blockId('b4');
		const B5: BlockId = blockId('b5');
		const B6: BlockId = blockId('b6');
		const B7: BlockId = blockId('b7');

		// Table structure: table > row > cell > paragraph (leaf)
		const cell1: ReturnType<typeof createBlockNode> = createBlockNode(
			'table_cell',
			[createBlockNode('paragraph', [createTextNode('alpha')], B1)],
			B4,
		);
		const cell2: ReturnType<typeof createBlockNode> = createBlockNode(
			'table_cell',
			[createBlockNode('paragraph', [createTextNode('omega')], B2)],
			B5,
		);
		const row: ReturnType<typeof createBlockNode> = createBlockNode(
			'table_row',
			[cell1, cell2],
			B6,
		);
		const table: ReturnType<typeof createBlockNode> = createBlockNode('table', [row], B7);

		const doc = createDocument([table]);

		// Select within the table (both endpoints in paragraphs inside the same table root)
		const state: EditorState = EditorState.create({
			doc,
			selection: createSelection({ blockId: B1, offset: 2 }, { blockId: B2, offset: 2 }),
		});
		dispatch = vi.fn();
		element = document.createElement('div');

		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'table',
			toDOM: () => document.createElement('table'),
			toHTML: (_node, content) => `<table><tbody>${content}</tbody></table>`,
			sanitize: { tags: ['table', 'tbody', 'thead', 'tfoot'] },
		});
		registry.registerNodeSpec({
			type: 'table_row',
			toDOM: () => document.createElement('tr'),
			toHTML: (_node, content) => `<tr>${content}</tr>`,
			sanitize: { tags: ['tr'] },
		});
		registry.registerNodeSpec({
			type: 'table_cell',
			toDOM: () => document.createElement('td'),
			toHTML: (_node, content) => `<td><p>${content}</p></td>`,
			sanitize: { tags: ['td', 'th'] },
		});

		handler = new ClipboardHandler(element, {
			getState: () => state,
			dispatch,
			schemaRegistry: registry,
		});

		const event = createClipboardEvent('copy');
		element.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		const html: string = event.data.get('text/html') ?? '';
		const parsed = new DOMParser().parseFromString(html, 'text/html');
		const cells = Array.from(parsed.querySelectorAll('td'));
		expect(parsed.querySelector('table')).not.toBeNull();
		expect(cells).toHaveLength(2);
		expect(cells[0]?.textContent).toBe('pha');
		expect(cells[1]?.textContent).toBe('om');
	});

	it('derives text/plain correctly for composite selections containing InlineNodes', () => {
		const cell1: ReturnType<typeof createBlockNode> = createBlockNode(
			'table_cell',
			[
				createBlockNode(
					'paragraph',
					[
						createTextNode('A'),
						createInlineNode(inlineType('mention'), { id: 'u1' }),
						createTextNode('B'),
					],
					B1,
				),
			],
			blockId('c1'),
		);
		const cell2: ReturnType<typeof createBlockNode> = createBlockNode(
			'table_cell',
			[createBlockNode('paragraph', [createTextNode('Tail')], B2)],
			blockId('c2'),
		);
		const row: ReturnType<typeof createBlockNode> = createBlockNode(
			'table_row',
			[cell1, cell2],
			blockId('r1'),
		);
		const table: ReturnType<typeof createBlockNode> = createBlockNode(
			'table',
			[row],
			blockId('t1'),
		);
		const doc = createDocument([table]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createSelection({ blockId: B1, offset: 0 }, { blockId: B1, offset: 2 }),
		});
		dispatch = vi.fn();
		element = document.createElement('div');

		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'table',
			toDOM: () => document.createElement('table'),
			toHTML: (_node, content) => `<table><tbody>${content}</tbody></table>`,
			sanitize: { tags: ['table', 'tbody', 'thead', 'tfoot'] },
		});
		registry.registerNodeSpec({
			type: 'table_row',
			toDOM: () => document.createElement('tr'),
			toHTML: (_node, content) => `<tr>${content}</tr>`,
			sanitize: { tags: ['tr'] },
		});
		registry.registerNodeSpec({
			type: 'table_cell',
			toDOM: () => document.createElement('td'),
			toHTML: (_node, content) => `<td><p>${content}</p></td>`,
			sanitize: { tags: ['td', 'th'] },
		});

		handler = new ClipboardHandler(element, {
			getState: () => state,
			dispatch,
			schemaRegistry: registry,
		});

		const event = createClipboardEvent('copy');
		element.dispatchEvent(event);

		expect(event.data.get('text/plain')).toBe('A');
	});
});

describe('ClipboardHandler cut', () => {
	let element: HTMLElement;
	let handler: ClipboardHandler;
	let dispatch: DispatchFn;

	afterEach(() => {
		handler?.destroy();
		clearRichClipboard();
	});

	it('writes to clipboard AND dispatches delete for NodeSelection', () => {
		const para = createBlockNode('paragraph', [createTextNode('')], B2);
		const imgBlock = createImageBlock(B1);
		const doc = createDocument([imgBlock, para]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createNodeSelection(B1, [B1]),
			schema: {
				marks: {},
				getNodeSpec: (type: string) => (type === 'image' ? { isVoid: true } : undefined),
			},
		});
		dispatch = vi.fn();
		element = document.createElement('div');

		handler = new ClipboardHandler(element, {
			getState: () => state,
			dispatch,
		});

		const event = createClipboardEvent('cut');
		element.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		// Should have written clipboard data
		const json: string = event.data.get('application/x-notectl-block') ?? '';
		expect(json).toBeTruthy();
		// Should have dispatched a transaction to delete the node
		expect(dispatch).toHaveBeenCalledTimes(1);
		const tr: Transaction = (dispatch as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(tr.metadata.origin).toBe('input');
	});

	it('writes to clipboard AND dispatches delete for text selection', () => {
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('Hello world')], B1)]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createSelection({ blockId: B1, offset: 0 }, { blockId: B1, offset: 5 }),
		});
		dispatch = vi.fn();
		element = document.createElement('div');

		handler = new ClipboardHandler(element, {
			getState: () => state,
			dispatch,
		});

		const event = createClipboardEvent('cut');
		element.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		expect(event.data.get('text/plain')).toBe('Hello');
		expect(dispatch).toHaveBeenCalledTimes(1);
		const tr: Transaction = (dispatch as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(tr.metadata.origin).toBe('input');
	});

	it('does nothing for collapsed selection', () => {
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('Hello')], B1)]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createCollapsedSelection(B1, 2),
		});
		dispatch = vi.fn();
		element = document.createElement('div');

		handler = new ClipboardHandler(element, {
			getState: () => state,
			dispatch,
		});

		const event = createClipboardEvent('cut');
		element.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(false);
		expect(dispatch).not.toHaveBeenCalled();
	});
});

describe('ClipboardHandler HTML serialization with block types', () => {
	let element: HTMLElement;
	let handler: ClipboardHandler;
	let dispatch: DispatchFn;

	afterEach(() => {
		handler.destroy();
	});

	function createRegistryWithBlockTypes(): SchemaRegistry {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'heading',
			attrs: { level: { default: 1 } },
			toDOM: () => document.createElement('h1'),
			toHTML: (node, content) => {
				const level: number = (node.attrs?.level ?? 1) as number;
				return `<h${level}>${content || '<br>'}</h${level}>`;
			},
		});
		registry.registerNodeSpec({
			type: 'blockquote',
			toDOM: () => document.createElement('blockquote'),
			toHTML: (_node, content) => `<blockquote>${content || '<br>'}</blockquote>`,
		});
		registry.registerNodeSpec({
			type: 'horizontal_rule',
			isVoid: true,
			toDOM: () => document.createElement('hr'),
			toHTML: () => '<hr>',
		});
		registry.registerNodeSpec({
			type: 'list_item',
			attrs: { listType: { default: 'bullet' }, indent: { default: 0 } },
			toDOM: () => document.createElement('li'),
			toHTML: (_node, content) => `<li>${content || '<br>'}</li>`,
			wrapper(node) {
				const listType: string = (node.attrs?.listType as string) ?? 'bullet';
				const tag: string = listType === 'ordered' ? 'ol' : 'ul';
				return { tag, key: `list-${listType}` };
			},
		});
		return registry;
	}

	it('serializes heading blocks with proper h-tag', () => {
		const registry: SchemaRegistry = createRegistryWithBlockTypes();
		const doc = createDocument([
			createBlockNode('heading', [createTextNode('Title')], B1, { level: 2 }),
			createBlockNode('paragraph', [createTextNode('Body')], B2),
		]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createSelection({ blockId: B1, offset: 0 }, { blockId: B2, offset: 4 }),
		});
		dispatch = vi.fn();
		element = document.createElement('div');

		handler = new ClipboardHandler(element, {
			getState: () => state,
			dispatch,
			schemaRegistry: registry,
		});

		const event = createClipboardEvent('copy');
		element.dispatchEvent(event);

		const html: string = event.data.get('text/html') ?? '';
		expect(html).toContain('<h2>Title</h2>');
		expect(html).toContain('<p>Body</p>');
	});

	it('serializes blockquote blocks with proper tag', () => {
		const registry: SchemaRegistry = createRegistryWithBlockTypes();
		const doc = createDocument([
			createBlockNode('blockquote', [createTextNode('Quote')], B1),
			createBlockNode('paragraph', [createTextNode('After')], B2),
		]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createSelection({ blockId: B1, offset: 0 }, { blockId: B2, offset: 5 }),
		});
		dispatch = vi.fn();
		element = document.createElement('div');

		handler = new ClipboardHandler(element, {
			getState: () => state,
			dispatch,
			schemaRegistry: registry,
		});

		const event = createClipboardEvent('copy');
		element.dispatchEvent(event);

		const html: string = event.data.get('text/html') ?? '';
		expect(html).toContain('<blockquote>Quote</blockquote>');
	});

	it('serializes mixed block types (heading + blockquote + paragraph)', () => {
		const registry: SchemaRegistry = createRegistryWithBlockTypes();
		const doc = createDocument([
			createBlockNode('heading', [createTextNode('Title')], B1, { level: 1 }),
			createBlockNode('blockquote', [createTextNode('A quote')], B2),
			createBlockNode('paragraph', [createTextNode('After')], B3),
		]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createSelection({ blockId: B1, offset: 0 }, { blockId: B3, offset: 5 }),
		});
		dispatch = vi.fn();
		element = document.createElement('div');

		handler = new ClipboardHandler(element, {
			getState: () => state,
			dispatch,
			schemaRegistry: registry,
		});

		const event = createClipboardEvent('copy');
		element.dispatchEvent(event);

		const html: string = event.data.get('text/html') ?? '';
		expect(html).toContain('<h1>Title</h1>');
		expect(html).toContain('<blockquote>A quote</blockquote>');
		expect(html).toContain('<p>After</p>');
	});

	it('groups consecutive list_items into ul/ol wrappers', () => {
		const registry: SchemaRegistry = createRegistryWithBlockTypes();
		const doc = createDocument([
			createBlockNode('list_item', [createTextNode('Item 1')], B1, {
				listType: 'bullet',
				indent: 0,
			}),
			createBlockNode('list_item', [createTextNode('Item 2')], B2, {
				listType: 'bullet',
				indent: 0,
			}),
			createBlockNode('paragraph', [createTextNode('After')], B3),
		]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createSelection({ blockId: B1, offset: 0 }, { blockId: B3, offset: 5 }),
		});
		dispatch = vi.fn();
		element = document.createElement('div');

		handler = new ClipboardHandler(element, {
			getState: () => state,
			dispatch,
			schemaRegistry: registry,
		});

		const event = createClipboardEvent('copy');
		element.dispatchEvent(event);

		const html: string = event.data.get('text/html') ?? '';
		expect(html).toContain('<ul><li>Item 1</li><li>Item 2</li></ul>');
	});

	it('groups ordered list items into <ol> wrapper', () => {
		const registry: SchemaRegistry = createRegistryWithBlockTypes();
		const doc = createDocument([
			createBlockNode('list_item', [createTextNode('First')], B1, {
				listType: 'ordered',
				indent: 0,
			}),
			createBlockNode('list_item', [createTextNode('Second')], B2, {
				listType: 'ordered',
				indent: 0,
			}),
		]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createSelection({ blockId: B1, offset: 0 }, { blockId: B2, offset: 6 }),
		});
		dispatch = vi.fn();
		element = document.createElement('div');

		handler = new ClipboardHandler(element, {
			getState: () => state,
			dispatch,
			schemaRegistry: registry,
		});

		const event = createClipboardEvent('copy');
		element.dispatchEvent(event);

		const html: string = event.data.get('text/html') ?? '';
		expect(html).toContain('<ol><li>First</li><li>Second</li></ol>');
	});

	it('embeds rich block data as data-notectl-rich in multi-block HTML', () => {
		const registry: SchemaRegistry = createRegistryWithBlockTypes();
		const doc = createDocument([
			createBlockNode('heading', [createTextNode('Title')], B1, { level: 1 }),
			createBlockNode('paragraph', [createTextNode('Body')], B2),
		]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createSelection({ blockId: B1, offset: 0 }, { blockId: B2, offset: 4 }),
		});
		dispatch = vi.fn();
		element = document.createElement('div');

		handler = new ClipboardHandler(element, {
			getState: () => state,
			dispatch,
			schemaRegistry: registry,
		});

		const event = createClipboardEvent('copy');
		element.dispatchEvent(event);

		const html: string = event.data.get('text/html') ?? '';
		expect(html).toContain('data-notectl-rich=');
	});

	it('stores mark segments in rich clipboard data', () => {
		const registry: SchemaRegistry = createRegistryWithBlockTypes();
		registry.registerMarkSpec({
			type: 'bold',
			rank: 1,
			toDOM: () => document.createElement('strong'),
			toHTMLString: (_mark, content) => `<strong>${content}</strong>`,
		});

		const boldMark: Mark = { type: markType('bold') };
		const doc = createDocument([
			createBlockNode(
				'paragraph',
				[createTextNode('hello '), createTextNode('world', [boldMark])],
				B1,
			),
			createBlockNode('paragraph', [createTextNode('line2')], B2),
		]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createSelection({ blockId: B1, offset: 0 }, { blockId: B2, offset: 5 }),
		});
		dispatch = vi.fn();
		element = document.createElement('div');

		handler = new ClipboardHandler(element, {
			getState: () => state,
			dispatch,
			schemaRegistry: registry,
		});

		const event = createClipboardEvent('copy');
		element.dispatchEvent(event);

		// The rich data is embedded in the HTML as data-notectl-rich
		const html: string = event.data.get('text/html') ?? '';
		expect(html).toContain('data-notectl-rich=');
		// Parse and check segments
		const template: HTMLTemplateElement = document.createElement('template');
		template.innerHTML = html;
		const richEl: Element | null = template.content.querySelector('[data-notectl-rich]');
		expect(richEl).not.toBeNull();
		const richData = JSON.parse(richEl?.getAttribute('data-notectl-rich') ?? '[]');
		expect(richData[0].segments).toBeDefined();
		expect(richData[0].segments.length).toBe(2);
		expect(richData[0].segments[1].marks[0].type).toBe('bold');
	});
});

describe('ClipboardHandler destroy', () => {
	it('removes event listeners', () => {
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('Hello')], B1)]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createCollapsedSelection(B1, 0),
		});
		const dispatch: DispatchFn = vi.fn();
		const element: HTMLElement = document.createElement('div');

		const handler = new ClipboardHandler(element, {
			getState: () => state,
			dispatch,
		});

		handler.destroy();

		// After destroy, events should not be handled
		const event = createClipboardEvent('copy');
		element.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
	});
});
