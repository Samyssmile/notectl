/**
 * EditorViewNavigation: handles arrow-key navigation including
 * cross-block movement, InlineNode skipping, and vertical goalColumn.
 */

import type { KeymapRegistry } from '../model/KeymapRegistry.js';
import {
	isCollapsed,
	isGapCursor,
	isNodeSelection,
	isTextSelection,
	selectionsEqual,
} from '../model/Selection.js';
import { getTextDirection } from '../platform/Platform.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import {
	type CaretDirection,
	endOfTextblock,
	getCaretRectFromSelection,
	navigateAcrossBlocks,
	navigateVerticalWithGoalColumn,
	skipInlineNode,
} from './CaretNavigation.js';
import { readSelectionFromDOM, syncSelectionToDOM } from './SelectionSync.js';

export interface NavigationHandlerDeps {
	readonly contentElement: HTMLElement;
	readonly getState: () => EditorState;
	readonly dispatch: (tr: Transaction) => void;
	readonly keymapRegistry?: KeymapRegistry;
}

export class EditorViewNavigation {
	private readonly deps: NavigationHandlerDeps;
	private navigationKeymap: Record<string, () => boolean> | null = null;
	private goalColumn: number | null = null;
	private preserveGoalColumn = false;

	constructor(deps: NavigationHandlerDeps) {
		this.deps = deps;
		this.registerKeymaps();
	}

	/**
	 * Resets goalColumn after an update unless vertical navigation
	 * is in progress.
	 */
	resetAfterUpdate(): void {
		if (!this.preserveGoalColumn) {
			this.goalColumn = null;
		}
	}

	/** Clears goalColumn unconditionally (e.g. on mousedown). */
	clearGoalColumn(): void {
		this.goalColumn = null;
	}

	/** Removes navigation keymaps from the registry. */
	destroy(): void {
		if (this.navigationKeymap && this.deps.keymapRegistry) {
			this.deps.keymapRegistry.removeKeymap(this.navigationKeymap);
			this.navigationKeymap = null;
		}
	}

	/** Registers arrow-key keymaps with navigation priority. */
	private registerKeymaps(): void {
		if (!this.deps.keymapRegistry) return;

		const directions: Record<string, CaretDirection> = {
			ArrowLeft: 'left',
			ArrowRight: 'right',
			ArrowUp: 'up',
			ArrowDown: 'down',
		};

		const keymap: Record<string, () => boolean> = {};
		for (const [key, dir] of Object.entries(directions)) {
			keymap[key] = () => this.handleArrow(dir);
		}

		this.navigationKeymap = keymap;
		this.deps.keymapRegistry.registerKeymap(keymap, {
			priority: 'navigation',
		});
	}

	/** Handles a navigation arrow key at textblock boundaries. */
	private handleArrow(direction: CaretDirection): boolean {
		const state: EditorState = this.deps.getState();

		if (isNodeSelection(state.selection)) return false;
		if (isGapCursor(state.selection)) return false;
		if (!isCollapsed(state.selection)) return false;

		if (direction === 'left' || direction === 'right') {
			return this.handleHorizontalArrow(direction);
		}
		return this.handleVerticalArrow(direction);
	}

	/** Handles horizontal arrow: InlineNode skip + cross-block. */
	private handleHorizontalArrow(direction: 'left' | 'right'): boolean {
		this.goalColumn = null;
		const state: EditorState = this.deps.getState();
		const logical: 'left' | 'right' = this.resolveLogicalDirection(state, direction);

		const inlineSkipTr: Transaction | null = skipInlineNode(state, logical);
		if (inlineSkipTr) {
			this.deps.dispatch(inlineSkipTr);
			this.validateSelectionAfterInlineSkip();
			return true;
		}

		if (!endOfTextblock(this.deps.contentElement, state, direction)) {
			return false;
		}

		const tr: Transaction | null = navigateAcrossBlocks(state, logical);
		if (tr) {
			this.deps.dispatch(tr);
			return true;
		}
		return false;
	}

	/**
	 * Maps visual horizontal arrow to logical movement direction
	 * in offset space for the current block direction.
	 */
	private resolveLogicalDirection(state: EditorState, visual: 'left' | 'right'): 'left' | 'right' {
		const sel = state.selection;
		if (!isTextSelection(sel)) return visual;

		const blockEl = this.deps.contentElement.querySelector(
			`[data-block-id="${sel.anchor.blockId}"]`,
		);
		const isRtl: boolean = blockEl instanceof HTMLElement && getTextDirection(blockEl) === 'rtl';

		if (!isRtl) return visual;
		return visual === 'left' ? 'right' : 'left';
	}

	/** Handles vertical arrow with goalColumn preservation. */
	private handleVerticalArrow(direction: 'up' | 'down'): boolean {
		const state: EditorState = this.deps.getState();
		const domSel: globalThis.Selection | null =
			this.deps.contentElement.ownerDocument.getSelection?.() ?? null;
		const caretRect: DOMRect | null = domSel
			? getCaretRectFromSelection(domSel, this.deps.contentElement)
			: null;

		if (!endOfTextblock(this.deps.contentElement, state, direction, caretRect)) {
			return false;
		}

		if (this.goalColumn === null && caretRect) {
			this.goalColumn = caretRect.left;
		}

		this.preserveGoalColumn = true;
		const tr: Transaction | null = navigateVerticalWithGoalColumn(
			this.deps.contentElement,
			state,
			direction,
			this.goalColumn,
		);

		if (tr) {
			this.deps.dispatch(tr);
			this.preserveGoalColumn = false;
			return true;
		}
		this.preserveGoalColumn = false;
		return false;
	}

	/**
	 * Validates DOM cursor after an InlineNode skip.
	 *
	 * Chrome can place the cursor inside a `contenteditable="false"`
	 * element (phantom position), and Firefox may lose the cursor.
	 * This read-back roundtrip detects drift and forces re-sync.
	 */
	private validateSelectionAfterInlineSkip(): void {
		const state: EditorState = this.deps.getState();
		const domSel = readSelectionFromDOM(this.deps.contentElement);

		if (!domSel) {
			syncSelectionToDOM(this.deps.contentElement, state.selection);
			return;
		}
		if (!selectionsEqual(domSel, state.selection)) {
			syncSelectionToDOM(this.deps.contentElement, state.selection);
		}
	}
}
