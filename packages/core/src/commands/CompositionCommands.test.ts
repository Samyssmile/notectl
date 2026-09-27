import { describe, expect, it } from 'vitest';
import {
	createInlineNode,
	createTextNode,
	getBlockText,
	getInlineChildren,
	isInlineNode,
	isTextNode,
} from '../model/Document.js';
import { INLINE_NODE_PLACEHOLDER } from '../model/InputRule.js';
import { blockId, inlineType, markType } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import { expectCursorAt, stateBuilder } from '../test/TestUtils.js';
import { commitComposedText } from './CompositionCommands.js';

const B1 = blockId('b1');

function helloState(): EditorState {
	return stateBuilder()
		.paragraph('hello', 'b1')
		.cursor('b1', 5)
		.schema(['paragraph', 'heading'], ['bold'])
		.build();
}

function commit(state: EditorState, rendered: string, start: number): EditorState {
	const tr = commitComposedText(state, B1, rendered, start);
	if (!tr) throw new Error('expected a commit transaction');
	return state.apply(tr);
}

function text(state: EditorState): string {
	const block = state.getBlock(B1);
	return block ? getBlockText(block) : '';
}

describe('commitComposedText', () => {
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
		expect(commitComposedText(helloState(), B1, 'hello', 5)).toBeNull();
	});

	it('returns null for a block the state does not contain', () => {
		expect(commitComposedText(helloState(), blockId('missing'), 'x', 0)).toBeNull();
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
			.paragraph('a b ', 'b1')
			.cursor('b1', 4)
			.schema(['paragraph'], [])
			.build();

		const next = commit(state, 'a b c', 4);

		expect(text(next)).toBe('a b c');
	});

	it('stores a composed NBSP as a space', () => {
		const next = commit(helloState(), 'hello ', 5);

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
		expect(commitComposedText(state, B1, `a${INLINE_NODE_PLACEHOLDER}b`, 3)).toBeNull();

		const next = commit(state, 'ab', 3);

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
});
