import { describe, expect, it } from 'vitest';
import { getBlockText } from '../../model/Document.js';
import { createCollapsedSelection } from '../../model/Selection.js';
import { blockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import { type Transaction, invertTransaction } from '../../state/Transaction.js';
import { assertDefined, pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { CodeBlockPlugin } from './CodeBlockPlugin.js';

async function pasteIntoCodeBlock(state: EditorState, text: string): Promise<Transaction | null> {
	const h = await pluginHarness(new CodeBlockPlugin(), state, { builtinSpecs: true });
	const entry = h.pm.getPasteInterceptors().find((i) => i.name === 'code-block:paste');
	assertDefined(entry);
	return entry.interceptor(text, '', state);
}

function expectLiteralPaste(state: EditorState, tr: Transaction | null, text: string): void {
	assertDefined(tr);
	const after: EditorState = state.apply(tr);
	const code = after.getBlock(blockId('code'));
	assertDefined(code);
	expect(getBlockText(code)).toBe(text);
	expect(after.selection).toEqual(createCollapsedSelection(blockId('code'), 3));
	expect(after.apply(invertTransaction(tr)).doc).toEqual(state.doc);
}

describe('code block paste interceptor', () => {
	for (const [direction, anchor, head] of [
		['forward', 1, 4],
		['backward', 4, 1],
	] as const) {
		it(`replaces a ${direction} range at its start (#267)`, async () => {
			// Arrange
			const state: EditorState = stateBuilder()
				.block('code_block', 'abcdef', 'code')
				.selection({ blockId: 'code', offset: anchor }, { blockId: 'code', offset: head })
				.schema(['paragraph', 'code_block'], [])
				.build();

			// Act
			const tr: Transaction | null = await pasteIntoCodeBlock(state, 'XY');

			// Assert
			expectLiteralPaste(state, tr, 'aXYef');
		});
	}

	it('pastes literally where a backward range starts in a code block (#267)', async () => {
		// Arrange: the anchor sits in the paragraph after the code block.
		const state: EditorState = stateBuilder()
			.block('code_block', 'efgh', 'code')
			.paragraph('ijkl', 'p2')
			.selection({ blockId: 'p2', offset: 2 }, { blockId: 'code', offset: 1 })
			.schema(['paragraph', 'code_block'], [])
			.build();

		// Act
		const tr: Transaction | null = await pasteIntoCodeBlock(state, 'XY');

		// Assert
		expectLiteralPaste(state, tr, 'eXYkl');
	});

	it('declines a backward range that starts in a paragraph (#267)', async () => {
		// Arrange: the anchor sits in the code block after the paragraph.
		const state: EditorState = stateBuilder()
			.paragraph('abcd', 'p1')
			.block('code_block', 'efgh', 'code')
			.selection({ blockId: 'code', offset: 2 }, { blockId: 'p1', offset: 1 })
			.schema(['paragraph', 'code_block'], [])
			.build();

		// Act
		const tr: Transaction | null = await pasteIntoCodeBlock(state, 'x\ny');

		// Assert
		expect(tr).toBeNull();
	});

	it('declines a code block selected as a node, which receives no text', async () => {
		// Arrange
		const state: EditorState = stateBuilder()
			.block('code_block', 'efgh', 'code')
			.nodeSelection('code', ['code'])
			.schema(['paragraph', 'code_block'], [])
			.build();

		// Act
		const tr: Transaction | null = await pasteIntoCodeBlock(state, 'XY');

		// Assert
		expect(tr).toBeNull();
	});
});
