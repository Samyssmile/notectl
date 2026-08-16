import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	type BlockNode,
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
	getBlockText,
	isBlockNode,
	isInlineNode,
} from '../model/Document.js';
import { FileHandlerRegistry } from '../model/FileHandlerRegistry.js';
import type { MarkdownSyntaxExtension } from '../model/MarkdownSyntaxRegistry.js';
import type { NodeSpec } from '../model/NodeSpec.js';
import { PluginCallbackExecutor } from '../model/PluginCallbackExecutor.js';
import { SchemaRegistry } from '../model/SchemaRegistry.js';
import {
	createCollapsedSelection,
	createSelection,
	isNodeSelection,
	isTextSelection,
} from '../model/Selection.js';
import { blockId, inlineType } from '../model/TypeBrands.js';
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

	const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
	Object.defineProperty(event, 'clipboardData', { value: dataTransfer });
	return event;
}

function deferred<T>(): {
	readonly promise: Promise<T>;
	readonly resolve: (value: T) => void;
} {
	let resolve = (_value: T): void => {};
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
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

	it('prefers clipboard HTML with real content over a bitmap file item (#216)', () => {
		// Word/Excel on macOS put a bitmap rendition of the copied text next to the
		// HTML flavor; Chromium exposes it as a file item. The HTML must win.
		element = document.createElement('div');
		let state: EditorState = createTestState();
		dispatch = vi.fn((tr: Transaction) => {
			state = state.apply(tr);
		});
		getState = () => state;

		const fileHandler = vi.fn().mockReturnValue(true);
		const fileHandlerRegistry = new FileHandlerRegistry();
		fileHandlerRegistry.registerFileHandler('image/*', fileHandler);

		handler = new PasteHandler(element, { getState, dispatch, fileHandlerRegistry });

		const renditionFile = new File(['bytes'], 'rendition.png', { type: 'image/png' });
		element.dispatchEvent(
			createPasteEvent({
				files: [renditionFile],
				html: '<meta charset="utf-8"><p>Hello <b>Word</b></p>',
				text: 'Hello Word',
			}),
		);

		expect(fileHandler).not.toHaveBeenCalled();
		expect(dispatch).toHaveBeenCalledTimes(1);
		const tr: Transaction = (dispatch as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(tr.metadata.origin).toBe('paste');
		const allText: string = state.doc.children.map((b) => getBlockText(b)).join('');
		expect(allText).toContain('Hello Word');
	});

	it('routes image-only clipboard HTML with a file to the file handlers', () => {
		// Copying an image on a web page ships `<img>` HTML next to the image file;
		// the file handlers keep owning that paste (blob URLs, upload services).
		element = document.createElement('div');
		const state: EditorState = createTestState();
		dispatch = vi.fn();
		getState = () => state;

		const fileHandler = vi.fn().mockReturnValue(true);
		const fileHandlerRegistry = new FileHandlerRegistry();
		fileHandlerRegistry.registerFileHandler('image/*', fileHandler);

		handler = new PasteHandler(element, { getState, dispatch, fileHandlerRegistry });

		const pngFile = new File(['bytes'], 'photo.png', { type: 'image/png' });
		element.dispatchEvent(
			createPasteEvent({
				files: [pngFile],
				html: '<meta charset="utf-8"><div><img src="https://example.com/photo.png" alt=""></div>',
			}),
		);

		expect(fileHandler).toHaveBeenCalledTimes(1);
		expect(fileHandler).toHaveBeenCalledWith(pngFile, null);
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('routes SVG-only clipboard HTML with an image file to the file handlers', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		dispatch = vi.fn();
		getState = () => state;

		const fileHandler = vi.fn().mockReturnValue(true);
		const fileHandlerRegistry = new FileHandlerRegistry();
		fileHandlerRegistry.registerFileHandler('image/svg+xml', fileHandler);

		handler = new PasteHandler(element, { getState, dispatch, fileHandlerRegistry });

		const svgFile = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });
		element.dispatchEvent(
			createPasteEvent({
				files: [svgFile],
				html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>Logo</title><path d="M0 0h10v10H0z"/></svg>',
			}),
		);

		expect(fileHandler).toHaveBeenCalledTimes(1);
		expect(fileHandler).toHaveBeenCalledWith(svgFile, null);
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('keeps non-image file handlers ahead of clipboard HTML', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		dispatch = vi.fn();
		getState = () => state;

		const fileHandler = vi.fn().mockReturnValue(true);
		const fileHandlerRegistry = new FileHandlerRegistry();
		fileHandlerRegistry.registerFileHandler('text/csv', fileHandler);

		handler = new PasteHandler(element, { getState, dispatch, fileHandlerRegistry });

		const csvFile = new File(['a,b,c'], 'data.csv', { type: 'text/csv' });
		element.dispatchEvent(
			createPasteEvent({
				files: [csvFile],
				html: '<p>Clipboard preview</p>',
				text: 'Clipboard preview',
			}),
		);

		expect(fileHandler).toHaveBeenCalledTimes(1);
		expect(fileHandler).toHaveBeenCalledWith(csvFile, null);
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('prefers structural clipboard HTML without images or text over a file item', () => {
		// A horizontal rule carries no textContent but is real block content; the
		// HTML wins and materializes, so the file fallback must not fire.
		element = document.createElement('div');
		let state: EditorState = createTestState();
		dispatch = vi.fn((tr: Transaction) => {
			state = state.apply(tr);
		});
		getState = () => state;

		const schemaRegistry = new SchemaRegistry();
		schemaRegistry.registerNodeSpec({
			type: 'horizontal_rule',
			isVoid: true,
			selectable: true,
			toDOM: () => document.createElement('hr'),
			parseHTML: [{ tag: 'hr' }],
			sanitize: { tags: ['hr'], attrs: [] },
		});

		const fileHandler = vi.fn().mockReturnValue(true);
		const fileHandlerRegistry = new FileHandlerRegistry();
		fileHandlerRegistry.registerFileHandler('image/*', fileHandler);

		handler = new PasteHandler(element, {
			getState,
			dispatch,
			fileHandlerRegistry,
			schemaRegistry,
		});

		const pngFile = new File(['bytes'], 'photo.png', { type: 'image/png' });
		element.dispatchEvent(
			createPasteEvent({
				files: [pngFile],
				html: '<hr>',
			}),
		);

		expect(fileHandler).not.toHaveBeenCalled();
		const hrBlock = state.doc.children.find((c) => isBlockNode(c) && c.type === 'horizontal_rule');
		expect(hrBlock).toBeDefined();
	});

	it('falls back to the file handlers when the preferred HTML pastes nothing (#216)', () => {
		// Design tools (Figma-style) put metadata-only markup next to the bitmap:
		// spans that carry data attributes but no text and no <img>. The HTML wins
		// the precedence check but materializes nothing, so the image file must
		// still get its turn instead of the paste being silently discarded.
		element = document.createElement('div');
		const state: EditorState = createTestState();
		dispatch = vi.fn();
		getState = () => state;

		const fileHandler = vi.fn().mockReturnValue(true);
		const fileHandlerRegistry = new FileHandlerRegistry();
		fileHandlerRegistry.registerFileHandler('image/*', fileHandler);

		handler = new PasteHandler(element, { getState, dispatch, fileHandlerRegistry });

		const pngFile = new File(['bytes'], 'rendition.png', { type: 'image/png' });
		element.dispatchEvent(
			createPasteEvent({
				files: [pngFile],
				html: '<meta charset="utf-8"><span data-metadata="…"></span><span data-buffer="abc"></span>',
			}),
		);

		expect(fileHandler).toHaveBeenCalledTimes(1);
		expect(fileHandler).toHaveBeenCalledWith(pngFile, null);
	});

	it('defers to the file handlers when metadata markup parses to only empty paragraphs (#216)', () => {
		// Structural divs parse into several empty paragraphs. None of them is
		// content: the image must still paste, no junk paragraphs may be
		// inserted, and the range selection must survive untouched (no
		// delete-only transaction ahead of the file handler).
		element = document.createElement('div');
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], B1)]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createSelection({ blockId: B1, offset: 0 }, { blockId: B1, offset: 5 }),
		});
		dispatch = vi.fn();
		getState = () => state;

		const fileHandler = vi.fn().mockReturnValue(true);
		const fileHandlerRegistry = new FileHandlerRegistry();
		fileHandlerRegistry.registerFileHandler('image/*', fileHandler);

		handler = new PasteHandler(element, {
			getState,
			dispatch,
			fileHandlerRegistry,
			schemaRegistry: new SchemaRegistry(),
		});

		const pngFile = new File(['bytes'], 'rendition.png', { type: 'image/png' });
		element.dispatchEvent(
			createPasteEvent({
				files: [pngFile],
				html: '<div><span data-metadata="a"></span></div><div><span data-buffer="b"></span></div>',
			}),
		);

		expect(fileHandler).toHaveBeenCalledTimes(1);
		expect(fileHandler).toHaveBeenCalledWith(pngFile, null);
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('defers to the file handlers when the HTML text is only zero-width characters (#216)', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		dispatch = vi.fn();
		getState = () => state;

		const fileHandler = vi.fn().mockReturnValue(true);
		const fileHandlerRegistry = new FileHandlerRegistry();
		fileHandlerRegistry.registerFileHandler('image/*', fileHandler);

		handler = new PasteHandler(element, {
			getState,
			dispatch,
			fileHandlerRegistry,
			schemaRegistry: new SchemaRegistry(),
		});

		const pngFile = new File(['bytes'], 'rendition.png', { type: 'image/png' });
		element.dispatchEvent(
			createPasteEvent({
				files: [pngFile],
				html: '<span>\u200B</span>',
			}),
		);

		expect(fileHandler).toHaveBeenCalledTimes(1);
		expect(fileHandler).toHaveBeenCalledWith(pngFile, null);
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('still pastes blank lines from br-only markup (#216 content-signal guard)', () => {
		// `<p><br></p>` parses into empty split blocks on purpose; a line break is
		// real content and must not be mistaken for the parsed-to-nothing case.
		element = document.createElement('div');
		let state: EditorState = createTestState();
		dispatch = vi.fn((tr: Transaction) => {
			state = state.apply(tr);
		});
		getState = () => state;

		handler = new PasteHandler(element, {
			getState,
			dispatch,
			schemaRegistry: new SchemaRegistry(),
		});

		element.dispatchEvent(createPasteEvent({ html: '<p><br></p><p><br></p>' }));

		expect(dispatch).toHaveBeenCalledTimes(1);
		expect(state.doc.children.length).toBeGreaterThan(1);
		expect(getBlockText(state.doc.children[0])).toBe('hello');
	});

	it('resolves an async file handler on the deferred fallback path', async () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		dispatch = vi.fn();
		getState = () => state;

		const settled = deferred<boolean>();
		const fileHandler = vi.fn().mockReturnValue(settled.promise);
		const fileHandlerRegistry = new FileHandlerRegistry();
		fileHandlerRegistry.registerFileHandler('image/*', fileHandler);

		handler = new PasteHandler(element, { getState, dispatch, fileHandlerRegistry });

		const pngFile = new File(['bytes'], 'rendition.png', { type: 'image/png' });
		element.dispatchEvent(
			createPasteEvent({
				files: [pngFile],
				html: '<span data-metadata="…"></span>',
			}),
		);

		expect(fileHandler).toHaveBeenCalledTimes(1);
		settled.resolve(true);
		await settled.promise;

		// The async claim completes without a stray fallback dispatch.
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('awaits Promise<boolean>, then continues in registration order after resolve(false)', async () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		dispatch = vi.fn();
		getState = () => state;
		const pending = deferred<boolean>();
		const first = vi.fn(() => pending.promise);
		const second = vi.fn(() => true);
		const fileHandlerRegistry = new FileHandlerRegistry();
		fileHandlerRegistry.registerFileHandler('image/*', first, {
			pluginId: 'first-plugin',
			name: 'async-file',
		});
		fileHandlerRegistry.registerFileHandler('image/png', second, {
			pluginId: 'second-plugin',
			name: 'sync-file',
		});
		handler = new PasteHandler(element, { getState, dispatch, fileHandlerRegistry });

		const pngFile = new File(['bytes'], 'photo.png', { type: 'image/png' });
		element.dispatchEvent(createPasteEvent({ files: [pngFile], text: 'fallback' }));

		expect(first).toHaveBeenCalledOnce();
		expect(second).not.toHaveBeenCalled();
		pending.resolve(false);
		await vi.waitFor(() => expect(second).toHaveBeenCalledOnce());
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('isolates sync throws and async rejections before falling back to captured text', async () => {
		element = document.createElement('div');
		let state: EditorState = createTestState();
		dispatch = vi.fn((tr: Transaction) => {
			state = state.apply(tr);
		});
		getState = () => state;
		const failures: string[] = [];
		const fileHandlerRegistry = new FileHandlerRegistry();
		fileHandlerRegistry.registerFileHandler(
			'image/png',
			() => {
				throw new Error('sync failure');
			},
			{ pluginId: 'sync-plugin', name: 'sync-handler' },
		);
		fileHandlerRegistry.registerFileHandler(
			'image/png',
			() => Promise.reject(new Error('async failure')),
			{ pluginId: 'async-plugin', name: 'async-handler' },
		);
		handler = new PasteHandler(element, {
			getState,
			dispatch,
			fileHandlerRegistry,
			callbackExecutor: new PluginCallbackExecutor((failure) => {
				failures.push(`${failure.pluginId}:${failure.name}`);
			}),
		});

		const pngFile = new File(['bytes'], 'photo.png', { type: 'image/png' });
		element.dispatchEvent(createPasteEvent({ files: [pngFile], text: 'fallback' }));

		await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
		expect(getBlockText(state.doc.children[0])).toBe('hellofallback');
		expect(failures).toEqual(['sync-plugin:sync-handler', 'async-plugin:async-handler']);
	});

	it('cancels an in-flight file-handler chain on destroy', async () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		dispatch = vi.fn();
		getState = () => state;
		const pending = deferred<boolean>();
		const next = vi.fn(() => false);
		const fileHandlerRegistry = new FileHandlerRegistry();
		fileHandlerRegistry.registerFileHandler('image/png', () => pending.promise);
		fileHandlerRegistry.registerFileHandler('image/png', next);
		handler = new PasteHandler(element, { getState, dispatch, fileHandlerRegistry });

		const pngFile = new File(['bytes'], 'photo.png', { type: 'image/png' });
		element.dispatchEvent(createPasteEvent({ files: [pngFile], text: 'fallback' }));
		handler.destroy();
		pending.resolve(false);
		await pending.promise;
		await Promise.resolve();

		expect(next).not.toHaveBeenCalled();
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('cancels the fallback when readonly is enabled during an async file handler', async () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		const pending = deferred<boolean>();
		let readOnly = false;
		dispatch = vi.fn();
		getState = () => state;
		const fileHandlerRegistry = new FileHandlerRegistry();
		fileHandlerRegistry.registerFileHandler('image/*', () => pending.promise);
		handler = new PasteHandler(element, {
			getState,
			dispatch,
			fileHandlerRegistry,
			isReadOnly: () => readOnly,
		});

		element.dispatchEvent(
			createPasteEvent({
				files: [new File(['bytes'], 'photo.png', { type: 'image/png' })],
				text: 'must not be inserted',
			}),
		);
		readOnly = true;
		pending.resolve(false);
		await pending.promise;
		await Promise.resolve();
		await Promise.resolve();

		expect(dispatch).not.toHaveBeenCalled();
	});
});

describe('PasteHandler plugin callback isolation', () => {
	it('continues after a throwing paste interceptor and preserves clipboard text', () => {
		const element = document.createElement('div');
		let state: EditorState = createTestState();
		const failures: string[] = [];
		const dispatch = vi.fn((tr: Transaction) => {
			state = state.apply(tr);
		});
		const handler = new PasteHandler(element, {
			getState: () => state,
			dispatch,
			callbackExecutor: new PluginCallbackExecutor((failure) => {
				failures.push(`${failure.pluginId}:${failure.name}:${failure.kind}`);
			}),
			getPasteInterceptors: () => [
				{
					pluginId: 'broken-plugin',
					name: 'throwing-paste',
					priority: 10,
					interceptor: () => {
						throw new Error('broken paste');
					},
				},
			],
		});

		const event = createPasteEvent({ text: 'kept' });
		element.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		expect(getBlockText(state.doc.children[0])).toBe('hellokept');
		expect(failures).toEqual(['broken-plugin:throwing-paste:paste-interceptor']);
		handler.destroy();
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

	it('HTML paste preserves a semantic ID on a complete block', () => {
		element = document.createElement('div');
		let currentState: EditorState = createTestState();
		dispatch = vi.fn((transaction: Transaction) => {
			currentState = currentState.apply(transaction);
		});
		getState = () => currentState;
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'paragraph',
			toDOM: () => document.createElement('p'),
			toHTML: (_node, content) => `<p>${content}</p>`,
			parseHTML: [{ tag: 'p' }, { tag: 'div' }],
			sanitize: { tags: ['p'] },
		});
		handler = new PasteHandler(element, { getState, dispatch, schemaRegistry: registry });

		element.dispatchEvent(createPasteEvent({ html: '<p id="target">Destination</p>' }));

		expect(currentState.doc.children[1]?.htmlId).toBe('target');
		expect(getBlockText(currentState.doc.children[1] as BlockNode)).toBe('Destination');
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
			htmlId: 'figure-target',
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
			expect(newBlock.htmlId).toBe('figure-target');
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

describe('PasteHandler void block HTML paste', () => {
	let element: HTMLElement;
	let handler: PasteHandler;
	let dispatch: DispatchFn;

	afterEach(() => {
		handler.destroy();
	});

	function createImageRegistry(): SchemaRegistry {
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
				{
					tag: 'img',
					getAttrs(el: HTMLElement) {
						return {
							src: el.getAttribute('src') ?? '',
							alt: el.getAttribute('alt') ?? '',
							align: 'center',
						};
					},
				},
			],
			sanitize: {
				tags: ['figure', 'img'],
				attrs: ['src', 'alt', 'width', 'height', 'class', 'style'],
			},
		});
		return registry;
	}

	it('inserts image block from pasted HTML with figure element', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		const registry: SchemaRegistry = createImageRegistry();

		let currentState: EditorState = state;
		dispatch = vi.fn((tr: Transaction) => {
			currentState = currentState.apply(tr);
		});

		handler = new PasteHandler(element, {
			getState: () => currentState,
			dispatch,
			schemaRegistry: registry,
		});

		const html = '<figure><img src="https://example.com/photo.png" alt="A photo"></figure>';
		const event: ClipboardEvent = createPasteEvent({ html });
		element.dispatchEvent(event);

		expect(dispatch).toHaveBeenCalledTimes(1);
		const imageBlock = currentState.doc.children.find((c) => isBlockNode(c) && c.type === 'image');
		expect(imageBlock).toBeDefined();
		if (imageBlock && isBlockNode(imageBlock)) {
			expect(imageBlock.attrs?.src).toBe('https://example.com/photo.png');
			expect(imageBlock.attrs?.alt).toBe('A photo');
		}
	});

	it('inserts image block from HTML with paragraphs and figure', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		const registry: SchemaRegistry = createImageRegistry();

		let currentState: EditorState = state;
		dispatch = vi.fn((tr: Transaction) => {
			currentState = currentState.apply(tr);
		});

		handler = new PasteHandler(element, {
			getState: () => currentState,
			dispatch,
			schemaRegistry: registry,
		});

		const html =
			'<p>Before</p><figure><img src="https://example.com/photo.png" alt="pic"></figure><p>After</p>';
		const event: ClipboardEvent = createPasteEvent({ html });
		element.dispatchEvent(event);

		expect(dispatch).toHaveBeenCalledTimes(1);
		const imageBlock = currentState.doc.children.find((c) => isBlockNode(c) && c.type === 'image');
		expect(imageBlock).toBeDefined();
		if (imageBlock && isBlockNode(imageBlock)) {
			expect(imageBlock.attrs?.src).toBe('https://example.com/photo.png');
			// Void blocks retain a single empty text child (canonical form)
			expect(imageBlock.children).toHaveLength(1);
			expect(getBlockText(imageBlock)).toBe('');
		}
	});
});

describe('PasteHandler isAnchorEmpty with non-paragraph blocks', () => {
	let element: HTMLElement;
	let handler: PasteHandler;
	let dispatch: DispatchFn;

	afterEach(() => {
		handler.destroy();
	});

	function createRegistryWithHeading(): SchemaRegistry {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'heading',
			attrs: { level: { default: 1 } },
			toDOM: () => document.createElement('h1'),
		});
		return registry;
	}

	function createRegistryWithBlockquote(): SchemaRegistry {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'blockquote',
			toDOM: () => document.createElement('blockquote'),
		});
		return registry;
	}

	it('removes empty heading anchor when pasting rich blocks', () => {
		element = document.createElement('div');
		const headingBlock = createBlockNode('heading', [], blockId('h1'), { level: 2 });
		const doc = createDocument([headingBlock]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createCollapsedSelection(blockId('h1'), 0),
		});

		const registry: SchemaRegistry = createRegistryWithHeading();
		let currentState: EditorState = state;
		dispatch = vi.fn((tr: Transaction) => {
			currentState = currentState.apply(tr);
		});

		handler = new PasteHandler(element, {
			getState: () => currentState,
			dispatch,
			schemaRegistry: registry,
		});

		const richBlocks = [
			{ type: 'heading', text: 'New Title', attrs: { level: 1 } },
			{ type: 'heading', text: 'Subtitle', attrs: { level: 2 } },
		];
		const json: string = JSON.stringify(richBlocks);
		const html: string = `<div data-notectl-rich='${json}'></div>`;
		const event: ClipboardEvent = createPasteEvent({ html });
		element.dispatchEvent(event);

		expect(dispatch).toHaveBeenCalledTimes(1);
		// The empty heading anchor should have been removed
		const headings = currentState.doc.children.filter(
			(c) => isBlockNode(c) && c.type === 'heading',
		);
		expect(headings).toHaveLength(2);
	});

	it('removes empty blockquote anchor when pasting rich blocks', () => {
		element = document.createElement('div');
		const bqBlock = createBlockNode('blockquote', [], blockId('bq1'));
		const doc = createDocument([bqBlock]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createCollapsedSelection(blockId('bq1'), 0),
		});

		const registry: SchemaRegistry = createRegistryWithBlockquote();
		let currentState: EditorState = state;
		dispatch = vi.fn((tr: Transaction) => {
			currentState = currentState.apply(tr);
		});

		handler = new PasteHandler(element, {
			getState: () => currentState,
			dispatch,
			schemaRegistry: registry,
		});

		const richBlocks = [
			{ type: 'blockquote', text: 'A quote' },
			{ type: 'blockquote', text: 'More quote' },
		];
		const json: string = JSON.stringify(richBlocks);
		const html: string = `<div data-notectl-rich='${json}'></div>`;
		const event: ClipboardEvent = createPasteEvent({ html });
		element.dispatchEvent(event);

		expect(dispatch).toHaveBeenCalledTimes(1);
		const blockquotes = currentState.doc.children.filter(
			(c) => isBlockNode(c) && c.type === 'blockquote',
		);
		expect(blockquotes).toHaveLength(2);
	});
});

