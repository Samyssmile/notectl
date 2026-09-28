import { describe, expect, it } from 'vitest';
import type { CompositionSnapshot } from '../model/CompositionState.js';
import {
	type BlockNode,
	type InlineNode,
	type TextNode,
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
import { Mapping } from '../state/Mapping.js';
import type { Transaction } from '../state/Transaction.js';
import { expectCursorAt, stateBuilder } from '../test/TestUtils.js';
import {
	type CompositionCommit,
	type CompositionCommitResult,
	commitComposedText,
} from './CompositionCommands.js';

const B1 = blockId('b1');
const PH: string = INLINE_NODE_PLACEHOLDER;

function helloState(): EditorState {
	return stateBuilder()
		.paragraph('hello', 'b1')
		.cursor('b1', 5)
		.schema(['paragraph', 'heading'], ['bold'])
		.build();
}

function formula(latex: string): InlineNode {
	return createInlineNode(inlineType('math_inline'), { latex });
}

function inlineState(children: readonly (TextNode | InlineNode)[], caret: number): EditorState {
	return stateBuilder()
		.blockWithInlines('paragraph', children, 'b1')
		.cursor('b1', caret)
		.schema(['paragraph'], ['bold'])
		.build();
}

interface CommitInput {
	/** The state the composition started from; its block is the baseline. */
	readonly start: EditorState;
	readonly rendered: string | CompositionSnapshot;
	readonly from: number;
	readonly to?: number;
	/** Transactions applied while composing; `null` marks a replaced document. */
	readonly during?: readonly Transaction[] | null;
}

function run(input: CommitInput): {
	readonly state: EditorState;
	readonly result: CompositionCommitResult;
} {
	const baseline: BlockNode | undefined = input.start.getBlock(B1);
	if (!baseline) throw new Error('missing baseline block');
	let state: EditorState = input.start;
	let mapping: Mapping | null = Mapping.empty;
	if (input.during === null) {
		mapping = null;
	} else {
		for (const tr of input.during ?? []) {
			state = state.apply(tr);
			mapping = mapping.appendMapping(tr.mapping);
		}
	}
	const rendered: CompositionSnapshot =
		typeof input.rendered === 'string'
			? { text: input.rendered, caretOffset: null }
			: input.rendered;
	const commit: CompositionCommit = {
		blockId: B1,
		baseline,
		from: input.from,
		to: input.to ?? input.from,
		rendered,
		mapping,
	};
	return { state, result: commitComposedText(state, commit) };
}

function commit(input: CommitInput): EditorState {
	const { state, result } = run(input);
	if (result.kind !== 'commit' || !result.tr) throw new Error('expected a commit transaction');
	return state.apply(result.tr);
}

function text(state: EditorState): string {
	const block = state.getBlock(B1);
	return block ? getBlockText(block) : '';
}

/** Inline children as `text` strings and `$latex` formula entries. */
function inlines(state: EditorState): string[] {
	const block = state.getBlock(B1);
	return (block ? getInlineChildren(block) : []).map((child) =>
		isTextNode(child) ? child.text : `$${String(child.attrs.latex ?? child.inlineType)}`,
	);
}

function hostInsert(state: EditorState, offset: number, value: string): Transaction {
	return state.transaction('api').insertText(B1, offset, value, []).build();
}

describe('commitComposedText', () => {
	it('inserts text composed at the caret', () => {
		const next = commit({ start: helloState(), rendered: 'hellowo', from: 5 });

		expect(text(next)).toBe('hellowo');
		expectCursorAt(next, 'b1', 7);
	});

	it('applies a composing deletion that reached committed text (#257)', () => {
		const next = commit({ start: helloState(), rendered: 'hell', from: 5 });

		expect(text(next)).toBe('hell');
		expectCursorAt(next, 'b1', 4);
	});

	it('keeps committed text when the deletion stayed inside the composition (#230)', () => {
		const next = commit({ start: helloState(), rendered: 'hellow', from: 5 });

		expect(text(next)).toBe('hellow');
	});

	it('replaces a recomposed word instead of duplicating it', () => {
		const next = commit({ start: helloState(), rendered: 'help', from: 5 });

		expect(text(next)).toBe('help');
		expectCursorAt(next, 'b1', 4);
	});

	it('changes nothing when the rendered text already matches the model', () => {
		expect(run({ start: helloState(), rendered: 'hello', from: 5 }).result).toEqual({
			kind: 'commit',
			tr: null,
		});
	});

	it('moves the caret to the rendered caret when the text is unchanged', () => {
		const next = commit({
			start: helloState(),
			rendered: { text: 'hello', caretOffset: 2 },
			from: 5,
		});

		expect(text(next)).toBe('hello');
		expectCursorAt(next, 'b1', 2);
	});

	it('gives composed text the marks stored at the caret', () => {
		const bold = { type: markType('bold') };

		const next = commit({
			start: helloState().withStoredMarks([bold]),
			rendered: 'hellowo',
			from: 5,
		});

		const block = next.getBlock(B1);
		const children = block ? getInlineChildren(block) : [];
		const composed = children.find((child) => isTextNode(child) && child.text === 'wo');
		expect(composed && isTextNode(composed) ? composed.marks : null).toEqual([bold]);
	});

	it('matches spaces the view renders as NBSP and keeps NBSPs stored in the model', () => {
		const start = stateBuilder()
			.paragraph('a\u00a0b ', 'b1')
			.cursor('b1', 4)
			.schema(['paragraph'], [])
			.build();

		const next = commit({ start, rendered: 'a\u00a0b\u00a0c', from: 4 });

		expect(text(next)).toBe('a\u00a0b c');
	});

	it('stores a composed NBSP as a space', () => {
		const next = commit({ start: helloState(), rendered: 'hello\u00a0', from: 5 });

		expect(text(next)).toBe('hello ');
	});

	it('removes an inline node the composition deleted', () => {
		const start = inlineState(
			[createTextNode('a'), createInlineNode(inlineType('hard_break')), createTextNode('b')],
			3,
		);

		const next = commit({ start, rendered: 'ab', from: 3 });

		const block = next.getBlock(B1);
		expect(block ? getInlineChildren(block).some(isInlineNode) : true).toBe(false);
		expect(text(next)).toBe('ab');
	});

	it('keeps the block type when the composition deletes all its text', () => {
		const start = stateBuilder()
			.heading('hi', 'b1', 1)
			.cursor('b1', 2)
			.schema(['paragraph', 'heading'], [])
			.build();

		const next = commit({ start, rendered: '', from: 2 });

		expect(next.getBlock(B1)?.type).toBe('heading');
		expect(text(next)).toBe('');
		expectCursorAt(next, 'b1', 0);
	});

	describe('edits made while composing (#260)', () => {
		it('keeps a host insertion in front of the composition', () => {
			const start = stateBuilder()
				.paragraph('pre post', 'b1')
				.cursor('b1', 8)
				.schema(['paragraph'], [])
				.build();

			const next = commit({
				start,
				rendered: { text: 'pre postx', caretOffset: 9 },
				from: 8,
				during: [hostInsert(start, 0, 'Z')],
			});

			expect(text(next)).toBe('Zpre postx');
			expectCursorAt(next, 'b1', 10);
		});

		it('keeps a host insertion and the inline node in front of the composition', () => {
			const start = inlineState(
				[createTextNode('pre '), formula('F'), createTextNode(' post')],
				10,
			);

			const next = commit({
				start,
				rendered: {
					text: `pre ${PH} postx`,
					caretOffset: 11,
					inlineNodeOrigins: new Map([[4, 4]]),
				},
				from: 10,
				during: [hostInsert(start, 0, 'Z')],
			});

			expect(inlines(next)).toEqual(['Zpre ', '$F', ' postx']);
			expectCursorAt(next, 'b1', 12);
		});

		it('keeps a host insertion behind the composition and the inline node between', () => {
			const start = inlineState([createTextNode('pre '), formula('F'), createTextNode(' post')], 4);

			const next = commit({
				start,
				rendered: {
					text: `pre x${PH} post`,
					caretOffset: 5,
					inlineNodeOrigins: new Map([[5, 4]]),
				},
				from: 4,
				during: [hostInsert(start, 10, 'Z')],
			});

			expect(inlines(next)).toEqual(['pre x', '$F', ' postZ']);
			expectCursorAt(next, 'b1', 5);
		});

		it('keeps the caret in place when the host edit is the only change', () => {
			const start = helloState();

			const next = commit({
				start,
				rendered: { text: 'hello', caretOffset: 5 },
				from: 5,
				during: [hostInsert(start, 0, 'Z')],
			});

			expect(text(next)).toBe('Zhello');
			expectCursorAt(next, 'b1', 6);
		});

		it('reports a conflict when the host edited the range the browser replaced', () => {
			const start = helloState();
			const hostDelete = start.transaction('api').deleteTextAt(B1, 3, 5).build();

			const { result } = run({ start, rendered: 'hellx', from: 5, during: [hostDelete] });

			expect(result).toEqual({ kind: 'conflict' });
		});

		it('reports a conflict when the document was replaced', () => {
			expect(
				run({ start: helloState(), rendered: 'hellowo', from: 5, during: null }).result,
			).toEqual({ kind: 'conflict' });
		});

		it('reports a conflict instead of writing the inline node placeholder as text', () => {
			const start = inlineState([createTextNode('a'), formula('F'), createTextNode('b')], 2);

			const { result } = run({
				start,
				rendered: { text: `a${PH}${PH}b`, caretOffset: 3, inlineNodeOrigins: new Map([[1, 1]]) },
				from: 2,
			});

			expect(result).toEqual({ kind: 'conflict' });
		});
	});

	describe('deletions next to identical units (#261)', () => {
		it('deletes the inline node the browser removed, not its neighbour', () => {
			const start = inlineState(
				[createTextNode('x'), formula('A'), formula('B'), createTextNode('z')],
				2,
			);

			const next = commit({
				start,
				rendered: { text: `x${PH}z`, caretOffset: 1, inlineNodeOrigins: new Map([[1, 2]]) },
				from: 2,
			});

			expect(inlines(next)).toEqual(['x', '$B', 'z']);
		});

		it('deletes a hard break replaced from before a stale composition start', () => {
			// The IME replaced [1, 2) while the model caret still sat at 3, after the formula.
			const start = inlineState(
				[
					createTextNode('a'),
					createInlineNode(inlineType('hard_break')),
					formula('F'),
					createTextNode('y'),
				],
				3,
			);

			const next = commit({
				start,
				rendered: { text: `a${PH}y`, caretOffset: 1, inlineNodeOrigins: new Map([[1, 2]]) },
				from: 3,
			});

			expect(inlines(next)).toEqual(['a', '$F', 'y']);
		});

		it('removes the character in front of a collapsed composition start', () => {
			const bold = { type: markType('bold') };
			const start = stateBuilder()
				.blockWithInlines(
					'paragraph',
					[createTextNode('ab'), createTextNode('b', [bold]), createTextNode('c')],
					'b1',
				)
				.cursor('b1', 2)
				.schema(['paragraph'], ['bold'])
				.build();

			const next = commit({ start, rendered: 'abc', from: 2 });

			const block = next.getBlock(B1);
			const boldText = (block ? getInlineChildren(block) : [])
				.filter((child): child is TextNode => isTextNode(child) && child.marks.length > 0)
				.map((child) => child.text);
			expect(text(next)).toBe('abc');
			expect(boldText).toEqual(['b']);
		});
	});
});
