import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBlockNode, createDocument, createTextNode, getBlockText } from '../model/Document.js';
import { createCollapsedSelection, createSelection } from '../model/Selection.js';
import { blockId, nodeType } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { CompositionTracker } from './CompositionTracker.js';
import { InputHandler } from './InputHandler.js';

const B1 = blockId('b1');

function createBeforeInputEvent(inputType: string, data?: string): InputEvent {
	const event = new InputEvent('beforeinput', {
		bubbles: true,
		cancelable: true,
		data: data ?? null,
	});
	Object.defineProperty(event, 'inputType', { value: inputType });
	return event;
}

function createCompositionEvent(type: 'compositionstart' | 'compositionend', data?: string): CompositionEvent {
	const event = new CompositionEvent(type, {
		bubbles: true,
		cancelable: true,
		data: data ?? '',
	});
	Object.defineProperty(event, 'data', { value: data ?? '' });
	return event;
}

function createState(options?: {
	text?: string;
	selection?: ReturnType<typeof createCollapsedSelection> | ReturnType<typeof createSelection>;
}): EditorState {
	const text = options?.text ?? 'hello';
	return EditorState.create({
		doc: createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode(text)], B1),
		]),
		selection: options?.selection ?? createCollapsedSelection(B1, text.length),
	});
}

describe('InputHandler', () => {
	let element: HTMLDivElement;
	let handler: InputHandler;

	afterEach(() => {
		handler?.destroy();
	});

	it('handles insertReplacementText as a state transaction', () => {
		element = document.createElement('div');
		let state = createState({
			selection: createSelection({ blockId: B1, offset: 1 }, { blockId: B1, offset: 3 }),
		});
		const dispatch = vi.fn((tr: Transaction) => {
			state = state.apply(tr);
		});
		const syncSelection = vi.fn();

		handler = new InputHandler(element, {
			getState: () => state,
			dispatch,
			syncSelection,
		});

		const event = createBeforeInputEvent('insertReplacementText', 'X');
		element.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		expect(syncSelection).toHaveBeenCalledOnce();
		expect(dispatch).toHaveBeenCalledOnce();
		expect(getBlockText(state.doc.children[0])).toBe('hXlo');
	});

	it('does not swallow unsupported beforeinput types', () => {
		element = document.createElement('div');
		const state = createState();
		const dispatch = vi.fn();
		const syncSelection = vi.fn();

		handler = new InputHandler(element, {
			getState: () => state,
			dispatch,
			syncSelection,
		});

		const event = createBeforeInputEvent('insertTranspose');
		element.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(false);
		expect(syncSelection).not.toHaveBeenCalled();
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('prevents deleteByCut without issuing an extra deletion transaction', () => {
		element = document.createElement('div');
		let state = createState({
			selection: createSelection({ blockId: B1, offset: 1 }, { blockId: B1, offset: 3 }),
		});
		const dispatch = vi.fn((tr: Transaction) => {
			state = state.apply(tr);
		});

		handler = new InputHandler(element, {
			getState: () => state,
			dispatch,
			syncSelection: vi.fn(),
		});

		const event = createBeforeInputEvent('deleteByCut');
		element.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		expect(dispatch).not.toHaveBeenCalled();
		expect(getBlockText(state.doc.children[0])).toBe('hello');
	});

	it('handles insertFromComposition once and skips the compositionend fallback', () => {
		element = document.createElement('div');
		let state = createState({ text: '' });
		const tracker = new CompositionTracker();
		const dispatch = vi.fn((tr: Transaction) => {
			state = state.apply(tr);
		});

		handler = new InputHandler(element, {
			getState: () => state,
			dispatch,
			syncSelection: vi.fn(),
			compositionTracker: tracker,
		});

		element.dispatchEvent(createCompositionEvent('compositionstart'));
		const beforeInput = createBeforeInputEvent('insertFromComposition', 'ä');
		element.dispatchEvent(beforeInput);
		element.dispatchEvent(createCompositionEvent('compositionend', 'ä'));

		expect(beforeInput.defaultPrevented).toBe(true);
		expect(dispatch).toHaveBeenCalledOnce();
		expect(getBlockText(state.doc.children[0])).toBe('ä');
	});

	it('falls back to compositionend data when no insertFromComposition event fires', () => {
		element = document.createElement('div');
		let state = createState({ text: '' });
		const tracker = new CompositionTracker();
		const dispatch = vi.fn((tr: Transaction) => {
			state = state.apply(tr);
		});

		handler = new InputHandler(element, {
			getState: () => state,
			dispatch,
			syncSelection: vi.fn(),
			compositionTracker: tracker,
		});

		element.dispatchEvent(createCompositionEvent('compositionstart'));
		element.dispatchEvent(createCompositionEvent('compositionend', 'ä'));

		expect(dispatch).toHaveBeenCalledOnce();
		expect(getBlockText(state.doc.children[0])).toBe('ä');
	});
});
