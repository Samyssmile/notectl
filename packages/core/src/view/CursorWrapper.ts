/**
 * CursorWrapper: creates a temporary mark-wrapped DOM element during IME
 * composition so that composed text inherits the stored marks (e.g. bold).
 *
 * Without this, toggling Bold with a collapsed cursor and then starting an
 * IME composition would produce unformatted text because the browser has no
 * formatted DOM node to compose into.
 *
 * The wrapper is a `<span data-cursor-wrapper>` containing a zero-width space
 * (`\u200B`), nested inside mark elements matching the stored marks.
 */

import type { Mark } from '../model/Document.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { isCollapsed, isGapCursor, isNodeSelection } from '../model/Selection.js';
import type { EditorState } from '../state/EditorState.js';
import { createMarkElement, getMarkRank } from './MarkRendering.js';
import { getSelection } from './SelectionSync.js';

const ZWS = '\u200B';
const CURSOR_WRAPPER_ATTR = 'data-cursor-wrapper';

export class CursorWrapper {
	private wrapperElement: HTMLElement | null = null;
	private readonly container: HTMLElement;
	private readonly registry: SchemaRegistry | undefined;

	constructor(container: HTMLElement, registry?: SchemaRegistry) {
		this.container = container;
		this.registry = registry;
	}

	/** Whether a cursor wrapper is currently in the DOM. */
	get isActive(): boolean {
		return this.wrapperElement !== null;
	}

	/**
	 * Creates a mark-wrapped cursor element if storedMarks are present.
	 * Places the browser cursor inside the ZWS text node so that IME
	 * composition inherits the mark formatting.
	 */
	onCompositionStart(state: EditorState): void {
		this.cleanup();

		const marks: readonly Mark[] | null = state.storedMarks;
		if (!marks || marks.length === 0) return;

		const sel = state.selection;
		if (isNodeSelection(sel) || isGapCursor(sel)) return;
		if (!isCollapsed(sel)) return;

		// Build the wrapper: <span data-cursor-wrapper>ZWS</span>
		const wrapper: HTMLElement = document.createElement('span');
		wrapper.setAttribute(CURSOR_WRAPPER_ATTR, '');
		const textNode: Text = document.createTextNode(ZWS);

		// Wrap the text node in sorted mark elements (innermost → outermost)
		let current: Node = textNode;
		const sortedMarks: readonly Mark[] = [...marks].sort(
			(a, b) => getMarkRank(a, this.registry) - getMarkRank(b, this.registry),
		);

		for (let i: number = sortedMarks.length - 1; i >= 0; i--) {
			const mark: Mark | undefined = sortedMarks[i];
			if (!mark) continue;
			const el: HTMLElement = createMarkElement(mark, this.registry);
			el.appendChild(current);
			current = el;
		}

		wrapper.appendChild(current);

		// Insert at the current DOM cursor position
		const domSel: globalThis.Selection | null = getSelection(this.container);
		if (!domSel || domSel.rangeCount === 0) return;

		const range: Range = domSel.getRangeAt(0);
		range.insertNode(wrapper);

		// Place browser cursor inside the ZWS text node
		try {
			domSel.collapse(textNode, textNode.length);
		} catch {
			// May fail in test environments
		}

		this.wrapperElement = wrapper;
	}

	/** Removes the wrapper element from the DOM. */
	cleanup(): void {
		if (!this.wrapperElement) return;
		this.wrapperElement.remove();
		this.wrapperElement = null;
	}
}