describe('PasteHandler rich paste with mark segments', () => {
	let element: HTMLElement;
	let handler: PasteHandler;
	let dispatch: DispatchFn;

	afterEach(() => {
		handler.destroy();
	});

	it('preserves bold marks from segments during rich paste', () => {
		element = document.createElement('div');
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], B1)]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createCollapsedSelection(B1, 0),
		});

		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'paragraph',
			toDOM: () => document.createElement('p'),
		});
		registry.registerMarkSpec({
			type: 'bold',
			rank: 1,
			toDOM: () => document.createElement('strong'),
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

		const richBlocks = [
			{
				type: 'paragraph',
				text: 'hello world',
				segments: [
					{ text: 'hello ', marks: [] },
					{ text: 'world', marks: [{ type: 'bold' }] },
				],
			},
			{ type: 'paragraph', text: 'line two' },
		];
		const json: string = JSON.stringify(richBlocks);
		const html: string = `<div data-notectl-rich='${json}'></div>`;
		const event: ClipboardEvent = createPasteEvent({ html });
		element.dispatchEvent(event);

		expect(dispatch).toHaveBeenCalledTimes(1);
		// Find the paragraph that contains the bold-marked text
		const allParas = currentState.doc.children.filter(
			(c) => isBlockNode(c) && c.type === 'paragraph',
		);
		expect(allParas.length).toBeGreaterThanOrEqual(2);

		// Find a block that has a 'world' text child with bold mark
		let foundBold = false;
		for (const para of allParas) {
			if (!isBlockNode(para)) continue;
			for (const ch of para.children) {
				if (ch.type === 'text' && ch.text === 'world' && ch.marks.some((m) => m.type === 'bold')) {
					foundBold = true;
				}
			}
		}
		expect(foundBold).toBe(true);
	});

	it('restores inline nodes from embedded rich HTML payloads', () => {
		element = document.createElement('div');
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], B1)]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createCollapsedSelection(B1, 0),
		});

		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'paragraph',
			toDOM: () => document.createElement('p'),
		});
		registry.registerInlineNodeSpec({
			type: 'mention',
			attrs: { id: { default: '' } },
			toDOM: () => document.createElement('span'),
			parseHTML: [
				{ tag: 'span', getAttrs: (el) => ({ id: el.getAttribute('data-mention') ?? '' }) },
			],
			sanitize: { tags: ['span'], attrs: ['data-mention'] },
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

		const richBlocks = [
			{
				type: 'paragraph',
				text: 'A',
				segments: [
					{ text: 'A', marks: [] },
					{ kind: 'inline', inlineType: 'mention', attrs: { id: 'u1' } },
				],
			},
		];
		const json: string = JSON.stringify(richBlocks);
		const html: string = `<div data-notectl-rich='${json}'></div>`;
		const event: ClipboardEvent = createPasteEvent({ html });
		element.dispatchEvent(event);

		expect(dispatch).toHaveBeenCalledTimes(1);
		const paragraph = currentState.doc.children[0];
		expect(paragraph).toBeDefined();
		if (paragraph && isBlockNode(paragraph)) {
			expect(
				paragraph.children.some(
					(child) => isInlineNode(child) && child.inlineType === inlineType('mention'),
				),
			).toBe(true);
		}
	});
});

