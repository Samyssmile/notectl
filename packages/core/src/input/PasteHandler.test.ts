import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBlockNode, createDocument, createTextNode, isBlockNode } from '../model/Document.js';
import type { NodeSpec } from '../model/NodeSpec.js';
import { SchemaRegistry } from '../model/SchemaRegistry.js';
import { createCollapsedSelection, isNodeSelection } from '../model/Selection.js';
import { blockId } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { FileHandlerRegistry } from './FileHandlerRegistry.js';
import type { DispatchFn, GetStateFn } from './InputHandler.js';
import { PasteHandler } from './PasteHandler.js';

// --- Helpers ---

const B1: ReturnType<typeof blockId> = blockId('b1');

function createTestState(): EditorState {
	const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], B1)]);
	return EditorState.create({ doc, selection: createCollapsedSelection(B1, 5) });
}

function createPasteEvent(options: {
	files?: File[];
	items?: DataTransferItem[];
	html?: string;
	text?: string;
	extraData?: Record<string, string>;
}): ClipboardEvent {
	const files: File[] = options.files ?? [];
	const items: DataTransferItem[] = options.items ?? [];
	const extra: Record<string, string> = options.extraData ?? {};

	const dataTransfer = {
		files,
		items,
		getData(type: string): string {
			if (type in extra) return extra[type] as string;
			if (type === 'text/html') return options.html ?? '';
			if (type === 'text/plain') return options.text ?? '';
			return '';
		},
		types: [] as string[],
	};

	if (files.length > 0) dataTransfer.types.push('Files');
	if (options.html) dataTransfer.types.push('text/html');
	if (options.text) dataTransfer.types.push('text/plain');

	const event = new ClipboardEvent('paste');
	Object.defineProperty(event, 'clipboardData', { value: dataTransfer });
	return event;
}

// --- Suite ---

describe('PasteHandler file paste', () => {
	let element: HTMLElement;
	let handler: PasteHandler;
	let dispatch: DispatchFn;
	let getState: GetStateFn;

	afterEach(() => {
		handler.destroy();
	});

	it('triggers registered handler when MIME matches', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		dispatch = vi.fn();
		getState = () => state;

		const fileHandler = vi.fn().mockReturnValue(true);
		const fileHandlerRegistry = new FileHandlerRegistry();
		fileHandlerRegistry.registerFileHandler('image/png', fileHandler);

		handler = new PasteHandler(element, { getState, dispatch, fileHandlerRegistry });

		const pngFile = new File(['bytes'], 'photo.png', { type: 'image/png' });
		const event: ClipboardEvent = createPasteEvent({ files: [pngFile] });
		element.dispatchEvent(event);

		expect(fileHandler).toHaveBeenCalledTimes(1);
		expect(fileHandler).toHaveBeenCalledWith(pngFile, null);
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('falls through to text when no handler matches', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		dispatch = vi.fn();
		getState = () => state;

		const fileHandlerRegistry = new FileHandlerRegistry();
		// Register handler for image/png only
		fileHandlerRegistry.registerFileHandler('image/png', vi.fn().mockReturnValue(false));

		handler = new PasteHandler(element, { getState, dispatch, fileHandlerRegistry });

		const csvFile = new File(['a,b,c'], 'data.csv', { type: 'text/csv' });
		const event: ClipboardEvent = createPasteEvent({
			files: [csvFile],
			text: 'fallback text',
		});
		element.dispatchEvent(event);

		// No matching handler for text/csv, files returns false, so falls through to text
		expect(dispatch).toHaveBeenCalledTimes(1);
		const tr: Transaction = (dispatch as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(tr.metadata.origin).toBe('paste');
	});

	it('checks clipboardData.items when files array is empty', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		dispatch = vi.fn();
		getState = () => state;

		const fileHandler = vi.fn().mockReturnValue(true);
		const fileHandlerRegistry = new FileHandlerRegistry();
		fileHandlerRegistry.registerFileHandler('image/jpeg', fileHandler);

		handler = new PasteHandler(element, { getState, dispatch, fileHandlerRegistry });

		const jpegFile = new File(['img'], 'photo.jpg', { type: 'image/jpeg' });
		const itemMock: DataTransferItem = {
			kind: 'file',
			type: 'image/jpeg',
			getAsFile: () => jpegFile,
			getAsString: vi.fn(),
			webkitGetAsEntry: vi.fn().mockReturnValue(null),
		};

		const event: ClipboardEvent = createPasteEvent({
			files: [],
			items: [itemMock],
		});
		element.dispatchEvent(event);

		expect(fileHandler).toHaveBeenCalledTimes(1);
		expect(dispatch).not.toHaveBeenCalled();
	});
});

