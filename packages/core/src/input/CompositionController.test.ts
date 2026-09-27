import { type Mock, describe, expect, it, vi } from 'vitest';
import { getBlockText } from '../model/Document.js';
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
	readonly readBlockText: Mock<(id: BlockId) => string | null>;
	readonly restoreBlock: Mock<(id: BlockId) => void>;
	text(id?: string): string;
}

interface HarnessOptions {
	readonly state?: EditorState;
	/** What the view renders for the composition block at `compositionend`. */
	readonly rendered?: string | null;
	readonly withDOM?: boolean;
	readonly readOnly?: boolean;
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
		state = state.apply(tr);
	});
	const readBlockText = vi.fn((_id: BlockId) => options.rendered ?? null);
	const restoreBlock = vi.fn((_id: BlockId) => {});
	const compositionDOM: CompositionDOM = { readBlockText, restoreBlock };
	const controller = new CompositionController({
		getState: () => state,
		dispatch,
		isReadOnly: () => options.readOnly ?? false,
		tracker,
		compositionDOM: options.withDOM === false ? undefined : compositionDOM,
	});
	return {
		controller,
		tracker,
		dispatch,
		readBlockText,
		restoreBlock,
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

		expect(h.readBlockText).toHaveBeenCalledWith(B1);
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
		expect(h.readBlockText).not.toHaveBeenCalled();
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

		expect(h.readBlockText).not.toHaveBeenCalled();
		expect(h.text()).toBe('heXld');
	});

	it('changes nothing in read-only mode', () => {
		const h = harness({ rendered: 'hell', readOnly: true });

		h.controller.start();
		h.controller.end('');

		expect(h.dispatch).not.toHaveBeenCalled();
		expect(h.tracker.isComposing).toBe(false);
	});
});
