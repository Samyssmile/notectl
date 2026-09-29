import { describe, expect, it } from 'vitest';
import type { CompositionSnapshot } from '../model/CompositionState.js';
import {
	createInlineNode,
	createTextNode,
	getBlockText,
	getInlineChildren,
	isInlineNode,
	isTextNode,
} from '../model/Document.js';
import { INLINE_NODE_PLACEHOLDER } from '../model/InputRule.js';
import { createCollapsedSelection } from '../model/Selection.js';
import { type BlockId, blockId, inlineType, markType } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { expectCursorAt, stateBuilder } from '../test/TestUtils.js';
import {
	type CompositionBase,
	commitComposition,
	createCompositionBase,
	mapCompositionBase,
} from './CompositionCommands.js';

const B1: BlockId = blockId('b1');

/** A composition that started in `b1` of `state`, followed through edits made meanwhile. */
interface Composing {
	readonly state: EditorState;
	readonly base: CompositionBase;
}

function helloState(): EditorState {
	return stateBuilder()
		.paragraph('hello', 'b1')
		.cursor('b1', 5)
		.schema(['paragraph', 'heading'], ['bold'])
		.build();
}

function startComposing(state: EditorState, from: number): Composing {
	const base: CompositionBase | null = createCompositionBase(state, B1, from);
	if (!base) throw new Error('expected a composition base');
	return { state, base };
}

/** Applies `tr` while composing, as the view reports it to the composition. */
function meanwhile(composing: Composing, tr: Transaction): Composing {
	const next: EditorState = composing.state.apply(tr);
	return { state: next, base: mapCompositionBase(composing.base, composing.state, next, tr) };
}

function insertMeanwhile(composing: Composing, offset: number, text: string): Composing {
	return meanwhile(
		composing,
		composing.state.transaction('api').insertText(B1, offset, text, []).build(),
	);
}

function commitAt(
	composing: Composing,
	rendered: string,
	caretOffset: number | null = null,
	composedText = '',
): EditorState {
	const snapshot: CompositionSnapshot = { text: rendered, caretOffset };
	const tr = commitComposition(composing.state, composedText, composing.base, snapshot);
	if (!tr) throw new Error('expected a commit transaction');
	return composing.state.apply(tr);
}

function commit(state: EditorState, rendered: string, start: number): EditorState {
	return commitAt(startComposing(state, start), rendered);
}

function text(state: EditorState, id: BlockId = B1): string {
	const block = state.getBlock(id);
	return block ? getBlockText(block) : '';
}

/** Inline content of `b1`: text verbatim, inline nodes as `[type]`, so a U+FFFC text character stays visible. */
function content(state: EditorState): string {
	const block = state.getBlock(B1);
	if (!block) return '<missing>';
	return getInlineChildren(block)
		.map((child) => (isTextNode(child) ? child.text : `[${child.inlineType}]`))
		.join('');
}

/** `ab[emoji]cd` with the caret at the end. */
function inlineNodeState(): EditorState {
	return stateBuilder()
		.blockWithInlines(
			'paragraph',
			[createTextNode('ab'), createInlineNode(inlineType('emoji')), createTextNode('cd')],
			'b1',
		)
		.cursor('b1', 5)
		.schema(['paragraph'], [])
		.build();
}

