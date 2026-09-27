/**
 * Commits an IME composition from the text the browser rendered for the
 * composition block.
 *
 * During a composition the browser owns the composition block's DOM and the
 * model is not updated. Besides inserting the composed text, the browser may
 * delete committed text in front of the composition start (#257) or recompose
 * an existing word. Reading the rendered text back and applying the difference
 * captures every such edit, where inserting the composed string at the model
 * caret would lose or duplicate text.
 */

import { getBlockOffsetText } from '../model/BlockOffsetText.js';
import { isLeafBlock } from '../model/Document.js';
import { createCollapsedSelection, createSelection } from '../model/Selection.js';
import { type TextChange, findTextChange } from '../model/TextChange.js';
import type { BlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { insertTextCommand } from './Commands.js';

const NBSP = ' ';

/**
 * Builds the transaction that makes the model block `blockId` match
 * `renderedText`, the block's rendered inline content in model-offset space.
 *
 * The view renders some spaces as non-breaking spaces to keep them visible,
 * so a space and an NBSP compare as equal. Unchanged text always comes from
 * the model, which keeps NBSPs stored in the document; the changed text maps
 * NBSP back to a space.
 *
 * @param state - The state the composition started from.
 * @param blockId - The leaf block the composition happened in.
 * @param renderedText - The block's rendered text after the composition.
 * @param compositionStart - Model offset where the composition started; it
 *   decides where the change goes when repeated characters make it ambiguous.
 * @returns The commit transaction, or `null` when the block is unknown, not a
 *   leaf, or already matches the rendered text.
 */
export function commitComposedText(
	state: EditorState,
	blockId: BlockId,
	renderedText: string,
	compositionStart: number,
): Transaction | null {
	const block = state.getBlock(blockId);
	if (!block || !isLeafBlock(block)) return null;

	const change: TextChange | null = findTextChange(
		getBlockOffsetText(block),
		renderedText,
		compositionStart,
		isSameRenderedChar,
	);
	if (!change) return null;

	const text: string = change.text.replaceAll(NBSP, ' ');
	if (text.length > 0) {
		const target: EditorState = state.withSelection(
			createSelection({ blockId, offset: change.from }, { blockId, offset: change.to }),
		);
		return insertTextCommand(target, text, 'input');
	}
	return state
		.transaction('input')
		.deleteTextAt(blockId, change.from, change.to)
		.setSelection(createCollapsedSelection(blockId, change.from))
		.build();
}

/** Character equality in which a space matches the NBSP the view may render for it. */
function isSameRenderedChar(modelChar: string, renderedChar: string): boolean {
	if (modelChar === renderedChar) return true;
	return modelChar === ' ' && renderedChar === NBSP;
}
