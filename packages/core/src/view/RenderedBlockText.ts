/**
 * Reads the text a leaf block currently renders, in model-offset space.
 *
 * While an IME composition is active the browser edits the composition
 * block's DOM directly and the model is not updated. The rendered text is the
 * only record of those edits when the composition ends.
 */

import type { CompositionSnapshot } from '../model/CompositionState.js';
import { INLINE_NODE_PLACEHOLDER } from '../model/InputRule.js';
import type { BlockId } from '../model/TypeBrands.js';
import {
	ZERO_WIDTH_SPACE,
	createInlineContentWalker,
	isCursorWrapperEl,
	resolveContentRoot,
} from './InlineContentDOM.js';
import { getSelection, readDOMSelectionEndpoints } from './SelectionSync.js';

/**
 * Returns the rendered inline content of block `blockId`: text nodes verbatim,
 * one {@link INLINE_NODE_PLACEHOLDER} per inline node element, nothing for view
 * chrome (widgets, placeholder `<br>`s, nested blocks). Text inside the IME
 * cursor wrapper is included without the wrapper's zero-width space, because
 * the browser composes into the wrapper.
 *
 * Indices into the result are model offsets as long as the DOM still mirrors
 * the model. After a composition they are offsets of the edited text.
 *
 * @returns The rendered text and collapsed caret, or `null` when no element renders the block.
 */
export function readCompositionSnapshot(
	container: HTMLElement,
	blockId: BlockId,
): CompositionSnapshot | null {
	const blockEl = container.querySelector(`[data-block-id="${blockId}"]`);
	if (!blockEl) return null;
	const contentRoot = resolveContentRoot(blockEl);
	return readInlineContent(contentRoot, rangeBeforeCaret(container, contentRoot));
}

/** Returns the prefix ending at a collapsed caret inside this block's content. */
function rangeBeforeCaret(container: HTMLElement, contentRoot: Element): Range | null {
	const selection = getSelection();
	const endpoints = selection && readDOMSelectionEndpoints(container, selection);
	if (!endpoints) return null;
	const { anchorNode, anchorOffset, focusNode, focusOffset } = endpoints;
	if (
		anchorNode !== focusNode ||
		anchorOffset !== focusOffset ||
		!contentRoot.contains(anchorNode)
	) {
		return null;
	}
	const range = document.createRange();
	range.setStart(contentRoot, 0);
	range.setEnd(anchorNode, anchorOffset);
	return range;
}

/** Captures text and caret in one walk, including IME wrappers but excluding their placeholder. */
function readInlineContent(contentRoot: Element, beforeCaret: Range | null): CompositionSnapshot {
	const walker: TreeWalker = createInlineContentWalker(contentRoot, { includeCursorWrapper: true });
	let text = '';
	let caretOffset = beforeCaret ? 0 : null;
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const data =
			node.nodeType === Node.TEXT_NODE ? (node.textContent ?? '') : INLINE_NODE_PLACEHOLDER;
		const inWrapper = isInCursorWrapper(node, contentRoot);
		if (beforeCaret?.isPointInRange(node, 0)) {
			const prefix =
				beforeCaret.endContainer === node ? data.slice(0, beforeCaret.endOffset) : data;
			caretOffset =
				text.length + (inWrapper ? prefix.replaceAll(ZERO_WIDTH_SPACE, '') : prefix).length;
		}
		text += inWrapper ? data.replaceAll(ZERO_WIDTH_SPACE, '') : data;
	}
	return { text, caretOffset };
}

/** Whether `node` lies inside the IME cursor wrapper below `root`. */
function isInCursorWrapper(node: Node, root: Element): boolean {
	for (let el: Element | null = node.parentElement; el && el !== root; el = el.parentElement) {
		if (isCursorWrapperEl(el)) return true;
	}
	return false;
}