describe('commitComposition', () => {
	it('inserts text composed at the caret', () => {
		const next = commit(helloState(), 'hellowo', 5);

		expect(text(next)).toBe('hellowo');
		expectCursorAt(next, 'b1', 7);
	});

	it('applies a composing deletion that reached committed text (#257)', () => {
		const next = commit(helloState(), 'hell', 5);

		expect(text(next)).toBe('hell');
		expectCursorAt(next, 'b1', 4);
	});

	it('keeps committed text when the deletion stayed inside the composition (#230)', () => {
		const next = commit(helloState(), 'hellow', 5);

		expect(text(next)).toBe('hellow');
	});

	it('replaces a recomposed word instead of duplicating it', () => {
		const next = commit(helloState(), 'help', 5);

		expect(text(next)).toBe('help');
		expectCursorAt(next, 'b1', 4);
	});

	it('returns null when the rendered text already matches the model', () => {
		const composing = startComposing(helloState(), 5);
		const snapshot: CompositionSnapshot = { text: 'hello', caretOffset: null };

		expect(commitComposition(composing.state, 'hello', composing.base, snapshot)).toBeNull();
	});

	it('has no base for a block the state does not contain', () => {
		expect(createCompositionBase(helloState(), blockId('missing'), 0)).toBeNull();
	});

	it('inserts the composed text at the caret without a base or rendered text', () => {
		const state: EditorState = helloState();
		const composing: Composing = startComposing(state, 5);

		for (const tr of [
			commitComposition(state, 'wo', null, null),
			commitComposition(state, 'wo', composing.base, null),
		]) {
			expect(tr ? text(state.apply(tr)) : null).toBe('hellowo');
		}
		expect(commitComposition(state, '', null, null)).toBeNull();
	});

	it('gives composed text the marks stored at the caret', () => {
		const bold = { type: markType('bold') };
		const state = helloState().withStoredMarks([bold]);

		const next = commit(state, 'hellowo', 5);

		const block = next.getBlock(B1);
		const children = block ? getInlineChildren(block) : [];
		const composed = children.find((child) => isTextNode(child) && child.text === 'wo');
		expect(composed && isTextNode(composed) ? composed.marks : null).toEqual([bold]);
	});

	it('matches spaces the view renders as NBSP and keeps NBSPs stored in the model', () => {
		const state = stateBuilder()
			.paragraph('a b ', 'b1')
			.cursor('b1', 4)
			.schema(['paragraph'], [])
			.build();

		const next = commit(state, 'a b c', 4);

		expect(text(next)).toBe('a b c');
	});

	it('stores a composed NBSP as a space', () => {
		const next = commit(helloState(), 'hello ', 5);

		expect(text(next)).toBe('hello ');
	});

	it('removes an inline node the composition deleted', () => {
		const state = stateBuilder()
			.blockWithInlines(
				'paragraph',
				[createTextNode('a'), createInlineNode(inlineType('hard_break')), createTextNode('b')],
				'b1',
			)
			.cursor('b1', 3)
			.schema(['paragraph'], [])
			.build();
		const composing = startComposing(state, 3);
		const unchanged: CompositionSnapshot = {
			text: `a${INLINE_NODE_PLACEHOLDER}b`,
			caretOffset: null,
		};
		expect(commitComposition(state, '', composing.base, unchanged)).toBeNull();

		const next = commitAt(composing, 'ab');

		const block = next.getBlock(B1);
		expect(block ? getInlineChildren(block).some(isInlineNode) : true).toBe(false);
		expect(text(next)).toBe('ab');
	});

	it('keeps the block type when the composition deletes all its text', () => {
		const state = stateBuilder()
			.heading('hi', 'b1', 1)
			.cursor('b1', 2)
			.schema(['paragraph', 'heading'], [])
			.build();

		const next = commit(state, '', 2);

		expect(next.getBlock(B1)?.type).toBe('heading');
		expect(text(next)).toBe('');
		expectCursorAt(next, 'b1', 0);
	});

	describe('edits made to the document while composing (#260)', () => {
		it('places the composed text behind text inserted in front of it', () => {
			const composing = insertMeanwhile(startComposing(helloState(), 5), 0, 'Z');

			const next = commitAt(composing, 'hellowo', 7);

			expect(text(next)).toBe('Zhellowo');
			expectCursorAt(next, 'b1', 8);
		});

		it('keeps text inserted behind the composition', () => {
			const state = stateBuilder().paragraph('hello', 'b1').cursor('b1', 2).build();
			const composing = insertMeanwhile(startComposing(state, 2), 5, 'Z');

			const next = commitAt(composing, 'hewollo', 4);

			expect(text(next)).toBe('hewolloZ');
			expectCursorAt(next, 'b1', 4);
		});

		it('keeps inline nodes as nodes around a composition placed through edits', () => {
			const composing = insertMeanwhile(startComposing(inlineNodeState(), 5), 0, 'Z');

			const next = commitAt(composing, `ab${INLINE_NODE_PLACEHOLDER}cdx`, 6);

			expect(content(next)).toBe('Zab[emoji]cdx');
			expectCursorAt(next, 'b1', 7);
		});

		it('puts the composed text before text inserted meanwhile at the composition start', () => {
			const composing = insertMeanwhile(startComposing(helloState(), 5), 5, 'P');

			expect(text(commitAt(composing, 'hellowo', 7))).toBe('hellowoP');
		});

		it('keeps text inserted meanwhile at both edges of a recomposed word', () => {
			const state = stateBuilder().paragraph('say hello', 'b1').cursor('b1', 9).build();
			let composing: Composing = startComposing(state, 9);
			composing = insertMeanwhile(composing, 9, ']');
			composing = insertMeanwhile(composing, 4, '[');

			expect(text(commitAt(composing, 'say help'))).toBe('say [help]');
		});

		it('maps a caret behind a recomposed word through edits made meanwhile', () => {
			const state = stateBuilder().paragraph('hello world', 'b1').cursor('b1', 5).build();
			const composing = insertMeanwhile(startComposing(state, 5), 0, 'Z');

			const next = commitAt(composing, 'help world', 10);

			expect(text(next)).toBe('Zhelp world');
			expectCursorAt(next, 'b1', 11);
		});

		it('maps the caret of a composition without text edit through edits made meanwhile', () => {
			const state = stateBuilder()
				.paragraph('cat', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 3 })
				.build();
			const composing = insertMeanwhile(startComposing(state, 0), 0, 'Z');

			const next = commitAt(composing, 'cat', 3, 'cat');

			expect(text(next)).toBe('Zcat');
			expectCursorAt(next, 'b1', 4);
		});

		it('follows the composition into the block a split moved it to', () => {
			const started: Composing = startComposing(helloState(), 5);
			const composing = meanwhile(
				started,
				started.state.transaction('api').splitBlock(B1, 2, blockId('b2')).build(),
			);

			const next = commitAt(composing, 'hellowo', 7);

			expect([text(next), text(next, blockId('b2'))]).toEqual(['he', 'llowo']);
			expectCursorAt(next, 'b2', 5);
		});

		it('inserts the composed text at the selection when the replaced text changed', () => {
			const state = stateBuilder().paragraph('hello', 'b1').cursor('b1', 5).build();
			const composing = meanwhile(
				startComposing(state, 5),
				state
					.transaction('api')
					.deleteTextAt(B1, 3, 5)
					.setSelection(createCollapsedSelection(B1, 3))
					.build(),
			);

			// The IME recomposed `hello` as `help`, but `lo` is gone meanwhile.
			const next = commitAt(composing, 'help', 4, 'help');

			expect(text(next)).toBe('helhelp');
		});

		it('never turns an inline node into placeholder text', () => {
			// Not expressible as one text edit: text changed on both sides of the node.
			const next = commitAt(
				startComposing(inlineNodeState(), 5),
				`a${INLINE_NODE_PLACEHOLDER}cdx`,
				null,
				'x',
			);

			expect(content(next)).toBe('ab[emoji]cdx');
		});

		it('inserts the composed text at the selection after the block content was replaced', () => {
			const composing = startComposing(helloState(), 5);
			const replaced: EditorState = stateBuilder()
				.paragraph('bye', 'b1')
				.cursor('b1', 3)
				.schema(['paragraph', 'heading'], ['bold'])
				.build();
			const base = mapCompositionBase(
				composing.base,
				composing.state,
				replaced,
				replaced.transaction('api').build(),
			);

			const next = commitAt({ state: replaced, base }, 'hellowo', 7, 'wo');

			expect(text(next)).toBe('byewo');
			const unchanged: CompositionSnapshot = { text: 'hello', caretOffset: 5 };
			expect(commitComposition(replaced, 'hello', base, unchanged)).toBeNull();
		});

		it('keeps following a document replaced with the same block content', () => {
			const composing = startComposing(helloState(), 5);
			const resynced: EditorState = helloState();

			const base = mapCompositionBase(
				composing.base,
				composing.state,
				resynced,
				resynced.transaction('api').build(),
			);

			expect(base).toBe(composing.base);
			expect(text(commitAt({ state: resynced, base }, 'help', 4, 'help'))).toBe('help');
		});
	});
});
