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
	readonly captureBlock: Mock<(id: BlockId) => void>;
	/** Applies a transaction from outside the composition, as a host or collaborator would. */
	external(tr: Transaction): void;
	/** Replaces the state without steps, as `setJSON` does. */
	replace(next: EditorState): void;
	text(id?: string): string;
}

interface HarnessOptions {
	readonly state?: EditorState;
	/** What the view renders for the composition block at `compositionend`. */
	readonly rendered?: string | null;
	readonly withDOM?: boolean;
	readonly caretOffset?: number | null;
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
	const readBlock = vi.fn((_id: BlockId) =>
		options.rendered == null
			? null
			: { text: options.rendered, caretOffset: options.caretOffset ?? null },
	);
	const restoreBlock = vi.fn((_id: BlockId) => {});
	const captureBlock = vi.fn((_id: BlockId) => {});
	const compositionDOM: CompositionDOM = { captureBlock, readBlock, restoreBlock };
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
		captureBlock,
		external: (tr: Transaction) => {
			const oldState: EditorState = state;
			state = state.apply(tr);
			controller.observeStateChange(oldState, state, tr);
		},
		replace: (next: EditorState) => {
			const oldState: EditorState = state;
			state = next;
			controller.observeStateChange(oldState, next, next.transaction('api').build());
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

	it('captures the composition block when the composition starts', () => {
		const h = harness({ rendered: 'hellowo' });

		h.controller.start();

		expect(h.captureBlock).toHaveBeenCalledWith(B1);
	});

	it('keeps a transaction applied while composing and adds the composed text (#260)', () => {
		const h = harness({ rendered: 'hellowo', caretOffset: 7 });

		h.controller.start();
		h.external(h.getState().transaction('api').insertText(B1, 0, 'Z', []).build());
		h.controller.end('wo');

		expect(h.text()).toBe('Zhellowo');
		expect(h.getState().selection).toEqual(createCollapsedSelection(B1, 8));
	});

	it('rebuilds the block when only a transaction applied while composing changed it (#260)', () => {
		const h = harness({ rendered: 'hello', caretOffset: 5 });

		h.controller.start();
		h.external(h.getState().transaction('api').insertText(B1, 0, 'Z', []).build());
		h.controller.end('');

		expect(h.text()).toBe('Zhello');
		expect(h.restoreBlock).toHaveBeenCalledWith(B1);
	});

	it('keeps a document replaced while composing and inserts the composed text at the caret (#260)', () => {
		const h = harness({ rendered: 'hellowo' });
		const replacement: EditorState = stateBuilder()
			.paragraph('NEW CONTENT', 'b1')
			.cursor('b1', 11)
			.schema(['paragraph'], [])
			.build();

		h.controller.start();
		h.replace(replacement);
		h.controller.end('wo');

		expect(h.text()).toBe('NEW CONTENTwo');
		expect(h.restoreBlock).toHaveBeenCalledWith(B1);
	});

	it('rebuilds the block when a conflict leaves no composed text to insert (#260)', () => {
		const h = harness({ rendered: 'hell' });
		const replacement: EditorState = stateBuilder()
			.paragraph('NEW', 'b1')
			.cursor('b1', 3)
			.schema(['paragraph'], [])
			.build();

		h.controller.start();
		h.replace(replacement);
		h.controller.end('');

		expect(h.dispatch).not.toHaveBeenCalled();
		expect(h.text()).toBe('NEW');
		expect(h.restoreBlock).toHaveBeenCalledWith(B1);
	});

	it('keeps positions when a stepless replace left the composition block unchanged (#260)', () => {
		// setJSON(getJSON()) or a host sync that only changed another block.
		const h = harness({ rendered: 'help' });
		const synced: EditorState = stateBuilder()
			.paragraph('hello', 'b1')
			.paragraph('WORLD', 'b2')
			.cursor('b1', 5)
			.schema(['paragraph'], [])
			.build();

		h.controller.start();
		h.replace(synced);
		h.controller.end('help');

		expect(h.text()).toBe('help');
		expect(h.text('b2')).toBe('WORLD');
	});

	it('reports a composition whose block was removed (#265)', () => {
		const h = harness({ rendered: 'hellowo' });
		const state: EditorState = h.getState();
		h.controller.start();

		const removal: Transaction = state.transaction('api').removeNode([], 0).build();

		expect(h.controller.observeStateChange(state, state.apply(removal), removal)).toBe(true);
	});

	it('does not report a composition whose block stayed in place (#265)', () => {
		const h = harness({ rendered: 'hellowo' });
		const state: EditorState = h.getState();
		h.controller.start();

		const edit: Transaction = state
			.transaction('api')
			.insertText(blockId('b2'), 0, 'Z', [])
			.build();

		expect(h.controller.observeStateChange(state, state.apply(edit), edit)).toBe(false);
	});

	it('ignores state changes after the composition ended', () => {
		const h = harness({ rendered: 'hellowo' });

		h.controller.start();
		h.controller.end('wo');
		h.replace(helloState());
		h.controller.start();
		h.controller.end('wo');

		expect(h.text()).toBe('hellowo');
	});

	it('changes nothing in read-only mode', () => {
		const h = harness({ rendered: 'hell', readOnly: true });

		h.controller.start();
		h.controller.end('');

		expect(h.dispatch).not.toHaveBeenCalled();
		expect(h.tracker.isComposing).toBe(false);
	});
});
