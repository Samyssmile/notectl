import { describe, expect, it } from 'vitest';
import type { CompositionState } from '../../model/CompositionState.js';
import { getBlockText } from '../../model/Document.js';
import type { EditorState } from '../../state/EditorState.js';
import { stateBuilder } from '../../test/TestUtils.js';
import { AutoPairController } from './AutoPairController.js';
import type { ResolvedPairingConfig } from './CodeBlockTypes.js';
import { DEFAULT_INDENT } from './CodeBlockTypes.js';

const IDLE_COMPOSITION: CompositionState = { isComposing: false, activeBlockId: null };

const ALWAYS_PAIRING: ResolvedPairingConfig = {
	brackets: 'always',
	quotes: 'always',
	overtype: true,
	deletePair: true,
	surround: 'brackets',
};

function makeController(
	overrides: Partial<Parameters<typeof createDeps>[0]> = {},
): AutoPairController {
	return new AutoPairController(createDeps(overrides));
}

function createDeps(overrides: {
	readonly composing?: boolean;
	readonly pairing?: ResolvedPairingConfig;
}) {
	return {
		resolvedIndent: DEFAULT_INDENT,
		resolvedPairing: overrides.pairing ?? ALWAYS_PAIRING,
		getTokenAt: () => undefined,
		getCompositionState: (): CompositionState =>
			overrides.composing ? { isComposing: true, activeBlockId: null } : IDLE_COMPOSITION,
	};
}

function codeBlockState(text = ''): EditorState {
	return stateBuilder()
		.block('code_block', text, 'b1', { attrs: { language: 'typescript' } })
		.cursor('b1', text.length)
		.schema(['paragraph', 'code_block'], [])
		.build();
}

describe('AutoPairController', () => {
	it('auto-pairs an opening bracket and tracks the close in post-transaction space', () => {
		const controller = makeController();
		const state = codeBlockState('');

		const tr = controller.handleTextInput('(', state);
		expect(tr).not.toBeNull();
		if (!tr) return;

		// The push is only queued by the interceptor — the stack stays untouched
		// until the transaction has actually been applied.
		expect(controller.pairStack.size).toBe(0);

		const newState = state.apply(tr);
		expect(getBlockText(newState.doc.children[0])).toBe('()');

		// syncOnStateChange migrates first, then applies the queued post-transaction
		// push, so the close char at offset 1 becomes tracked.
		controller.syncOnStateChange(newState, tr);
		expect(controller.pairStack.sizeForBlock(newState.selection.anchor.blockId)).toBe(1);
	});

	it('overtypes a tracked close char and consumes the tracked entry', () => {
		const controller = makeController();

		// Cycle 1: type '(' → '()', cursor between, close tracked at offset 1.
		const open = codeBlockState('');
		const tr1 = controller.handleTextInput('(', open);
		if (!tr1) throw new Error('expected auto-pair transaction');
		const afterOpen = open.apply(tr1);
		controller.syncOnStateChange(afterOpen, tr1);
		expect(controller.pairStack.sizeForBlock(afterOpen.selection.anchor.blockId)).toBe(1);

		// Cycle 2: typing ')' at the tracked position overtypes instead of inserting.
		const tr2 = controller.handleTextInput(')', afterOpen);
		expect(tr2).not.toBeNull();
		if (!tr2) return;
		const afterClose = afterOpen.apply(tr2);

		// No duplicate close char was inserted; cursor moved past the close.
		expect(getBlockText(afterClose.doc.children[0])).toBe('()');
		expect(afterClose.selection.anchor.offset).toBe(2);

		// The take (pre-transaction space) survives migration and clears the entry.
		controller.syncOnStateChange(afterClose, tr2);
		expect(controller.pairStack.sizeForBlock(afterClose.selection.anchor.blockId)).toBe(0);
	});

	it('does not pair while an IME composition is active', () => {
		const controller = makeController({ composing: true });
		expect(controller.handleTextInput('(', codeBlockState(''))).toBeNull();
	});

	it('ignores input outside a code block', () => {
		const controller = makeController();
		const state = stateBuilder()
			.paragraph('hello', 'b1')
			.cursor('b1', 5)
			.schema(['paragraph', 'code_block'], [])
			.build();
		expect(controller.handleTextInput('(', state)).toBeNull();
	});

	it('clear() drops tracked pairs', () => {
		const controller = makeController();
		const state = codeBlockState('');
		const tr = controller.handleTextInput('(', state);
		if (!tr) throw new Error('expected auto-pair transaction');
		const next = state.apply(tr);
		controller.syncOnStateChange(next, tr);
		expect(controller.pairStack.size).toBe(1);

		controller.clear();
		expect(controller.pairStack.size).toBe(0);
	});
});
