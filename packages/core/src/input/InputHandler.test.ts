import { type Mock, afterEach, describe, expect, it, vi } from 'vitest';
import { getBlockOffsetText } from '../model/BlockOffsetText.js';
import {
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
	getBlockText,
	getInlineChildren,
} from '../model/Document.js';
import { InputRuleRegistry } from '../model/InputRuleRegistry.js';
import { PluginCallbackExecutor } from '../model/PluginCallbackExecutor.js';
import {
	type EditorSelection,
	createCollapsedSelection,
	createNodeSelection,
	createSelection,
} from '../model/Selection.js';
import type { TextInputInterceptorEntry } from '../model/TextInputInterceptor.js';
import { blockId, inlineType, markType, nodeType } from '../model/TypeBrands.js';
import { createMarkInputRule } from '../plugins/shared/MarkInputRule.js';
import { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { domRangeToState } from '../view/SelectionSync.js';
import { CompositionTracker } from './CompositionTracker.js';
import { InputHandler } from './InputHandler.js';

const B1 = blockId('b1');

interface BeforeInputInit {
	readonly isComposing?: boolean;
	readonly cancelable?: boolean;
}

function createBeforeInputEvent(
	inputType: string,
	data?: string,
	init?: BeforeInputInit,
): InputEvent {
	const event = new InputEvent('beforeinput', {
		bubbles: true,
		cancelable: init?.cancelable ?? true,
		data: data ?? null,
		isComposing: init?.isComposing ?? false,
	});
	Object.defineProperty(event, 'inputType', { value: inputType });
	return event;
}

function createCompositionEvent(
	type: 'compositionstart' | 'compositionend',
	data?: string,
): CompositionEvent {
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
	selection?: EditorSelection;
}): EditorState {
	const text = options?.text ?? 'hello';
	return EditorState.create({
		doc: createDocument([createBlockNode(nodeType('paragraph'), [createTextNode(text)], B1)]),
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

	// Native spellcheck/autocorrect (#218): Chromium and WebKit deliver the
	// replacement string on `dataTransfer` (data === null), and the replaced
	// word arrives as a static target range — the selection may stay collapsed.
	describe('native spellcheck replacement (#218)', () => {
		function createReplacementEvent(options: {
			data?: string;
			dataTransferText?: string;
			targetRange?: StaticRange;
		}): InputEvent {
			const event = createBeforeInputEvent('insertReplacementText', options.data);
			if (options.dataTransferText !== undefined) {
				const dataTransfer: Pick<DataTransfer, 'getData'> = {
					getData: (type: string): string =>
						type === 'text/plain' ? (options.dataTransferText ?? '') : '',
				};
				Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
			}
			if (options.targetRange) {
				Object.defineProperty(event, 'getTargetRanges', {
					value: (): StaticRange[] => (options.targetRange ? [options.targetRange] : []),
				});
			}
			return event;
		}

		it('applies the replacement delivered via dataTransfer when data is null', () => {
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

			const event = createReplacementEvent({ dataTransferText: 'XY' });
			element.dispatchEvent(event);

			expect(event.defaultPrevented).toBe(true);
			expect(dispatch).toHaveBeenCalledOnce();
			expect(getBlockText(state.doc.children[0])).toBe('hXYlo');
		});

		it('replaces the browser-reported target range when the caret is collapsed', () => {
			element = document.createElement('div');
			// Caret collapsed at the end of "hello" — the autocorrect shape where
			// nothing is selected while the word to replace sits behind the caret.
			let state = createState();
			const dispatch = vi.fn((tr: Transaction) => {
				state = state.apply(tr);
			});
			const targetRange = {} as StaticRange;
			const wordSelection = createSelection({ blockId: B1, offset: 1 }, { blockId: B1, offset: 3 });
			const resolveTargetRange = vi.fn().mockReturnValue(wordSelection);

			handler = new InputHandler(element, {
				getState: () => state,
				dispatch,
				syncSelection: vi.fn(),
				resolveTargetRange,
			});

			const event = createReplacementEvent({ dataTransferText: 'XY', targetRange });
			element.dispatchEvent(event);

			expect(resolveTargetRange).toHaveBeenCalledWith(targetRange);
			expect(getBlockText(state.doc.children[0])).toBe('hXYlo');
			expect(state.selection.anchor).toEqual(expect.objectContaining({ blockId: B1, offset: 3 }));
		});

		it('captures the target range before selection sync can redraw its DOM nodes', () => {
			element = document.createElement('div');
			const block = document.createElement('p');
			block.setAttribute('data-block-id', B1);
			const textNode = document.createTextNode('hello');
			block.appendChild(textNode);
			element.appendChild(block);

			let state = createState();
			const dispatch = vi.fn((tr: Transaction) => {
				state = state.apply(tr);
			});
			const targetRange: StaticRange = {
				startContainer: textNode,
				startOffset: 1,
				endContainer: textNode,
				endOffset: 3,
				collapsed: false,
			};
			const resolveTargetRange = vi.fn((range: StaticRange) => domRangeToState(element, range));
			const syncSelection = vi.fn(() => {
				// Selection-dependent decorations may replace inline DOM while the
				// state selection is synchronized. StaticRange is not live, so its
				// endpoints remain attached to the removed text node.
				textNode.replaceWith(document.createTextNode('hello'));
			});

			handler = new InputHandler(element, {
				getState: () => state,
				dispatch,
				syncSelection,
				resolveTargetRange,
			});

			element.dispatchEvent(createReplacementEvent({ dataTransferText: 'XY', targetRange }));

			expect(resolveTargetRange).toHaveBeenCalledWith(targetRange);
			expect(getBlockText(state.doc.children[0])).toBe('hXYlo');
		});

		it('falls back to the current selection when the target range cannot be resolved', () => {
			element = document.createElement('div');
			let state = createState({
				selection: createSelection({ blockId: B1, offset: 1 }, { blockId: B1, offset: 3 }),
			});
			const dispatch = vi.fn((tr: Transaction) => {
				state = state.apply(tr);
			});
			const resolveTargetRange = vi.fn().mockReturnValue(null);

			handler = new InputHandler(element, {
				getState: () => state,
				dispatch,
				syncSelection: vi.fn(),
				resolveTargetRange,
			});

			const event = createReplacementEvent({ data: 'X', targetRange: {} as StaticRange });
			element.dispatchEvent(event);

			expect(getBlockText(state.doc.children[0])).toBe('hXlo');
		});

		it('degrades to a no-op when the reported range is unresolvable at a collapsed caret', () => {
			// Inserting at the collapsed caret would duplicate the correction next
			// to the typo ("helohello"); swallowing the prevented event is the only
			// safe degraded mode.
			element = document.createElement('div');
			let state = createState();
			const dispatch = vi.fn((tr: Transaction) => {
				state = state.apply(tr);
			});
			const resolveTargetRange = vi.fn().mockReturnValue(null);

			handler = new InputHandler(element, {
				getState: () => state,
				dispatch,
				syncSelection: vi.fn(),
				resolveTargetRange,
			});

			const event = createReplacementEvent({
				dataTransferText: 'hello',
				targetRange: {} as StaticRange,
			});
			element.dispatchEvent(event);

			expect(event.defaultPrevented).toBe(true);
			expect(dispatch).not.toHaveBeenCalled();
			expect(getBlockText(state.doc.children[0])).toBe('hello');
		});

		it('does not apply an unmappable replacement to a stale non-text selection', () => {
			// A native replacement always targets editable text. If its reported
			// range cannot be mapped while the model still holds a NodeSelection,
			// applying at that stale selection would insert a paragraph after the
			// selected node instead of correcting the browser-targeted word.
			element = document.createElement('div');
			let state = createState({ selection: createNodeSelection(B1, [B1]) });
			const dispatch = vi.fn((tr: Transaction) => {
				state = state.apply(tr);
			});
			const resolveTargetRange = vi.fn().mockReturnValue(null);

			handler = new InputHandler(element, {
				getState: () => state,
				dispatch,
				syncSelection: vi.fn(),
				resolveTargetRange,
			});

			const event = createReplacementEvent({
				dataTransferText: 'hello',
				targetRange: {} as StaticRange,
			});
			element.dispatchEvent(event);

			expect(event.defaultPrevented).toBe(true);
			expect(dispatch).not.toHaveBeenCalled();
			expect(state.doc.children).toHaveLength(1);
			expect(getBlockText(state.doc.children[0])).toBe('hello');
		});

		it('swallows a replacement that arrives during an active composition', () => {
			// A replacement applied against uncommitted IME text would corrupt the
			// model; the prevented event is dropped instead.
			element = document.createElement('div');
			let state = createState();
			const dispatch = vi.fn((tr: Transaction) => {
				state = state.apply(tr);
			});
			const compositionTracker = new CompositionTracker();
			compositionTracker.start(B1);

			handler = new InputHandler(element, {
				getState: () => state,
				dispatch,
				syncSelection: vi.fn(),
				compositionTracker,
			});

			element.dispatchEvent(createReplacementEvent({ dataTransferText: 'hello' }));

			expect(dispatch).not.toHaveBeenCalled();
			expect(getBlockText(state.doc.children[0])).toBe('hello');
		});

		it('does not apply pending stored marks to a resolved-range replacement', () => {
			// A pending mark toggle at the caret (e.g. Ctrl+B before accepting the
			// suggestion) must not bleed into the corrected word.
			element = document.createElement('div');
			let state = createState().withStoredMarks([{ type: markType('bold') }]);
			const dispatch = vi.fn((tr: Transaction) => {
				state = state.apply(tr);
			});
			const wordSelection = createSelection({ blockId: B1, offset: 0 }, { blockId: B1, offset: 5 });
			const resolveTargetRange = vi.fn().mockReturnValue(wordSelection);

			handler = new InputHandler(element, {
				getState: () => state,
				dispatch,
				syncSelection: vi.fn(),
				resolveTargetRange,
			});

			element.dispatchEvent(
				createReplacementEvent({ dataTransferText: 'howdy', targetRange: {} as StaticRange }),
			);

			expect(getBlockText(state.doc.children[0])).toBe('howdy');
			const children = getInlineChildren(state.doc.children[0]);
			for (const child of children) {
				expect(child.marks ?? []).toHaveLength(0);
			}
		});

		it('routes the replacement text through text-input interceptors', () => {
			element = document.createElement('div');
			let state = createState({
				selection: createSelection({ blockId: B1, offset: 1 }, { blockId: B1, offset: 3 }),
			});
			const dispatch = vi.fn((tr: Transaction) => {
				state = state.apply(tr);
			});
			const interceptor = vi.fn().mockReturnValue(null);

			handler = new InputHandler(element, {
				getState: () => state,
				dispatch,
				syncSelection: vi.fn(),
				getTextInputInterceptors: () => [
					{ name: 'test', pluginId: 'test', interceptor, priority: 100 },
				],
			});

			element.dispatchEvent(createReplacementEvent({ dataTransferText: 'XY' }));

			expect(interceptor).toHaveBeenCalledWith('XY', expect.any(Object));
			expect(getBlockText(state.doc.children[0])).toBe('hXYlo');
		});
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

	it('leaves input inside non-editable plugin UI to the browser', () => {
		element = document.createElement('div');
		element.contentEditable = 'true';
		const popup: HTMLDivElement = document.createElement('div');
		popup.contentEditable = 'false';
		const input: HTMLInputElement = document.createElement('input');
		popup.appendChild(input);
		element.appendChild(popup);

		let state = createState();
		const dispatch = vi.fn((tr: Transaction) => {
			state = state.apply(tr);
		});
		const tracker = new CompositionTracker();
		handler = new InputHandler(element, {
			getState: () => state,
			dispatch,
			syncSelection: vi.fn(),
			compositionTracker: tracker,
		});

		const beforeInput = createBeforeInputEvent('insertText', '210');
		input.dispatchEvent(beforeInput);
		input.dispatchEvent(createCompositionEvent('compositionstart'));
		input.dispatchEvent(createCompositionEvent('compositionend', 'ä'));

		expect(beforeInput.defaultPrevented).toBe(false);
		expect(dispatch).not.toHaveBeenCalled();
		expect(tracker.isComposing).toBe(false);
		expect(getBlockText(state.doc.children[0])).toBe('hello');
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

	describe('deletions during IME composition (#230)', () => {
		const DELETE_INPUT_TYPES: readonly string[] = [
			'deleteContentBackward',
			'deleteContentForward',
			'deleteWordBackward',
			'deleteWordForward',
			'deleteSoftLineBackward',
			'deleteSoftLineForward',
		];
		const COMPOSING: BeforeInputInit = { isComposing: true, cancelable: false };

		interface CompositionHarness {
			readonly dispatch: Mock<(tr: Transaction) => void>;
			readonly syncSelection: Mock<() => void>;
			readonly text: () => string;
		}

		function setupHarness(): CompositionHarness {
			element = document.createElement('div');
			let state: EditorState = createState();
			const dispatch = vi.fn((tr: Transaction) => {
				state = state.apply(tr);
			});
			const syncSelection = vi.fn();
			handler = new InputHandler(element, {
				getState: () => state,
				dispatch,
				syncSelection,
				compositionTracker: new CompositionTracker(),
			});
			return { dispatch, syncSelection, text: () => getBlockText(state.doc.children[0]) };
		}

		it('keeps committed text when Backspace edits the in-progress composition', () => {
			// Android Gboard: the model holds `hello`, the DOM `hellowo`; the
			// backspace removes the composed `o`, never the committed one.
			const h = setupHarness();

			element.dispatchEvent(createCompositionEvent('compositionstart'));
			element.dispatchEvent(createBeforeInputEvent('insertCompositionText', 'wo', COMPOSING));
			element.dispatchEvent(createBeforeInputEvent('deleteContentBackward', undefined, COMPOSING));
			element.dispatchEvent(createCompositionEvent('compositionend', 'w'));

			expect(h.dispatch).toHaveBeenCalledOnce();
			expect(h.text()).toBe('hellow');
		});

		it.each(DELETE_INPUT_TYPES)(
			'leaves %s to the browser while a composition is tracked',
			(inputType) => {
				const h = setupHarness();
				element.dispatchEvent(createCompositionEvent('compositionstart'));

				const event = createBeforeInputEvent(inputType);
				element.dispatchEvent(event);

				expect(event.defaultPrevented).toBe(false);
				expect(h.syncSelection).not.toHaveBeenCalled();
				expect(h.dispatch).not.toHaveBeenCalled();
				expect(h.text()).toBe('hello');
			},
		);

		it('leaves a deletion flagged isComposing to the browser without a tracked composition', () => {
			const h = setupHarness();

			const event = createBeforeInputEvent('deleteContentBackward', undefined, COMPOSING);
			element.dispatchEvent(event);

			expect(event.defaultPrevented).toBe(false);
			expect(h.dispatch).not.toHaveBeenCalled();
			expect(h.text()).toBe('hello');
		});

		it('applies deletions again once the composition has ended', () => {
			const h = setupHarness();
			element.dispatchEvent(createCompositionEvent('compositionstart'));
			element.dispatchEvent(createCompositionEvent('compositionend', ''));

			const event = createBeforeInputEvent('deleteContentBackward');
			element.dispatchEvent(event);

			expect(event.defaultPrevented).toBe(true);
			expect(h.text()).toBe('hell');
		});
	});

	describe('line breaks during IME composition (#256)', () => {
		const cases = [
			{ inputType: 'insertParagraph', expected: ['hellowo', ''], offset: 0 },
			{ inputType: 'insertLineBreak', expected: ['hellowo\uFFFC'], offset: 8 },
		];

		function setup(rendered?: string) {
			element = document.createElement('div');
			let state = createState();
			const dispatch = vi.fn((tr: Transaction) => {
				state = state.apply(tr);
			});
			const syncSelection = vi.fn();
			const isReadOnly = vi.fn(() => false);
			handler = new InputHandler(element, {
				getState: () => state,
				dispatch,
				syncSelection,
				isReadOnly,
				compositionDOM:
					rendered === undefined
						? undefined
						: {
								captureBlock: vi.fn(),
								readBlock: () => ({ text: rendered, caretOffset: null }),
								restoreBlock: vi.fn(),
							},
			});
			return {
				dispatch,
				syncSelection,
				isReadOnly,
				state: () => state,
				blocks: () => state.doc.children.map(getBlockOffsetText),
			};
		}

		it.each(cases)(
			'applies $inputType after the composed text, not before it',
			({ inputType, expected, offset }) => {
				const h = setup();
				element.dispatchEvent(createCompositionEvent('compositionstart'));
				element.dispatchEvent(
					createBeforeInputEvent('insertCompositionText', 'wo', { isComposing: true }),
				);
				element.dispatchEvent(createBeforeInputEvent(inputType, undefined, { isComposing: true }));
				element.dispatchEvent(createCompositionEvent('compositionend', 'wo'));

				expect(h.blocks()).toEqual(expected);
				expect(h.state().selection).toEqual({
					anchor: { blockId: h.state().doc.children.at(-1)?.id, offset },
					head: { blockId: h.state().doc.children.at(-1)?.id, offset },
				});
			},
		);

		it.each(cases)(
			'cancels and defers $inputType even when only the tracker reports composition',
			({ inputType, expected }) => {
				const h = setup('hellowo');
				element.dispatchEvent(createCompositionEvent('compositionstart'));
				const event = createBeforeInputEvent(inputType);
				element.dispatchEvent(event);

				expect(event.defaultPrevented).toBe(true);
				expect(h.dispatch).not.toHaveBeenCalled();
				expect(h.syncSelection).not.toHaveBeenCalled();
				expect(h.blocks()).toEqual(['hello']);

				element.dispatchEvent(createCompositionEvent('compositionend', 'wo'));
				expect(h.blocks()).toEqual(expected);
				expect(h.syncSelection).not.toHaveBeenCalled();
			},
		);

		it.each(cases)(
			'defers $inputType when only the event reports composition',
			({ inputType, expected }) => {
				const h = setup();
				element.dispatchEvent(createBeforeInputEvent(inputType, undefined, { isComposing: true }));
				expect(h.dispatch).not.toHaveBeenCalled();
				element.dispatchEvent(createCompositionEvent('compositionend', 'wo'));
				expect(h.blocks()).toEqual(expected);
			},
		);

		it.each(cases)(
			'does not duplicate an explicit composition commit before $inputType',
			({ inputType, expected }) => {
				const h = setup();
				element.dispatchEvent(createCompositionEvent('compositionstart'));
				element.dispatchEvent(createBeforeInputEvent(inputType));
				element.dispatchEvent(createBeforeInputEvent('insertFromComposition', 'wo'));
				element.dispatchEvent(createCompositionEvent('compositionend', 'wo'));
				expect(h.blocks()).toEqual(expected);
			},
		);

		it('keeps multiple requested breaks in order and consumes them only once', () => {
			const h = setup();
			element.dispatchEvent(createCompositionEvent('compositionstart'));
			element.dispatchEvent(createBeforeInputEvent('insertLineBreak'));
			element.dispatchEvent(createBeforeInputEvent('insertParagraph'));
			element.dispatchEvent(createBeforeInputEvent('insertParagraph'));
			element.dispatchEvent(createCompositionEvent('compositionend', 'wo'));
			expect(h.blocks()).toEqual(['hellowo\uFFFC', '', '']);
			element.dispatchEvent(createCompositionEvent('compositionstart'));
			element.dispatchEvent(createCompositionEvent('compositionend', 'next'));
			expect(h.blocks()).toEqual(['hellowo\uFFFC', '', 'next']);
		});

		it('preserves Enter when the composition commits no text', () => {
			const h = setup('hello');
			element.dispatchEvent(createCompositionEvent('compositionstart'));
			element.dispatchEvent(createBeforeInputEvent('insertParagraph'));
			expect(h.blocks()).toEqual(['hello']);
			element.dispatchEvent(createCompositionEvent('compositionend', ''));
			expect(h.blocks()).toEqual(['hello', '']);
		});

		it('discards pending breaks if the editor becomes read-only', () => {
			const h = setup();
			element.dispatchEvent(createCompositionEvent('compositionstart'));
			element.dispatchEvent(createBeforeInputEvent('insertParagraph'));
			h.isReadOnly.mockReturnValue(true);
			element.dispatchEvent(createCompositionEvent('compositionend', 'wo'));
			expect(h.blocks()).toEqual(['hello']);
			h.isReadOnly.mockReturnValue(false);
			element.dispatchEvent(createCompositionEvent('compositionstart'));
			element.dispatchEvent(createCompositionEvent('compositionend', '!'));
			expect(h.blocks()).toEqual(['hello!']);
		});

		it('does not carry pending breaks into a new composition', () => {
			const h = setup();
			element.dispatchEvent(createCompositionEvent('compositionstart'));
			element.dispatchEvent(createBeforeInputEvent('insertParagraph'));
			element.dispatchEvent(createCompositionEvent('compositionstart'));
			element.dispatchEvent(createCompositionEvent('compositionend', 'wo'));
			expect(h.blocks()).toEqual(['hellowo']);
		});
	});

	describe('compositions the browser dropped (#265)', () => {
		function setup(state: EditorState = createState()) {
			element = document.createElement('div');
			let current: EditorState = state;
			const tracker = new CompositionTracker();
			handler = new InputHandler(element, {
				getState: () => current,
				dispatch: (tr: Transaction) => {
					current = current.apply(tr);
				},
				syncSelection: vi.fn(),
				compositionTracker: tracker,
				compositionDOM: {
					captureBlock: vi.fn(),
					readBlock: () => ({ text: 'hello', caretOffset: null }),
					restoreBlock: vi.fn(),
				},
			});
			return {
				tracker,
				state: () => current,
				blocks: () => current.doc.children.map(getBlockOffsetText),
			};
		}

		function keydown(init: KeyboardEventInit): void {
			element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
		}

		it('ends the composition and applies deferred breaks when a key the IME does not own arrives', () => {
			const h = setup();
			element.dispatchEvent(createCompositionEvent('compositionstart'));
			element.dispatchEvent(createBeforeInputEvent('insertParagraph'));

			keydown({ key: 'Backspace' });

			expect(h.tracker.isComposing).toBe(false);
			expect(h.blocks()).toEqual(['hello', '']);
		});

		it.each([{ isComposing: true }, { key: 'Process' }])(
			'keeps the composition for a key the IME owns (%o)',
			(init) => {
				const h = setup();
				element.dispatchEvent(createCompositionEvent('compositionstart'));

				keydown(init);

				expect(h.tracker.isComposing).toBe(true);
			},
		);

		it('ends the composition once a state change that removed its block is rendered', async () => {
			const start: EditorState = EditorState.create({
				doc: createDocument([
					createBlockNode(nodeType('paragraph'), [createTextNode('hello')], B1),
					createBlockNode(nodeType('paragraph'), [createTextNode('other')], blockId('b2')),
				]),
				selection: createCollapsedSelection(B1, 5),
			});
			const h = setup(start);
			element.dispatchEvent(createCompositionEvent('compositionstart'));
			const removal: Transaction = start.transaction('api').removeNode([], 0).build();

			handler.onStateChange(start, start.apply(removal), removal);
			expect(h.tracker.isComposing).toBe(true);
			await Promise.resolve();

			expect(h.tracker.isComposing).toBe(false);
		});
	});

	describe('TextInputInterceptor', () => {
		it('isolates a throwing interceptor and preserves the intercepted text via fallback', () => {
			element = document.createElement('div');
			let state = createState();
			const failures: string[] = [];
			const callbackExecutor = new PluginCallbackExecutor((failure) => {
				failures.push(`${failure.pluginId}:${failure.name}:${failure.kind}`);
			});
			const throwing = vi.fn(() => {
				throw new Error('broken interceptor');
			});
			const passing = vi.fn().mockReturnValue(null);

			handler = new InputHandler(element, {
				getState: () => state,
				dispatch: (tr: Transaction) => {
					state = state.apply(tr);
				},
				syncSelection: vi.fn(),
				callbackExecutor,
				getTextInputInterceptors: () => [
					{
						name: 'throwing',
						pluginId: 'broken-plugin',
						interceptor: throwing,
						priority: 10,
					},
					{
						name: 'passing',
						pluginId: 'next-plugin',
						interceptor: passing,
						priority: 20,
					},
				],
			});

			const event = createBeforeInputEvent('insertText', 'A');
			element.dispatchEvent(event);

			expect(event.defaultPrevented).toBe(true);
			expect(throwing).toHaveBeenCalledOnce();
			expect(passing).toHaveBeenCalledOnce();
			expect(getBlockText(state.doc.children[0])).toBe('helloA');
			expect(failures).toEqual(['broken-plugin:throwing:text-input-interceptor']);
		});

		it('claims insertText when an interceptor returns a transaction', () => {
			element = document.createElement('div');
			let state = createState();
			const dispatch = vi.fn((tr: Transaction) => {
				state = state.apply(tr);
			});

			const interceptorTr: Transaction = state
				.transaction('input')
				.insertText(B1, state.selection.anchor.offset, 'XY', [])
				.build();
			const interceptor = vi.fn().mockReturnValue(interceptorTr);
			const entry: TextInputInterceptorEntry = {
				name: 'test',
				pluginId: 'test',
				interceptor,
				priority: 100,
			};

			handler = new InputHandler(element, {
				getState: () => state,
				dispatch,
				syncSelection: vi.fn(),
				getTextInputInterceptors: () => [entry],
			});

			const event = createBeforeInputEvent('insertText', 'A');
			element.dispatchEvent(event);

			expect(interceptor).toHaveBeenCalledOnce();
			expect(interceptor).toHaveBeenCalledWith('A', expect.any(Object));
			expect(dispatch).toHaveBeenCalledOnce();
			expect(getBlockText(state.doc.children[0])).toBe('helloXY');
		});

		it('iterates interceptors in supplied order; first non-null wins', () => {
			element = document.createElement('div');
			let state = createState();
			const dispatch = vi.fn((tr: Transaction) => {
				state = state.apply(tr);
			});

			const wonTr: Transaction = state
				.transaction('input')
				.insertText(B1, state.selection.anchor.offset, 'WIN', [])
				.build();

			const high = vi.fn().mockReturnValue(null);
			const winner = vi.fn().mockReturnValue(wonTr);
			const loser = vi.fn().mockReturnValue(null);

			// Caller (MiddlewareChain) is responsible for priority sorting.
			const entries: TextInputInterceptorEntry[] = [
				{ name: 'high', pluginId: 'test', interceptor: high, priority: 10 },
				{ name: 'win', pluginId: 'test', interceptor: winner, priority: 50 },
				{ name: 'low', pluginId: 'test', interceptor: loser, priority: 100 },
			];

			handler = new InputHandler(element, {
				getState: () => state,
				dispatch,
				syncSelection: vi.fn(),
				getTextInputInterceptors: () => entries,
			});

			const event = createBeforeInputEvent('insertText', 'A');
			element.dispatchEvent(event);

			expect(high).toHaveBeenCalledOnce();
			expect(winner).toHaveBeenCalledOnce();
			expect(loser).not.toHaveBeenCalled();
			expect(getBlockText(state.doc.children[0])).toBe('helloWIN');
		});

		it('falls through to default insertTextCommand when all interceptors return null', () => {
			element = document.createElement('div');
			let state = createState();
			const dispatch = vi.fn((tr: Transaction) => {
				state = state.apply(tr);
			});

			const interceptor = vi.fn().mockReturnValue(null);
			const entry: TextInputInterceptorEntry = {
				name: 'test',
				pluginId: 'test',
				interceptor,
				priority: 100,
			};

			handler = new InputHandler(element, {
				getState: () => state,
				dispatch,
				syncSelection: vi.fn(),
				getTextInputInterceptors: () => [entry],
			});

			const event = createBeforeInputEvent('insertText', 'A');
			element.dispatchEvent(event);

			expect(interceptor).toHaveBeenCalledOnce();
			expect(dispatch).toHaveBeenCalledOnce();
			expect(getBlockText(state.doc.children[0])).toBe('helloA');
		});

		it('skips interceptors during in-flight composition (insertCompositionText)', () => {
			element = document.createElement('div');
			const state = createState({ text: '' });
			const tracker = new CompositionTracker();
			const dispatch = vi.fn();
			const interceptor = vi.fn();

			handler = new InputHandler(element, {
				getState: () => state,
				dispatch,
				syncSelection: vi.fn(),
				compositionTracker: tracker,
				getTextInputInterceptors: () => [{ name: 't', pluginId: 'p', interceptor, priority: 100 }],
			});

			element.dispatchEvent(createCompositionEvent('compositionstart'));
			const event = createBeforeInputEvent('insertCompositionText', 'ä');
			element.dispatchEvent(event);

			expect(interceptor).not.toHaveBeenCalled();
			expect(dispatch).not.toHaveBeenCalled();
		});
	});

	// The bug lives in `checkInputRules` (offset-space mismatch), so these tests
	// drive the real engine — building the block with a genuine inline node and
	// computing offsets through the code under test — not a hand-built start/end.
	describe('input rules compute model offsets (#192)', () => {
		function boldRuleRegistry(): InputRuleRegistry {
			const registry = new InputRuleRegistry();
			registry.registerInputRule(createMarkInputRule('bold', '**'));
			return registry;
		}

		it('preserves a preceding inline node and marks the right run', () => {
			element = document.createElement('div');
			const image = createInlineNode(inlineType('image_inline'), { src: 'x', alt: '' });
			// Model offsets: the image occupies [0,1); the text begins at offset 1.
			let state = EditorState.create({
				doc: createDocument([
					createBlockNode(nodeType('paragraph'), [image, createTextNode('**bold*')], B1),
				]),
				selection: createCollapsedSelection(B1, 8),
			});
			handler = new InputHandler(element, {
				getState: () => state,
				dispatch: (tr: Transaction) => {
					state = state.apply(tr);
				},
				syncSelection: vi.fn(),
				inputRuleRegistry: boldRuleRegistry(),
			});

			// Typing the final `*` completes `**bold**` and fires the rule.
			element.dispatchEvent(createBeforeInputEvent('insertText', '*'));

			const children = getInlineChildren(state.doc.children[0]);
			expect(children).toHaveLength(2);
			const [img, txt] = children;
			expect(img && 'inlineType' in img ? img.inlineType : '').toBe('image_inline');
			expect(txt && 'text' in txt ? txt.text : '').toBe('bold');
			expect(txt && 'text' in txt ? txt.marks.map((m) => m.type) : []).toEqual(['bold']);
		});

		it('still fires when no inline node precedes the match', () => {
			element = document.createElement('div');
			let state = EditorState.create({
				doc: createDocument([
					createBlockNode(nodeType('paragraph'), [createTextNode('**bold*')], B1),
				]),
				selection: createCollapsedSelection(B1, 7),
			});
			handler = new InputHandler(element, {
				getState: () => state,
				dispatch: (tr: Transaction) => {
					state = state.apply(tr);
				},
				syncSelection: vi.fn(),
				inputRuleRegistry: boldRuleRegistry(),
			});

			element.dispatchEvent(createBeforeInputEvent('insertText', '*'));

			const children = getInlineChildren(state.doc.children[0]);
			expect(children).toHaveLength(1);
			const [txt] = children;
			expect(txt && 'text' in txt ? txt.text : '').toBe('bold');
			expect(txt && 'text' in txt ? txt.marks.map((m) => m.type) : []).toEqual(['bold']);
		});
	});

	describe('InputRule runtime isolation', () => {
		it('continues with later matching rules when one plugin rule throws', () => {
			element = document.createElement('div');
			let state = createState({ text: 'a' });
			const callbackExecutor = new PluginCallbackExecutor(vi.fn());
			const registry = new InputRuleRegistry();
			const throwingHandler = vi.fn(() => {
				throw new Error('broken rule');
			});
			const succeedingHandler = vi.fn((current: EditorState) =>
				current.transaction('input').insertText(B1, 2, '!', []).build(),
			);
			registry.registerInputRule(
				{ pattern: /ab$/, handler: throwingHandler },
				{ pluginId: 'broken-plugin', name: 'throwing-rule' },
			);
			registry.registerInputRule(
				{ pattern: /ab$/, handler: succeedingHandler },
				{ pluginId: 'next-plugin', name: 'succeeding-rule' },
			);

			handler = new InputHandler(element, {
				getState: () => state,
				dispatch: (tr: Transaction) => {
					state = state.apply(tr);
				},
				syncSelection: vi.fn(),
				inputRuleRegistry: registry,
				callbackExecutor,
			});

			element.dispatchEvent(createBeforeInputEvent('insertText', 'b'));

			expect(throwingHandler).toHaveBeenCalledOnce();
			expect(succeedingHandler).toHaveBeenCalledOnce();
			expect(getBlockText(state.doc.children[0])).toBe('ab!');
		});
	});

	// The global `markdown` config gate (markdown: false) routes through
	// `shouldApplyInputRules`. When disabled, typed shorthand must stay literal.
	describe('shouldApplyInputRules gate', () => {
		function boldRuleRegistry(): InputRuleRegistry {
			const registry = new InputRuleRegistry();
			registry.registerInputRule(createMarkInputRule('bold', '**'));
			return registry;
		}

		it('leaves typed Markdown shorthand literal when the gate is closed', () => {
			element = document.createElement('div');
			let state = EditorState.create({
				doc: createDocument([
					createBlockNode(nodeType('paragraph'), [createTextNode('**bold*')], B1),
				]),
				selection: createCollapsedSelection(B1, 7),
			});
			handler = new InputHandler(element, {
				getState: () => state,
				dispatch: (tr: Transaction) => {
					state = state.apply(tr);
				},
				syncSelection: vi.fn(),
				inputRuleRegistry: boldRuleRegistry(),
				shouldApplyInputRules: () => false,
			});

			// Completes `**bold**`; the rule would fire if the gate were open.
			element.dispatchEvent(createBeforeInputEvent('insertText', '*'));

			const children = getInlineChildren(state.doc.children[0]);
			expect(children).toHaveLength(1);
			const [txt] = children;
			expect(txt && 'text' in txt ? txt.text : '').toBe('**bold**');
			expect(txt && 'text' in txt ? txt.marks.map((m) => m.type) : []).toEqual([]);
		});
	});
});
