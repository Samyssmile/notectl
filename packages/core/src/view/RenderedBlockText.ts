/**
 * Reads the text a leaf block currently renders, in model-offset space.
 *
 * While an IME composition is active the browser edits the composition
 * block's DOM directly and the model is not updated. The rendered text is the
 * only record of those edits when the composition ends.
 */

import { INLINE_NODE_PLACEHOLDER } from '../model/InputRule.js';
import type { BlockId } from '../model/TypeBrands.js';
import {
	ZERO_WIDTH_SPACE,
	createInlineContentWalker,
	isCursorWrapperEl,
	resolveContentRoot,
} from './InlineContentDOM.js';

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
 * @returns The rendered text, or `null` when no element renders the block.
 */
export function readRenderedBlockText(container: HTMLElement, blockId: BlockId): string | null {
	const blockEl: Element | null = container.querySelector(`[data-block-id="${blockId}"]`);
	if (!blockEl) return null;

	const contentRoot: Element = resolveContentRoot(blockEl);
	const walker: TreeWalker = createInlineContentWalker(contentRoot, {
		includeCursorWrapper: true,
	});

	let text = '';
	for (let node: Node | null = walker.nextNode(); node; node = walker.nextNode()) {
		if (node.nodeType !== Node.TEXT_NODE) {
			text += INLINE_NODE_PLACEHOLDER;
			continue;
		}
		const data: string = node.textContent ?? '';
		text += isInCursorWrapper(node, contentRoot) ? data.replaceAll(ZERO_WIDTH_SPACE, '') : data;
	}
	return text;
}

/** Whether `node` lies inside the IME cursor wrapper below `root`. */
function isInCursorWrapper(node: Node, root: Element): boolean {
	for (let el: Element | null = node.parentElement; el && el !== root; el = el.parentElement) {
		if (isCursorWrapperEl(el)) return true;
	}
	return false;
}