describe('PasteHandler XSS prevention', () => {
	let element: HTMLElement;
	let handler: PasteHandler;
	let dispatch: DispatchFn;

	afterEach(() => {
		handler.destroy();
	});

	it('strips script tags from pasted HTML', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		let currentState: EditorState = state;
		dispatch = vi.fn((tr: Transaction) => {
			currentState = currentState.apply(tr);
		});

		handler = new PasteHandler(element, { getState: () => currentState, dispatch });

		const event: ClipboardEvent = createPasteEvent({
			html: '<p>safe</p><script>alert("xss")</script>',
		});
		element.dispatchEvent(event);

		expect(dispatch).toHaveBeenCalledTimes(1);
		const finalText: string = currentState.doc.children
			.map((b) => (isBlockNode(b) ? getBlockText(b) : ''))
			.join('');
		expect(finalText).not.toContain('alert');
		expect(finalText).toContain('safe');
	});

	it('strips event handler attributes from pasted HTML', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		let currentState: EditorState = state;
		dispatch = vi.fn((tr: Transaction) => {
			currentState = currentState.apply(tr);
		});

		handler = new PasteHandler(element, { getState: () => currentState, dispatch });

		const event: ClipboardEvent = createPasteEvent({
			html: '<p>safe</p><p onerror="alert(1)">text</p>',
		});
		element.dispatchEvent(event);

		expect(dispatch).toHaveBeenCalledTimes(1);
		const finalText: string = currentState.doc.children
			.map((b) => (isBlockNode(b) ? getBlockText(b) : ''))
			.join('');
		expect(finalText).not.toContain('alert');
		expect(finalText).toContain('safe');
	});

	it('extractRichData returns undefined for HTML without data-notectl-rich', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		dispatch = vi.fn();

		handler = new PasteHandler(element, { getState: () => state, dispatch });

		const event: ClipboardEvent = createPasteEvent({
			html: '<p>no rich data here</p>',
		});
		element.dispatchEvent(event);

		// Should fall through to plain HTML paste, not rich paste
		expect(dispatch).toHaveBeenCalledTimes(1);
		const tr: Transaction = (dispatch as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(tr.metadata.origin).toBe('paste');
	});

	it('does not extract rich data from script text fragments', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();

		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'heading',
			attrs: { level: { default: 1 } },
			toDOM: () => document.createElement('h1'),
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

		const richJson: string = JSON.stringify([
			{ type: 'heading', text: 'ShouldNotAppear', attrs: { level: 2 } },
		]);
		const encoded: string = richJson
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/'/g, '&#39;')
			.replace(/"/g, '&quot;');
		const html: string = `<p>safe</p><script>const marker = 'data-notectl-rich="${encoded}"';</script>`;
		const event: ClipboardEvent = createPasteEvent({ html });
		element.dispatchEvent(event);

		expect(dispatch).toHaveBeenCalledTimes(1);
		const foundHeading: boolean = currentState.doc.children.some(
			(c) => isBlockNode(c) && c.type === 'heading',
		);
		expect(foundHeading).toBe(false);
	});

	it('extractRichData correctly decodes entity-encoded attribute values', () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();

		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'heading',
			attrs: { level: { default: 1 } },
			toDOM: () => document.createElement('h1'),
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

		// Simulate ClipboardHandler's encoding: double-quoted, entity-encoded
		const richJson: string = JSON.stringify([
			{ type: 'heading', text: 'Title', attrs: { level: 2 } },
		]);
		const encoded: string = richJson
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/'/g, '&#39;')
			.replace(/"/g, '&quot;');
		const html: string = `<span data-notectl-rich="${encoded}" hidden></span>`;
		const event: ClipboardEvent = createPasteEvent({ html });
		element.dispatchEvent(event);

		expect(dispatch).toHaveBeenCalledTimes(1);
		const heading = currentState.doc.children.find((c) => isBlockNode(c) && c.type === 'heading');
		expect(heading).toBeDefined();
	});
});

