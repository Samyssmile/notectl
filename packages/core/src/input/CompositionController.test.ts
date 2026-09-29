import { type Mock, describe, expect, it, vi } from 'vitest';
import type { CompositionSnapshot } from '../model/CompositionState.js';
import { getBlockText } from '../model/Document.js';
import { createCollapsedSelection } from '../model/Selection.js';
import { type BlockId, blockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { stateBuilder } from '../test/TestUtils.js';
import { CompositionController, type CompositionDOM } from './CompositionController.js';
import { CompositionTracker } from './CompositionTracker.js';

const B1: BlockId = blockId('b1');

interface Harness {
	readonly controller: CompositionController;
	readonly tracker: CompositionTracker;
	readonly dispatch: Mock<(tr: Transaction) => void>;
	readonly getState: () => EditorState;
	readonly readBlock: Mock<(id: BlockId) => CompositionSnapshot | null>;
	readonly restoreBlock: Mock<(id: BlockId) => void>;
	/** Applies `tr` while composing, reporting it to the controller as the view does. */
	applyMeanwhile(tr: Transaction): void;
	text(id?: string): string;
}

interface HarnessOptions {
	readonly state?: EditorState;
	/** What the view renders for the composition block at `compositionend`. */
	readonly rendered?: string | null;
	readonly withDOM?: boolean;
	readonly caretOffset?: number | null;
	readonly readOnly?: boolean;
	/** Simulates middleware that drops the commit transaction. */
	readonly dropCommits?: boolean;
}

function helloState(): EditorState {
	return stateBuilder()
		.paragraph('hello', 'b1')
		.paragraph('world', 'b2')
		.cursor('b1', 5)
		.schema(['paragraph'], [])
		.build();
}

function harness(options: HarnessOptions = {}): Harness {
	let state: EditorState = options.state ?? helloState();
	const tracker = new CompositionTracker();
	const dispatch = vi.fn((tr: Transaction) => {
		if (!options.dropCommits) state = state.apply(tr);
	});
	const readBlock = vi.fn((_id: BlockId) =>
		options.rendered == null
			? null
			: { text: options.rendered, caretOffset: options.caretOffset ?? null },
	);
	const restoreBlock = vi.fn((_id: BlockId) => {});
	const compositionDOM: CompositionDOM = { readBlock, restoreBlock };
	const controller = new CompositionController({
		getState: () => state,
		dispatch,
		isReadOnly: () => options.readOnly ?? false,
		tracker,
		compositionDOM: options.withDOM === false ? undefined : compositionDOM,
	});
	return {
		controller,
		getState: () => state,
		tracker,
		dispatch,
		readBlock,
		restoreBlock,
		applyMeanwhile: (tr) => {
			const oldState: EditorState = state;
			state = state.apply(tr);
			controller.onStateChange(oldState, state, tr);
		},
		text: (id = 'b1') => {
			const block = state.getBlock(blockId(id));
			return block ? getBlockText(block) : '';
		},
	};
}

describe('CompositionController', () => {
	it('tracks the composition block while composing', () => {
		const h = harness({ rendered: 'hellowo' });

		h.controller.start();
		expect(h.tracker.isComposing).toBe(true);
		expect(h.tracker.activeBlockId).toBe(B1);

		h.controller.end('wo');
		expect(h.tracker.isComposing).toBe(false);
	});

	it('commits the composed text from the rendered block', () => {
		const h = harness({ rendered: 'hellowo' });

		h.controller.start();
		h.controller.end('wo');

		expect(h.readBlock).toHaveBeenCalledWith(B1);
		expect(h.text()).toBe('hellowo');
		expect(h.restoreBlock).not.toHaveBeenCalled();
	});

	it('applies a composing deletion that reached committed text (#257)', () => {
		const h = harness({ rendered: 'hell' });

		h.controller.start();
		h.controller.end('');

		expect(h.dispatch).toHaveBeenCalledOnce();
		expect(h.text()).toBe('hell');
	});

	it('keeps committed text when Backspace only edited the composition (#230)', () => {
		const h = harness({ rendered: 'hellow' });

		h.controller.start();
		h.controller.end('w');

		expect(h.text()).toBe('hellow');
	});

	it('does not duplicate a recomposed word', () => {
		const h = harness({ rendered: 'help' });

		h.controller.start();
		h.controller.end('help');

		expect(h.text()).toBe('help');
	});

	it('restores the block instead of inserting when the rendered text is unchanged', () => {
		// A recomposed word committed unchanged: inserting `hello` would duplicate it.
		const h = harness({ rendered: 'hello' });

		h.controller.start();
		h.controller.end('hello');

		expect(h.dispatch).not.toHaveBeenCalled();
		expect(h.restoreBlock).toHaveBeenCalledWith(B1);
		expect(h.text()).toBe('hello');
	});

	it('restores the block without a second commit after insertFromComposition', () => {
		const h = harness({ rendered: 'hellowo' });

		h.controller.start();
		h.controller.markCommitHandled();
		h.controller.end('wo');

		expect(h.dispatch).not.toHaveBeenCalled();
		expect(h.readBlock).not.toHaveBeenCalled();
		expect(h.restoreBlock).toHaveBeenCalledWith(B1);
	});

	it('inserts the composed text at the caret without DOM access', () => {
		const h = harness({ withDOM: false });

		h.controller.start();
		h.controller.end('wo');

		expect(h.text()).toBe('hellowo');
	});

	it('inserts the composed text at the caret when the block is not rendered', () => {
		const h = harness({ rendered: null });

		h.controller.start();
		h.controller.end('wo');

		expect(h.text()).toBe('hellowo');
		expect(h.restoreBlock).not.toHaveBeenCalled();
	});

	it('replaces a multi-block selection with the composed text', () => {
		const state: EditorState = stateBuilder()
			.paragraph('hello', 'b1')
			.paragraph('world', 'b2')
			.selection({ blockId: 'b1', offset: 2 }, { blockId: 'b2', offset: 3 })
			.schema(['paragraph'], [])
			.build();
		const h = harness({ state, rendered: 'irrelevant' });

		h.controller.start();
		h.controller.end('X');

		expect(h.readBlock).not.toHaveBeenCalled();
		expect(h.text()).toBe('heXld');
	});

	it.each(['cart', 'cat'])('keeps the final caret after recomposing cat as %s', (rendered) => {
		const state = stateBuilder()
			.paragraph('cat', 'b1')
			.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 3 })
			.schema(['paragraph'], [])
			.build();
		const h = harness({ state, rendered, caretOffset: rendered.length });
		h.controller.start();
		h.controller.end(rendered);
		expect(h.text()).toBe(rendered);
		expect(h.getState().selection).toEqual(createCollapsedSelection(B1, rendered.length));
		if (rendered === 'cat') expect(h.restoreBlock).toHaveBeenCalledWith(B1);
	});

	it('places the commit through edits applied while composing (#260)', () => {
		const h = harness({ rendered: 'hellowo', caretOffset: 7 });

		h.controller.start();
		h.applyMeanwhile(h.getState().transaction('api').insertText(B1, 0, 'Z', []).build());
		h.controller.end('wo');

		expect(h.text()).toBe('Zhellowo');
		expect(h.getState().selection).toEqual(createCollapsedSelection(B1, 8));
		expect(h.restoreBlock).not.toHaveBeenCalled();
	});

	it('re-renders the composition block when the commit lands in another block', () => {
		const h = harness({ rendered: 'hellowo', caretOffset: 7 });

		h.controller.start();
		h.applyMeanwhile(h.getState().transaction('api').splitBlock(B1, 2, blockId('b3')).build());
		h.controller.end('wo');

		expect([h.text(), h.text('b3')]).toEqual(['he', 'llowo']);
		expect(h.restoreBlock).toHaveBeenCalledWith(B1);
	});

	it('re-renders the composition block when the commit is not applied', () => {
		const h = harness({ rendered: 'hellowo', dropCommits: true });

		h.controller.start();
		h.controller.end('wo');

		expect(h.dispatch).toHaveBeenCalledOnce();
		expect(h.text()).toBe('hello');
		expect(h.restoreBlock).toHaveBeenCalledWith(B1);
	});

	it('changes nothing in read-only mode', () => {
		const h = harness({ rendered: 'hell', readOnly: true });

		h.controller.start();
		h.controller.end('');

		expect(h.dispatch).not.toHaveBeenCalled();
		expect(h.tracker.isComposing).toBe(false);
	});
});