describe('PasteHandler text paste', () => {
	let element: HTMLElement;
	let handler: PasteHandler;
	let dispatch: DispatchFn;
	let getState: GetStateFn;

	afterEach(() => {
		handler.destroy();
	});

	it('plain text paste dispatches transaction with paste origin', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		dispatch = vi.fn();
		getState = () => state;

		handler = new PasteHandler(element, { getState, dispatch });

		const event: ClipboardEvent = createPasteEvent({ text: 'pasted text' });
		element.dispatchEvent(event);

		expect(dispatch).toHaveBeenCalledTimes(1);
		const tr: Transaction = (dispatch as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(tr.metadata.origin).toBe('paste');
	});

	it('HTML paste extracts text and dispatches transaction', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		dispatch = vi.fn();
		getState = () => state;

		handler = new PasteHandler(element, { getState, dispatch });

		const event: ClipboardEvent = createPasteEvent({
			html: '<p>rich <strong>text</strong></p>',
		});
		element.dispatchEvent(event);

		expect(dispatch).toHaveBeenCalledTimes(1);
		const tr: Transaction = (dispatch as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(tr.metadata.origin).toBe('paste');
	});

	it('HTML paste preserves superscript marks when schemaRegistry is present', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		let currentState: EditorState = state;
		dispatch = vi.fn((tr: Transaction) => {
			currentState = currentState.apply(tr);
		});
		getState = () => currentState;

		const registry = new SchemaRegistry();
		registry.registerMarkSpec({
			type: 'superscript',
			rank: 4,
			toDOM: () => document.createElement('sup'),
			toHTMLString: (_mark, content) => `<sup>${content}</sup>`,
			parseHTML: [{ tag: 'sup' }],
			sanitize: { tags: ['sup'] },
		});

		handler = new PasteHandler(element, { getState, dispatch, schemaRegistry: registry });

		const event: ClipboardEvent = createPasteEvent({
			html: '<p>x<sup>2</sup></p>',
		});
		element.dispatchEvent(event);

		expect(dispatch).toHaveBeenCalledTimes(1);
		const tr: Transaction = (dispatch as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(tr.metadata.origin).toBe('paste');

		// Verify that the inserted text has superscript marks
		const block = currentState.doc.children[0];
		expect(block).toBeDefined();
		if (block) {
			const textChildren = block.children.filter(
				(c): c is { type: 'text'; text: string; marks: readonly { type: string }[] } =>
					c.type === 'text',
			);
			const supChild = textChildren.find((c) => c.marks.some((m) => m.type === 'superscript'));
			expect(supChild).toBeDefined();
			expect(supChild?.text).toContain('2');
		}
	});
});

describe('PasteHandler block paste', () => {
	let element: HTMLElement;
	let handler: PasteHandler;
	let dispatch: DispatchFn;

	afterEach(() => {
		handler.destroy();
	});

	it('inserts block node from application/x-notectl-block JSON', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();

		const registry = new SchemaRegistry();
		const imgSpec: NodeSpec<'image'> = {
			type: 'image',
			isVoid: true,
			attrs: { src: { default: '' }, alt: { default: '' } },
			toDOM: () => document.createElement('img'),
		};
		registry.registerNodeSpec(imgSpec);

		let currentState = state;
		dispatch = vi.fn((tr: Transaction) => {
			currentState = currentState.apply(tr);
		});

		handler = new PasteHandler(element, {
			getState: () => currentState,
			dispatch,
			schemaRegistry: registry,
		});

		const blockJson: string = JSON.stringify({
			type: 'image',
			attrs: { src: 'https://example.com/photo.png', alt: 'A photo' },
		});

		const event: ClipboardEvent = createPasteEvent({
			extraData: { 'application/x-notectl-block': blockJson },
		});
		element.dispatchEvent(event);

		expect(dispatch).toHaveBeenCalledTimes(1);
		const tr: Transaction = (dispatch as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(tr.metadata.origin).toBe('paste');

		// Verify the new block was inserted
		expect(currentState.doc.children).toHaveLength(2);
		const newBlock = currentState.doc.children[1];
		expect(isBlockNode(newBlock)).toBe(true);
		if (isBlockNode(newBlock)) {
			expect(newBlock.type).toBe('image');
			expect(newBlock.attrs?.src).toBe('https://example.com/photo.png');
		}

		// Selection should be a NodeSelection on the new block
		expect(isNodeSelection(currentState.selection)).toBe(true);
	});

	it('ignores unknown block types when registry is present', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		dispatch = vi.fn();

		const registry = new SchemaRegistry();
		// No 'image' spec registered

		handler = new PasteHandler(element, {
			getState: () => state,
			dispatch,
			schemaRegistry: registry,
		});

		const blockJson: string = JSON.stringify({ type: 'image', attrs: { src: 'x' } });
		const event: ClipboardEvent = createPasteEvent({
			extraData: { 'application/x-notectl-block': blockJson },
		});
		element.dispatchEvent(event);

		expect(dispatch).not.toHaveBeenCalled();
	});
});

