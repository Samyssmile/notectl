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

/** Model offset each inline node element rendered at when its block was captured. */
export type InlineNodeOrigins = WeakMap<Element, number>;

/** One DOM node of a block's inline content, with the text it contributes. */
interface RenderedUnit {
	readonly node: Node;
	/** Raw text: the text node's data, or one placeholder for an inline node element. */
	readonly data: string;
	/** Whether the node lies inside the IME cursor wrapper, whose zero-width space is not content. */
	readonly inWrapper: boolean;
}

/**
 * Records the model offset of every inline node element block `blockId`
 * renders. Capture it when a composition starts, while the DOM still mirrors
 * the model, so {@link readCompositionSnapshot} can later tell which inline
 * nodes survived: to the text diff they are otherwise identical placeholders.
 */
export function captureInlineNodeOrigins(
	container: HTMLElement,
	blockId: BlockId,
): InlineNodeOrigins {
	const origins: InlineNodeOrigins = new WeakMap();
	const contentRoot: Element | null = findContentRoot(container, blockId);
	if (!contentRoot) return origins;
	let offset = 0;
	for (const unit of renderedUnits(contentRoot)) {
		if (unit.node instanceof Element) origins.set(unit.node, offset);
		offset += contentText(unit).length;
	}
	return origins;
}

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
 * @param origins - Inline node offsets captured when the composition started;
 *   when given, the snapshot reports where each surviving inline node came from.
 * @returns The rendered text and collapsed caret, or `null` when no element renders the block.
 */
export function readCompositionSnapshot(
	container: HTMLElement,
	blockId: BlockId,
	origins?: InlineNodeOrigins,
): CompositionSnapshot | null {
	const contentRoot: Element | null = findContentRoot(container, blockId);
	if (!contentRoot) return null;
	return readInlineContent(contentRoot, rangeBeforeCaret(container, contentRoot), origins);
}

function findContentRoot(container: HTMLElement, blockId: BlockId): Element | null {
	const blockEl: Element | null = container.querySelector(`[data-block-id="${blockId}"]`);
	return blockEl ? resolveContentRoot(blockEl) : null;
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

/** Captures text, caret and inline node origins in one walk. */
function readInlineContent(
	contentRoot: Element,
	beforeCaret: Range | null,
	origins: InlineNodeOrigins | undefined,
): CompositionSnapshot {
	let text = '';
	let caretOffset: number | null = beforeCaret ? 0 : null;
	const inlineNodeOrigins: Map<number, number> | undefined = origins ? new Map() : undefined;
	for (const unit of renderedUnits(contentRoot)) {
		const { node, data } = unit;
		if (beforeCaret?.isPointInRange(node, 0)) {
			const prefix: string =
				beforeCaret.endContainer === node ? data.slice(0, beforeCaret.endOffset) : data;
			caretOffset = text.length + contentText({ ...unit, data: prefix }).length;
		}
		const origin: number | undefined = node instanceof Element ? origins?.get(node) : undefined;
		if (origin !== undefined) inlineNodeOrigins?.set(text.length, origin);
		text += contentText(unit);
	}
	return inlineNodeOrigins ? { text, caretOffset, inlineNodeOrigins } : { text, caretOffset };
}

/** Walks the text nodes and inline node elements of a block's content, including IME wrappers. */
function* renderedUnits(contentRoot: Element): Generator<RenderedUnit> {
	const walker: TreeWalker = createInlineContentWalker(contentRoot, { includeCursorWrapper: true });
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		yield {
			node,
			data: node.nodeType === Node.TEXT_NODE ? (node.textContent ?? '') : INLINE_NODE_PLACEHOLDER,
			inWrapper: isInCursorWrapper(node, contentRoot),
		};
	}
}

/** The text a unit contributes to the block: its data without the cursor wrapper's placeholder. */
function contentText(unit: RenderedUnit): string {
	return unit.inWrapper ? unit.data.replaceAll(ZERO_WIDTH_SPACE, '') : unit.data;
}

/** Whether `node` lies inside the IME cursor wrapper below `root`. */
function isInCursorWrapper(node: Node, root: Element): boolean {
	for (let el: Element | null = node.parentElement; el && el !== root; el = el.parentElement) {
		if (isCursorWrapperEl(el)) return true;
	}
	return false;
}