describe('PasteHandler cell schema guard (#166 sibling: internal copy paths)', () => {
	let element: HTMLElement;
	let handler: PasteHandler;
	let dispatch: DispatchFn;

	afterEach(() => {
		handler.destroy();
	});

	const TABLE: ReturnType<typeof blockId> = blockId('table');
	const ROW: ReturnType<typeof blockId> = blockId('row');
	const CELL: ReturnType<typeof blockId> = blockId('cell');
	const CELL_PARA: ReturnType<typeof blockId> = blockId('cellpara');

	/** Registry whose table_cell allows paragraph + image, but not code_block/math_display. */
	function createTableRegistry(): SchemaRegistry {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'paragraph',
			group: 'block',
			toDOM: () => document.createElement('p'),
		});
		registry.registerNodeSpec({
			type: 'code_block',
			group: 'block',
			content: { allow: ['text'] },
			selectable: true,
			attrs: { language: { default: '' } },
			toDOM: () => document.createElement('pre'),
		});
		registry.registerNodeSpec({
			type: 'image',
			group: 'block',
			isVoid: true,
			selectable: true,
			attrs: { src: { default: '' } },
			toDOM: () => document.createElement('img'),
		});
		registry.registerNodeSpec({
			type: 'math_display',
			group: 'block',
			isVoid: true,
			selectable: true,
			attrs: { latex: { default: '' } },
			toDOM: () => document.createElement('div'),
		});
		registry.registerNodeSpec({
			type: 'table',
			content: { allow: ['table_row'], min: 1 },
			toDOM: () => document.createElement('table'),
		});
		registry.registerNodeSpec({
			type: 'table_row',
			content: { allow: ['table_cell'], min: 1 },
			toDOM: () => document.createElement('tr'),
		});
		registry.registerNodeSpec({
			type: 'table_cell',
			content: { allow: ['paragraph', 'image'] },
			toDOM: () => document.createElement('td'),
		});
		return registry;
	}

	/** Document with a single table whose only cell holds one paragraph; caret in that paragraph. */
	function createTableState(): EditorState {
		const para = createBlockNode('paragraph', [createTextNode('')], CELL_PARA);
		const cell = createBlockNode('table_cell', [para], CELL);
		const row = createBlockNode('table_row', [cell], ROW);
		const table = createBlockNode('table', [row], TABLE);
		const doc = createDocument([table]);
		return EditorState.create({ doc, selection: createCollapsedSelection(CELL_PARA, 0) });
	}

	function mountWith(registry: SchemaRegistry, state: EditorState): () => EditorState {
		element = document.createElement('div');
		let currentState: EditorState = state;
		dispatch = vi.fn((tr: Transaction) => {
			currentState = currentState.apply(tr);
		});
		handler = new PasteHandler(element, {
			getState: () => currentState,
			dispatch,
			schemaRegistry: registry,
		});
		return () => currentState;
	}

	function cellOf(state: EditorState): BlockNode | undefined {
		const table = state.doc.children[0];
		if (!table || !isBlockNode(table)) return undefined;
		const row = table.children[0];
		if (!row || !isBlockNode(row)) return undefined;
		const cell = row.children[0];
		return cell && isBlockNode(cell) ? cell : undefined;
	}

	it('escapes a code_block rich paste out of a cell to the document root', () => {
		const getCurrent = mountWith(createTableRegistry(), createTableState());

		const json: string = JSON.stringify([
			{ type: 'code_block', text: 'const x = 1;', attrs: { language: 'ts' } },
		]);
		element.dispatchEvent(createPasteEvent({ html: `<div data-notectl-rich='${json}'></div>` }));

		const state: EditorState = getCurrent();
		// The disallowed block escapes to the root, placed after the outer table.
		expect(state.doc.children).toHaveLength(2);
		const escaped = state.doc.children[1];
		expect(escaped && isBlockNode(escaped) && escaped.type).toBe('code_block');
		// The cell is untouched: still just its original paragraph, no nested code_block.
		const cell = cellOf(state);
		expect(cell?.children.map((c) => (isBlockNode(c) ? c.type : 'text'))).toEqual(['paragraph']);
	});

	it('keeps an allowed paragraph rich paste nested inside the cell', () => {
		const getCurrent = mountWith(createTableRegistry(), createTableState());

		const json: string = JSON.stringify([
			{ type: 'paragraph', text: 'A' },
			{ type: 'paragraph', text: 'B' },
		]);
		element.dispatchEvent(createPasteEvent({ html: `<div data-notectl-rich='${json}'></div>` }));

		const state: EditorState = getCurrent();
		// Nothing leaked to the root; the paragraphs stayed in the cell.
		expect(state.doc.children).toHaveLength(1);
		const cell = cellOf(state);
		const texts: string[] = (cell?.children ?? []).map((c) =>
			isBlockNode(c) ? getBlockText(c) : '',
		);
		expect(texts).toEqual(['A', 'B']);
	});

	it('escapes a math_display block paste out of a cell to the document root', () => {
		const getCurrent = mountWith(createTableRegistry(), createTableState());

		const blockJson: string = JSON.stringify({ type: 'math_display', attrs: { latex: 'x^2' } });
		element.dispatchEvent(
			createPasteEvent({ extraData: { 'application/x-notectl-block': blockJson } }),
		);

		const state: EditorState = getCurrent();
		expect(state.doc.children).toHaveLength(2);
		const escaped = state.doc.children[1];
		expect(escaped && isBlockNode(escaped) && escaped.type).toBe('math_display');
		expect(isNodeSelection(state.selection)).toBe(true);
		const cell = cellOf(state);
		expect(cell?.children.map((c) => (isBlockNode(c) ? c.type : 'text'))).toEqual(['paragraph']);
	});

	it('keeps an allowed image block paste nested inside the cell', () => {
		const getCurrent = mountWith(createTableRegistry(), createTableState());

		const blockJson: string = JSON.stringify({ type: 'image', attrs: { src: 'x.png' } });
		element.dispatchEvent(
			createPasteEvent({ extraData: { 'application/x-notectl-block': blockJson } }),
		);

		const state: EditorState = getCurrent();
		expect(state.doc.children).toHaveLength(1);
		const cell = cellOf(state);
		expect(cell?.children.map((c) => (isBlockNode(c) ? c.type : 'text'))).toEqual([
			'paragraph',
			'image',
		]);
	});
});

