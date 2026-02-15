import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBlockNode, createDocument, createTextNode } from '../model/Document.js';
import type { NodeSpec } from '../model/NodeSpec.js';
import { SchemaRegistry } from '../model/SchemaRegistry.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	createSelection,
} from '../model/Selection.js';
import { blockId, nodeType } from '../model/TypeBrands.js';
import type { BlockId } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { ClipboardHandler } from './ClipboardHandler.js';
import type { DispatchFn, GetStateFn } from './InputHandler.js';

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
		handler.destroy();
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
});

describe('ClipboardHandler cut', () => {
	let element: HTMLElement;
	let handler: ClipboardHandler;
	let dispatch: DispatchFn;

	afterEach(() => {
		handler.destroy();
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