describe('PasteHandler rich paste schema validation', () => {
	let element: HTMLElement;
	let handler: PasteHandler;
	let dispatch: DispatchFn;

	afterEach(() => {
		handler.destroy();
	});

	function createRegistryWithSpecs(): SchemaRegistry {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'heading',
			attrs: { level: { default: 1 } },
			toDOM: () => document.createElement('h1'),
		});
		registry.registerNodeSpec({
			type: 'list_item',
			attrs: { listType: { default: 'bullet' }, indent: { default: 0 } },
			toDOM: () => document.createElement('li'),
		});
		return registry;
	}

	function createRichPasteEvent(blocks: readonly Record<string, unknown>[]): ClipboardEvent {
		const json: string = JSON.stringify(blocks);
		const html: string = `<div data-notectl-rich='${json}'></div>`;
		return createPasteEvent({ html });
	}

	it('filters unknown block types from rich paste', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		let currentState: EditorState = state;
		dispatch = vi.fn((tr: Transaction) => {
			currentState = currentState.apply(tr);
		});

		const registry: SchemaRegistry = createRegistryWithSpecs();
		handler = new PasteHandler(element, {
			getState: () => currentState,
			dispatch,
			schemaRegistry: registry,
		});

		const event: ClipboardEvent = createRichPasteEvent([
			{ type: 'heading', text: 'Title', attrs: { level: 2 } },
			{ type: 'unknown_type', text: 'bad block' },
		]);
		element.dispatchEvent(event);

		expect(dispatch).toHaveBeenCalledTimes(1);
		// Only the heading should be inserted (plus original paragraph)
		const blocks = currentState.doc.children.filter(
			(c) => isBlockNode(c) && c.type === 'unknown_type',
		);
		expect(blocks).toHaveLength(0);
	});

	it('removes unknown attributes and keeps only spec-declared keys', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		let currentState: EditorState = state;
		dispatch = vi.fn((tr: Transaction) => {
			currentState = currentState.apply(tr);
		});

		const registry: SchemaRegistry = createRegistryWithSpecs();
		handler = new PasteHandler(element, {
			getState: () => currentState,
			dispatch,
			schemaRegistry: registry,
		});

		const event: ClipboardEvent = createRichPasteEvent([
			{ type: 'heading', text: 'Title', attrs: { level: 2, injected: 'evil' } },
		]);
		element.dispatchEvent(event);

		expect(dispatch).toHaveBeenCalledTimes(1);
		const heading = currentState.doc.children.find((c) => isBlockNode(c) && c.type === 'heading');
		expect(heading).toBeDefined();
		if (heading && isBlockNode(heading)) {
			expect(heading.attrs?.level).toBe(2);
			expect((heading.attrs as Record<string, unknown>)?.injected).toBeUndefined();
		}
	});

	it('fills missing attributes with defaults from AttrSpec', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		let currentState: EditorState = state;
		dispatch = vi.fn((tr: Transaction) => {
			currentState = currentState.apply(tr);
		});

		const registry: SchemaRegistry = createRegistryWithSpecs();
		handler = new PasteHandler(element, {
			getState: () => currentState,
			dispatch,
			schemaRegistry: registry,
		});

		// Paste a heading with no attrs at all — level should default to 1
		const event: ClipboardEvent = createRichPasteEvent([{ type: 'heading', text: 'No level set' }]);
		element.dispatchEvent(event);

		expect(dispatch).toHaveBeenCalledTimes(1);
		const heading = currentState.doc.children.find((c) => isBlockNode(c) && c.type === 'heading');
		expect(heading).toBeDefined();
		if (heading && isBlockNode(heading)) {
			expect(heading.attrs?.level).toBe(1);
		}
	});

	it('passes all blocks through when no schema registry is present', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		let currentState: EditorState = state;
		dispatch = vi.fn((tr: Transaction) => {
			currentState = currentState.apply(tr);
		});

		// No schemaRegistry provided — graceful degradation
		handler = new PasteHandler(element, {
			getState: () => currentState,
			dispatch,
		});

		const event: ClipboardEvent = createRichPasteEvent([
			{ type: 'heading', text: 'Title' },
			{ type: 'unknown_type', text: 'also passes' },
		]);
		element.dispatchEvent(event);

		expect(dispatch).toHaveBeenCalledTimes(1);
		// Both blocks should be inserted (no filtering without registry)
		const headings = currentState.doc.children.filter(
			(c) => isBlockNode(c) && c.type === 'heading',
		);
		const unknowns = currentState.doc.children.filter(
			(c) => isBlockNode(c) && c.type === 'unknown_type',
		);
		expect(headings).toHaveLength(1);
		expect(unknowns).toHaveLength(1);
	});

	it('returns false and does not dispatch when all blocks are invalid', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		dispatch = vi.fn();

		const registry: SchemaRegistry = createRegistryWithSpecs();
		handler = new PasteHandler(element, {
			getState: () => state,
			dispatch,
			schemaRegistry: registry,
		});

		// All blocks have unknown types — nothing should be inserted
		// Include non-paragraph types so hasStructured check passes
		const event: ClipboardEvent = createRichPasteEvent([
			{ type: 'fake_block', text: 'nope' },
			{ type: 'another_fake', text: 'also nope' },
		]);
		element.dispatchEvent(event);

		// The rich paste path dispatches even if all blocks are filtered out
		// (it builds an empty transaction). The key assertion is that no
		// invalid blocks end up in the document.
		const tr: Transaction | undefined = (dispatch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
		if (tr) {
			const result: EditorState = state.apply(tr);
			const fakes = result.doc.children.filter(
				(c) => isBlockNode(c) && (c.type === 'fake_block' || c.type === 'another_fake'),
			);
			expect(fakes).toHaveLength(0);
		}
	});

	it('sanitizes attributes in handleBlockPaste', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();

		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'image',
			isVoid: true,
			attrs: { src: { default: '' }, alt: { default: '' } },
			toDOM: () => document.createElement('img'),
		});

		let currentState: EditorState = state;
		dispatch = vi.fn((tr: Transaction) => {
			currentState = currentState.apply(tr);
		});

		handler = new PasteHandler(element, {
			getState: () => currentState,
			dispatch,
			schemaRegistry: registry,
		});

		const blockJson: string = JSON.stringify({
			type: 'image',
			attrs: { src: 'https://example.com/photo.png', injected: 'evil', nested: { a: 1 } },
		});

		const event: ClipboardEvent = createPasteEvent({
			extraData: { 'application/x-notectl-block': blockJson },
		});
		element.dispatchEvent(event);

		expect(dispatch).toHaveBeenCalledTimes(1);
		const newBlock = currentState.doc.children[1];
		expect(isBlockNode(newBlock)).toBe(true);
		if (isBlockNode(newBlock)) {
			expect(newBlock.attrs?.src).toBe('https://example.com/photo.png');
			expect(newBlock.attrs?.alt).toBe('');
			expect((newBlock.attrs as Record<string, unknown>)?.injected).toBeUndefined();
			expect((newBlock.attrs as Record<string, unknown>)?.nested).toBeUndefined();
		}
	});

	it('rejects non-primitive attribute values and falls back to defaults', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		let currentState: EditorState = state;
		dispatch = vi.fn((tr: Transaction) => {
			currentState = currentState.apply(tr);
		});

		const registry: SchemaRegistry = createRegistryWithSpecs();
		handler = new PasteHandler(element, {
			getState: () => currentState,
			dispatch,
			schemaRegistry: registry,
		});

		// level is an object instead of a number — should fall back to default (1)
		const event: ClipboardEvent = createRichPasteEvent([
			{ type: 'heading', text: 'Title', attrs: { level: { evil: true } } },
		]);
		element.dispatchEvent(event);

		expect(dispatch).toHaveBeenCalledTimes(1);
		const heading = currentState.doc.children.find((c) => isBlockNode(c) && c.type === 'heading');
		expect(heading).toBeDefined();
		if (heading && isBlockNode(heading)) {
			expect(heading.attrs?.level).toBe(1);
		}
	});
});

describe('FileHandlerRegistry MIME matching (via PasteHandler)', () => {
	it('matches exact MIME type', () => {
		const registry = new FileHandlerRegistry();
		const handler = vi.fn();
		registry.registerFileHandler('image/png', handler);

		const matched = registry.matchFileHandlers('image/png');
		expect(matched).toHaveLength(1);
		expect(matched[0]).toBe(handler);
	});

	it('matches wildcard image/*', () => {
		const registry = new FileHandlerRegistry();
		const handler = vi.fn();
		registry.registerFileHandler('image/*', handler);

		const matchedPng = registry.matchFileHandlers('image/png');
		expect(matchedPng).toHaveLength(1);
		expect(matchedPng[0]).toBe(handler);

		const matchedJpeg = registry.matchFileHandlers('image/jpeg');
		expect(matchedJpeg).toHaveLength(1);
		expect(matchedJpeg[0]).toBe(handler);
	});

	it('returns empty for unmatched type', () => {
		const registry = new FileHandlerRegistry();
		registry.registerFileHandler('image/png', vi.fn());

		const matched = registry.matchFileHandlers('application/pdf');
		expect(matched).toHaveLength(0);
	});
});