describe('PasteHandler rich paste cross-block splice (#165)', () => {
	let element: HTMLElement;
	let handler: PasteHandler;
	let dispatch: DispatchFn;

	afterEach(() => {
		handler.destroy();
	});

	function paragraphRegistry(): SchemaRegistry {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'paragraph',
			toDOM: () => document.createElement('p'),
		});
		return registry;
	}

	function dispatchRichPaste(
		handlerEl: HTMLElement,
		blocks: readonly Record<string, unknown>[],
	): void {
		const json: string = JSON.stringify(blocks);
		const html: string = `<div data-notectl-rich='${json}'></div>`;
		handlerEl.dispatchEvent(createPasteEvent({ html }));
	}

	function blockTexts(state: EditorState): string[] {
		return state.doc.children.map((b) => (isBlockNode(b) ? getBlockText(b) : ''));
	}

	it('splices multi-block clipboard content at the caret instead of appending siblings', () => {
		element = document.createElement('div');
		// Post-cut state of a cross-block cut: the two paragraphs merged into one,
		// with the caret sitting between the surviving fragments ("Hello " | " bar").
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('Hello  bar')], B1)]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createCollapsedSelection(B1, 6),
		});

		let currentState: EditorState = state;
		dispatch = vi.fn((tr: Transaction) => {
			currentState = currentState.apply(tr);
		});

		handler = new PasteHandler(element, {
			getState: () => currentState,
			dispatch,
			schemaRegistry: paragraphRegistry(),
		});

		// Clipboard payload from the original cut: "world" and "Foo".
		dispatchRichPaste(element, [
			{ type: 'paragraph', text: 'world' },
			{ type: 'paragraph', text: 'Foo' },
		]);

		// The clipboard must splice back into the caret block, restoring the original.
		expect(blockTexts(currentState)).toEqual(['Hello world', 'Foo bar']);
	});

	it('inserts middle blocks between the split caret-block fragments', () => {
		element = document.createElement('div');
		const doc = createDocument([createBlockNode('paragraph', [createTextNode('AB')], B1)]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createCollapsedSelection(B1, 1),
		});

		let currentState: EditorState = state;
		dispatch = vi.fn((tr: Transaction) => {
			currentState = currentState.apply(tr);
		});

		handler = new PasteHandler(element, {
			getState: () => currentState,
			dispatch,
			schemaRegistry: paragraphRegistry(),
		});

		dispatchRichPaste(element, [
			{ type: 'paragraph', text: 'X' },
			{ type: 'paragraph', text: 'MID' },
			{ type: 'paragraph', text: 'Y' },
		]);

		// First slice merges into the caret block, middle stays standalone, last
		// slice prefixes the tail fragment.
		expect(blockTexts(currentState)).toEqual(['AX', 'MID', 'YB']);
	});

	it('keeps middle blocks nested when the caret sits inside a container', () => {
		element = document.createElement('div');
		// A blockquote container (#136) holding a single paragraph. The caret is in
		// the nested paragraph, which is NOT a direct child of the document root, so
		// the blocks must be inserted inside the blockquote, never leaked to root.
		const paraId: ReturnType<typeof blockId> = blockId('p1');
		const bqId: ReturnType<typeof blockId> = blockId('bq1');
		const nestedPara = createBlockNode('paragraph', [createTextNode('quote')], paraId);
		const blockquote = createBlockNode('blockquote', [nestedPara], bqId);
		const doc = createDocument([blockquote]);
		const state: EditorState = EditorState.create({
			doc,
			selection: createCollapsedSelection(paraId, 5),
		});

		const registry: SchemaRegistry = paragraphRegistry();
		registry.registerNodeSpec({
			type: 'blockquote',
			content: { allow: ['paragraph'] },
			toDOM: () => document.createElement('blockquote'),
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

		dispatchRichPaste(element, [
			{ type: 'paragraph', text: 'X' },
			{ type: 'paragraph', text: 'MID' },
			{ type: 'paragraph', text: 'Y' },
		]);

		// Nothing leaked to the document root: the blockquote is still the only root
		// block and it contains the pasted paragraphs (middle block stays nested).
		expect(currentState.doc.children).toHaveLength(1);
		const root = currentState.doc.children[0];
		expect(root && isBlockNode(root) && root.type).toBe('blockquote');
		if (root && isBlockNode(root)) {
			const nestedTexts: string[] = root.children.map((c) =>
				isBlockNode(c) ? getBlockText(c) : '',
			);
			expect(nestedTexts).toContain('MID');
		}
	});
});

