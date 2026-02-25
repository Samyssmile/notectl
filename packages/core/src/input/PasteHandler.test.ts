import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBlockNode, createDocument, createTextNode, isBlockNode } from '../model/Document.js';
import type { NodeSpec } from '../model/NodeSpec.js';
import { SchemaRegistry } from '../model/SchemaRegistry.js';
import { createCollapsedSelection, isNodeSelection } from '../model/Selection.js';
import { blockId } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
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
		const registry = new SchemaRegistry();
		registry.registerFileHandler('image/png', fileHandler);

		handler = new PasteHandler(element, { getState, dispatch, schemaRegistry: registry });

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

		const registry = new SchemaRegistry();
		// Register handler for image/png only
		registry.registerFileHandler('image/png', vi.fn().mockReturnValue(false));

		handler = new PasteHandler(element, { getState, dispatch, schemaRegistry: registry });

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
		const registry = new SchemaRegistry();
		registry.registerFileHandler('image/jpeg', fileHandler);

		handler = new PasteHandler(element, { getState, dispatch, schemaRegistry: registry });

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

describe('SchemaRegistry MIME matching', () => {
	it('matches exact MIME type', () => {
		const registry = new SchemaRegistry();
		const handler = vi.fn();
		registry.registerFileHandler('image/png', handler);

		const matched: ReturnType<typeof registry.matchFileHandlers> =
			registry.matchFileHandlers('image/png');
		expect(matched).toHaveLength(1);
		expect(matched[0]).toBe(handler);
	});

	it('matches wildcard image/*', () => {
		const registry = new SchemaRegistry();
		const handler = vi.fn();
		registry.registerFileHandler('image/*', handler);

		const matchedPng: ReturnType<typeof registry.matchFileHandlers> =
			registry.matchFileHandlers('image/png');
		expect(matchedPng).toHaveLength(1);
		expect(matchedPng[0]).toBe(handler);

		const matchedJpeg: ReturnType<typeof registry.matchFileHandlers> =
			registry.matchFileHandlers('image/jpeg');
		expect(matchedJpeg).toHaveLength(1);
		expect(matchedJpeg[0]).toBe(handler);
	});

	it('returns empty for unmatched type', () => {
		const registry = new SchemaRegistry();
		registry.registerFileHandler('image/png', vi.fn());

		const matched: ReturnType<typeof registry.matchFileHandlers> =
			registry.matchFileHandlers('application/pdf');
		expect(matched).toHaveLength(0);
	});
});
