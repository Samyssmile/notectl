/**
 * EditorViewEvents: manages DOM event binding and cleanup for the
 * editor view.
 *
 * Handles selection changes, mousedown (NodeSelection,
 * click-below-content), drag-and-drop, and composition events
 * for the CursorWrapper.
 */

import type { CompositionState } from '../model/CompositionState.js';
import { createEmptyParagraph, generateBlockId, getBlockLength } from '../model/Document.js';
import type { FileHandlerRegistry } from '../model/FileHandlerRegistry.js';
import type { Position } from '../model/Selection.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	isGapCursor,
	isNodeSelection,
	selectionsEqual,
} from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import { blockId as toBlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import type { CursorWrapper } from './CursorWrapper.js';
import { domPositionFromPoint } from './DomPointUtils.js';
import { buildBlockPath } from './DomUtils.js';
import { domPositionToState, readSelectionFromDOM } from './SelectionSync.js';

export interface EventCoordinatorDeps {
	readonly contentElement: HTMLElement;
	readonly getState: () => EditorState;
	readonly dispatch: (tr: Transaction) => void;
	readonly applyUpdate: (newState: EditorState, tr: Transaction) => void;
	readonly isUpdating: () => boolean;
	readonly compositionState: CompositionState;
	readonly cursorWrapper: CursorWrapper;
	readonly isReadOnly: () => boolean;
	readonly fileHandlerRegistry?: FileHandlerRegistry;
	readonly onMousedown?: () => void;
}

export class EditorViewEvents {
	private readonly deps: EventCoordinatorDeps;
	private readonly handleSelectionChange: () => void;
	private readonly handleMousedown: (e: MouseEvent) => void;
	private readonly handleDragover: (e: DragEvent) => void;
	private readonly handleDrop: (e: DragEvent) => void;
	private readonly handleCompositionStart: () => void;
	private readonly handleCompositionEnd: () => void;
	private pendingNodeSelectionClear = false;
	private pendingGapCursorClear = false;

	constructor(deps: EventCoordinatorDeps) {
		this.deps = deps;

		this.handleCompositionStart = () => {
			deps.cursorWrapper.onCompositionStart(deps.getState());
		};
		this.handleCompositionEnd = () => {
			deps.cursorWrapper.cleanup();
		};
		deps.contentElement.addEventListener('compositionstart', this.handleCompositionStart);
		deps.contentElement.addEventListener('compositionend', this.handleCompositionEnd);

		this.handleSelectionChange = this.onSelectionChange.bind(this);
		document.addEventListener('selectionchange', this.handleSelectionChange);

		this.handleMousedown = this.onMousedown.bind(this);
		deps.contentElement.addEventListener('mousedown', this.handleMousedown);

		this.handleDragover = this.onDragover.bind(this);
		deps.contentElement.addEventListener('dragover', this.handleDragover);

		this.handleDrop = this.onDrop.bind(this);
		deps.contentElement.addEventListener('drop', this.handleDrop);
	}

	/** Syncs the DOM selection into editor state. */
	syncSelectionFromDOM(): void {
		if (this.deps.compositionState.isComposing) return;

		if (this.deps.cursorWrapper.isActive) {
			this.deps.cursorWrapper.cleanup();
		}

		const state: EditorState = this.deps.getState();

		if (isNodeSelection(state.selection) && !this.pendingNodeSelectionClear) {
			return;
		}
		if (isGapCursor(state.selection) && !this.pendingGapCursorClear) {
			return;
		}
		this.pendingNodeSelectionClear = false;
		this.pendingGapCursorClear = false;

		const sel = readSelectionFromDOM(this.deps.contentElement);
		if (!sel) return;

		if (selectionsEqual(sel, state.selection)) return;

		const tr: Transaction = state
			.transaction('input')
			.setSelection(sel)
			.setStoredMarks(null, state.storedMarks)
			.build();

		const newState: EditorState = state.apply(tr);
		this.deps.applyUpdate(newState, tr);
	}

	/** Removes all event listeners. */
	destroy(): void {
		const el: HTMLElement = this.deps.contentElement;
		el.removeEventListener('compositionstart', this.handleCompositionStart);
		el.removeEventListener('compositionend', this.handleCompositionEnd);
		document.removeEventListener('selectionchange', this.handleSelectionChange);
		el.removeEventListener('mousedown', this.handleMousedown);
		el.removeEventListener('dragover', this.handleDragover);
		el.removeEventListener('drop', this.handleDrop);
	}

	/** Handles DOM selection changes (clicks, arrow keys). */
	private onSelectionChange(): void {
		if (this.deps.isUpdating()) return;

		const shadowRoot = this.deps.contentElement.getRootNode() as ShadowRoot | Document;
		const activeEl =
			'activeElement' in shadowRoot ? shadowRoot.activeElement : document.activeElement;

		if (!this.deps.contentElement.contains(activeEl) && activeEl !== this.deps.contentElement) {
			return;
		}

		this.syncSelectionFromDOM();
	}

	/** Handles mousedown on selectable/void blocks. */
	private onMousedown(e: MouseEvent): void {
		if (this.deps.isUpdating()) return;
		this.deps.onMousedown?.();

		const target = e.target;
		if (!(target instanceof HTMLElement)) return;

		const nearestBlockEl = target.closest('[data-block-id]');

		if (
			!(nearestBlockEl instanceof HTMLElement) ||
			!this.deps.contentElement.contains(nearestBlockEl)
		) {
			if (this.deps.contentElement.contains(target) || target === this.deps.contentElement) {
				this.handleClickBelowContent(e);
			}
			return;
		}

		const isNodeSelectable: boolean =
			nearestBlockEl.hasAttribute('data-void') || nearestBlockEl.hasAttribute('data-selectable');

		if (!isNodeSelectable) {
			this.markPendingSelectionClear();
			return;
		}

		const contentDOM: Element | null = nearestBlockEl.querySelector('[data-content-dom]');
		if (contentDOM?.contains(target)) {
			this.markPendingSelectionClear();
			return;
		}

		e.preventDefault();
		this.deps.contentElement.focus();

		const bid: BlockId = toBlockId(nearestBlockEl.getAttribute('data-block-id') ?? '');
		const path: readonly BlockId[] = buildBlockPath(this.deps.contentElement, nearestBlockEl);
		const sel = createNodeSelection(bid, path);

		const state: EditorState = this.deps.getState();
		const tr: Transaction = state
			.transaction('input')
			.setSelection(sel)
			.setStoredMarks(null, state.storedMarks)
			.build();

		const newState: EditorState = state.apply(tr);
		this.deps.applyUpdate(newState, tr);
	}

	/**
	 * When the user clicks below all rendered blocks, appends a
	 * new paragraph after the last block and focuses it.
	 */
	private handleClickBelowContent(e: MouseEvent): void {
		if (this.deps.isReadOnly()) return;

		const state: EditorState = this.deps.getState();
		const lastRoot = state.doc.children[state.doc.children.length - 1];
		if (!lastRoot) return;
		const lastBlockId: BlockId = lastRoot.id;

		const lastBlockEl: Element | null = this.deps.contentElement.querySelector(
			`[data-block-id="${lastBlockId}"]`,
		);
		if (!lastBlockEl) return;

		const lastRect: DOMRect = lastBlockEl.getBoundingClientRect();
		if (e.clientY <= lastRect.bottom) return;

		const lastBlock = state.getBlock(lastBlockId);
		if (lastBlock?.type === 'paragraph' && getBlockLength(lastBlock) === 0) {
			const tr: Transaction = state
				.transaction('input')
				.setSelection(createCollapsedSelection(lastBlockId, 0))
				.build();
			this.deps.dispatch(tr);
			e.preventDefault();
			return;
		}

		e.preventDefault();
		this.deps.contentElement.focus();

		const newId: BlockId = generateBlockId();
		const tr: Transaction = state
			.transaction('input')
			.insertNode([], state.doc.children.length, createEmptyParagraph(newId))
			.setSelection(createCollapsedSelection(newId, 0))
			.build();

		this.deps.dispatch(tr);
	}

	/** Allows file drop by preventing default on dragover. */
	private onDragover(e: DragEvent): void {
		if (!this.deps.fileHandlerRegistry) return;
		if (!e.dataTransfer) return;
		if (e.dataTransfer.types.includes('Files')) {
			e.preventDefault();
		}
	}

	/** Handles file drop via registered file handlers. */
	private onDrop(e: DragEvent): void {
		if (this.deps.isReadOnly()) return;
		if (!this.deps.fileHandlerRegistry) return;
		if (!e.dataTransfer) return;

		const files: File[] = Array.from(e.dataTransfer.files);
		if (files.length === 0) return;

		const position: Position | null = this.getPositionFromPoint(e.clientX, e.clientY);

		let handled = false;
		for (const file of files) {
			const handlers = this.deps.fileHandlerRegistry.matchFileHandlers(file.type);
			for (const handler of handlers) {
				const result = handler(file, position);
				if (result === true || result instanceof Promise) {
					handled = true;
					break;
				}
			}
		}
		if (handled) {
			e.preventDefault();
		}
	}

	/** Converts screen coordinates to an editor Position. */
	private getPositionFromPoint(x: number, y: number): Position | null {
		const root = this.deps.contentElement.getRootNode() as Document | ShadowRoot;
		const domPoint = domPositionFromPoint(root, x, y);
		if (!domPoint) return null;
		if (!this.deps.contentElement.contains(domPoint.node)) {
			return null;
		}
		return domPositionToState(this.deps.contentElement, domPoint.node, domPoint.offset);
	}

	/**
	 * Marks pending clear flags when clicking non-selectable blocks
	 * while NodeSelection or GapCursor is active.
	 */
	private markPendingSelectionClear(): void {
		const state: EditorState = this.deps.getState();
		if (isNodeSelection(state.selection)) {
			this.pendingNodeSelectionClear = true;
		}
		if (isGapCursor(state.selection)) {
			this.pendingGapCursorClear = true;
		}
	}
}