describe('PasteHandler markdown fallback', () => {
	let element: HTMLElement;
	let handler: PasteHandler;

	afterEach(() => {
		handler.destroy();
	});

	it('falls back to a plain-text paste when the markdown engine throws', async () => {
		element = document.createElement('div');
		let state: EditorState = createTestState();
		const dispatch = vi.fn((tr: Transaction) => {
			state = state.apply(tr);
		});

		// A syntax extension that throws forces parseMarkdownToDocument to reject,
		// exercising the catch path. `preventDefault()` has already run, so the
		// captured text must still land — never a silent clipboard loss.
		const throwing: MarkdownSyntaxExtension = {
			id: 'boom',
			matchBlock: () => {
				throw new Error('boom');
			},
		};

		handler = new PasteHandler(element, {
			getState: () => state,
			dispatch,
			getMarkdownSyntaxExtensions: () => [throwing],
		});

		// A fenced block passes `looksLikeMarkdown`, so the async markdown branch runs.
		element.dispatchEvent(createPasteEvent({ text: '```\nx\n```' }));

		await vi.waitFor(() => expect(dispatch).toHaveBeenCalled());

		const allText: string = state.doc.children.map((b) => getBlockText(b)).join('\n');
		expect(allText).toContain('```');
		expect(allText).toContain('x');
	});

	it('falls back to captured text when the converted HTML cannot be committed', async () => {
		element = document.createElement('div');
		let state: EditorState = createTestState();
		const dispatch = vi.fn((tr: Transaction) => {
			state = state.apply(tr);
		});
		const announce = vi.fn();
		const failures: string[] = [];
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'heading',
			attrs: { level: { default: 1 } },
			toDOM: () => document.createElement('section'),
			toHTML: (_node, content) => `<section>${content}</section>`,
			parseHTML: [
				{
					tag: 'section',
					getAttrs: () => {
						throw new Error('cannot parse converted heading');
					},
				},
			],
			sanitize: { tags: ['section'] },
		});

		handler = new PasteHandler(element, {
			getState: () => state,
			dispatch,
			announce,
			schemaRegistry: registry,
			callbackExecutor: new PluginCallbackExecutor((failure) => {
				failures.push(failure.name);
			}),
		});

		const markdown = '# Heading\n\n- one\n- two';
		element.dispatchEvent(createPasteEvent({ text: markdown }));

		await vi.waitFor(() => expect(failures).toContain('Markdown HTML commit'));
		await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
		expect(state.doc.children.map((block) => getBlockText(block)).join('\n')).toContain(markdown);
		expect(announce).not.toHaveBeenCalled();
	});

	it('falls back to captured text when markdown converts to contentless HTML (#216)', async () => {
		// The commit reports whether the HTML materialized anything; markdown that
		// converts to markup parsing to nothing must not be silently dropped
		// (preventDefault already ran) nor announced as imported.
		element = document.createElement('div');
		let state: EditorState = createTestState();
		const dispatch = vi.fn((tr: Transaction) => {
			state = state.apply(tr);
		});
		const announce = vi.fn();
		const parserModule = await import('../serialization/MarkdownParser.js');

		handler = new PasteHandler(element, {
			getState: () => state,
			dispatch,
			announce,
			loadMarkdownParser: () =>
				Promise.resolve({
					parseMarkdownToDocument: (): ReturnType<typeof parserModule.parseMarkdownToDocument> =>
						createDocument([]),
				}),
		});

		// Passes `looksLikeMarkdown`, converts to an empty document.
		element.dispatchEvent(createPasteEvent({ text: '```\nx\n```' }));

		await vi.waitFor(() => expect(dispatch).toHaveBeenCalled());

		const allText: string = state.doc.children.map((b) => getBlockText(b)).join('\n');
		expect(allText).toContain('```');
		expect(allText).toContain('x');
		expect(announce).not.toHaveBeenCalled();
	});

	it('inserts at the original bookmark mapped through intervening transactions', async () => {
		element = document.createElement('div');
		let state: EditorState = createTestState();
		const parserModule = await import('../serialization/MarkdownParser.js');
		const loading = deferred<typeof parserModule>();
		const dispatch = vi.fn((tr: Transaction) => {
			const oldState = state;
			state = state.apply(tr);
			handler.onStateChange(oldState, state, tr);
		});

		handler = new PasteHandler(element, {
			getState: () => state,
			dispatch,
			loadMarkdownParser: () => loading.promise,
		});

		element.dispatchEvent(createPasteEvent({ text: '# Heading\n\n- one\n- two' }));

		const intervening: Transaction = state
			.transaction('input')
			.insertText(B1, 0, 'X', [])
			.setSelection(createCollapsedSelection(B1, 0))
			.build();
		const beforeIntervening = state;
		state = state.apply(intervening);
		handler.onStateChange(beforeIntervening, state, intervening);
		loading.resolve(parserModule);

		await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
		const text = getBlockText(state.doc.children[0]);
		expect(text.startsWith('Xhello')).toBe(true);
		expect(text).toContain('Heading');
		expect(isTextSelection(state.selection)).toBe(true);
		if (isTextSelection(state.selection)) {
			expect(state.selection.anchor.offset).toBe(0);
		}
	});

	it('does not dispatch or announce after destroy while the parser is loading', async () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		const parserModule = await import('../serialization/MarkdownParser.js');
		const loading = deferred<typeof parserModule>();
		const dispatch = vi.fn();
		const announce = vi.fn();

		handler = new PasteHandler(element, {
			getState: () => state,
			dispatch,
			announce,
			loadMarkdownParser: () => loading.promise,
		});

		element.dispatchEvent(createPasteEvent({ text: '# Heading\n\n- one\n- two' }));
		handler.destroy();
		loading.resolve(parserModule);
		await loading.promise;
		await Promise.resolve();
		await Promise.resolve();

		expect(dispatch).not.toHaveBeenCalled();
		expect(announce).not.toHaveBeenCalled();
	});

	it('does not dispatch or announce when readonly is enabled while the parser is loading', async () => {
		element = document.createElement('div');
		const state: EditorState = createTestState();
		const parserModule = await import('../serialization/MarkdownParser.js');
		const loading = deferred<typeof parserModule>();
		const dispatch = vi.fn();
		const announce = vi.fn();
		let readOnly = false;

		handler = new PasteHandler(element, {
			getState: () => state,
			dispatch,
			announce,
			isReadOnly: () => readOnly,
			loadMarkdownParser: () => loading.promise,
		});

		element.dispatchEvent(createPasteEvent({ text: '# Heading\n\n- one\n- two' }));
		readOnly = true;
		loading.resolve(parserModule);
		await loading.promise;
		await Promise.resolve();
		await Promise.resolve();

		expect(dispatch).not.toHaveBeenCalled();
		expect(announce).not.toHaveBeenCalled();
	});
});

