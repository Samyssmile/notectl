import { afterEach, describe, expect, it, vi } from 'vitest';
import { insertTextCommand } from '../commands/Commands.js';
import type { CompositionSnapshot } from '../model/CompositionState.js';
import {
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
	getInlineChildren,
	isTextNode,
} from '../model/Document.js';
import { createCollapsedSelection } from '../model/Selection.js';
import { type BlockId, blockId, inlineType, nodeType } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { stateBuilder } from '../test/TestUtils.js';
import { InputManager } from './InputManager.js';

const B1: BlockId = blockId('b1');

interface Harness {
	/** Applies a transaction the way `EditorView.dispatch` does, notifying input. */
	dispatch(tr: Transaction): void;
	/** Replaces the document the way `EditorView.replaceState` does (`setJSON`). */
	replaceState(next: EditorState): void;
	state(): EditorState;
	compose(rendered: CompositionSnapshot, composedText: string): void;
	startComposition(): void;
}

let manager: InputManager | null = null;

afterEach(() => {
	manager?.destroy();
	manager = null;
});

function harness(initial: EditorState): Harness {
	const element: HTMLElement = document.createElement('div');
	let state: EditorState = initial;
	let rendered: CompositionSnapshot | null = null;
	const apply = (next: EditorState, tr: Transaction): void => {
		const old: EditorState = state;
		state = next;
		manager?.onStateChange(old, next, tr);
	};
	const dispatch = (tr: Transaction): void => apply(state.apply(tr), tr);
	manager = new InputManager(element, {
		getState: () => state,
		dispatch,
		syncSelection: vi.fn(),
		undo: vi.fn(),
		redo: vi.fn(),
		isReadOnly: () => false,
		compositionDOM: { captureBlock: vi.fn(), readBlock: () => rendered, restoreBlock: vi.fn() },
	});
	return {
		dispatch,
		replaceState: (next) =>
			apply(next.withSelection(state.selection), next.transaction('api').build()),
		state: () => state,
		startComposition: () => {
			element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
		},
		compose: (snapshot, composedText) => {
			rendered = snapshot;
			const event = new CompositionEvent('compositionend', { bubbles: true });
			// happy-dom ignores `data` in the event init.
			Object.defineProperty(event, 'data', { value: composedText });
			element.dispatchEvent(event);
		},
	};
}

/** Inline content of `b1`: text verbatim, inline nodes as `[type]`, so a U+FFFC text character stays visible. */
function content(state: EditorState): string {
	const block = state.getBlock(B1);
	if (!block) return '<missing>';
	return getInlineChildren(block)
		.map((child) => (isTextNode(child) ? child.text : `[${child.inlineType}]`))
		.join('');
}

/** `pre [math_inline] post` with the caret at `caret`. */
function formulaState(caret: number): EditorState {
	return stateBuilder()
		.blockWithInlines(
			'paragraph',
			[
				createTextNode('pre '),
				createInlineNode(inlineType('math_inline'), { latex: 'x' }),
				createTextNode(' post'),
			],
			'b1',
		)
		.cursor('b1', caret)
		.schema(['paragraph'], [])
		.build();
}

function helloState(): EditorState {
	return stateBuilder().paragraph('hello', 'b1').cursor('b1', 5).schema(['paragraph'], []).build();
}

function insertAt(state: EditorState, offset: number, text: string): Transaction {
	return state.transaction('api').insertText(B1, offset, text, []).build();
}

describe('InputManager: document changes during an IME composition', () => {
	it('keeps text inserted into the composition block while composing', () => {
		const h = harness(helloState());

		h.startComposition();
		h.dispatch(insertAt(h.state(), 0, 'Z'));
		h.compose({ text: 'hellowo', caretOffset: 7 }, 'wo');

		expect(content(h.state())).toBe('Zhellowo');
		expect(h.state().selection).toEqual(createCollapsedSelection(B1, 8));
	});

	it('keeps an inline node and the host edit in front of the composition', () => {
		const h = harness(formulaState(10));

		h.startComposition();
		h.dispatch(insertAt(h.state(), 0, 'Z'));
		h.compose({ text: 'pre ￼ postx', caretOffset: 11 }, 'x');

		expect(content(h.state())).toBe('Zpre [math_inline] postx');
		expect(h.state().selection).toEqual(createCollapsedSelection(B1, 12));
	});

	it('keeps a host edit behind a composition in front of an inline node', () => {
		const h = harness(formulaState(4));

		h.startComposition();
		h.dispatch(insertAt(h.state(), 10, 'Z'));
		h.compose({ text: 'pre x￼ post', caretOffset: 5 }, 'x');

		expect(content(h.state())).toBe('pre x[math_inline] postZ');
		expect(h.state().selection).toEqual(createCollapsedSelection(B1, 5));
	});

	it('keeps text pasted at the model caret in front of the composed text', () => {
		const h = harness(helloState());

		h.startComposition();
		h.dispatch(insertTextCommand(h.state(), 'P', 'paste'));
		h.compose({ text: 'hellowo', caretOffset: 7 }, 'wo');

		expect(content(h.state())).toBe('helloPwo');
		expect(h.state().selection).toEqual(createCollapsedSelection(B1, 8));
	});

	it('keeps content a host set for the composition block while composing', () => {
		const h = harness(helloState());
		const replacement: EditorState = EditorState.create({
			doc: createDocument([createBlockNode(nodeType('paragraph'), [createTextNode('bye')], B1)]),
		});

		h.startComposition();
		h.replaceState(replacement);
		h.compose({ text: 'hellowo', caretOffset: 7 }, 'wo');

		expect(content(h.state())).toBe('byewo');
	});
});
