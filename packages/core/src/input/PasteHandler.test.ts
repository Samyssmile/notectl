import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBlockNode, createDocument, createTextNode } from '../model/Document.js';
import { SchemaRegistry } from '../model/SchemaRegistry.js';
import { createCollapsedSelection } from '../model/Selection.js';
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
}): ClipboardEvent {
	const files: File[] = options.files ?? [];
	const items: DataTransferItem[] = options.items ?? [];

	const dataTransfer = {
		files,
		items,
		getData(type: string): string {
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
		expect(fileHandler).toHaveBeenCalledWith([pngFile], null);
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