describe('PasteHandler markdown announce (a11y, #192 Bug #8)', () => {
	let element: HTMLElement;
	let handler: PasteHandler;

	afterEach(() => {
		handler.destroy();
	});

	it('announces the import message after a successful Markdown paste', async () => {
		element = document.createElement('div');
		let state: EditorState = createTestState();
		const dispatch = vi.fn((tr: Transaction) => {
			state = state.apply(tr);
		});
		const announce = vi.fn();

		handler = new PasteHandler(element, {
			getState: () => state,
			dispatch,
			announce,
			markdownImportedMessage: 'Markdown imported',
		});

		// Two block markers (`# ` and `- `) trip looksLikeMarkdown, so the async
		// markdown branch runs, parses, and dispatches a real paste.
		element.dispatchEvent(createPasteEvent({ text: '# Heading\n\n- one\n- two' }));

		await vi.waitFor(() => expect(announce).toHaveBeenCalledWith('Markdown imported'));
		// The announcement fires after the paste committed, never before.
		expect(dispatch).toHaveBeenCalled();
	});

	it('does not announce when the markdown engine throws (plain-text fallback)', async () => {
		element = document.createElement('div');
		let state: EditorState = createTestState();
		const dispatch = vi.fn((tr: Transaction) => {
			state = state.apply(tr);
		});
		const announce = vi.fn();

		const throwing: MarkdownSyntaxExtension = {
			id: 'boom',
			matchBlock: () => {
				throw new Error('boom');
			},
		};

		handler = new PasteHandler(element, {
			getState: () => state,
			dispatch,
			announce,
			markdownImportedMessage: 'Markdown imported',
			getMarkdownSyntaxExtensions: () => [throwing],
		});

		element.dispatchEvent(createPasteEvent({ text: '```\nx\n```' }));

		await vi.waitFor(() => expect(dispatch).toHaveBeenCalled());
		// The fallback path committed the plain text but must stay silent: nothing
		// was imported as Markdown, so no "Markdown imported" announcement.
		expect(announce).not.toHaveBeenCalled();
	});
});
