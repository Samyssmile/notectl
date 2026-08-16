/**
 * EditorViewEvents: manages DOM event binding and cleanup for the
 * editor view.
 *
 * Handles selection changes, mousedown (NodeSelection,
 * click-below-content), drag-and-drop, and composition events
 * for the CursorWrapper.
 *
 * A press below the last block only records a pending gesture;
 * the trailing paragraph is appended on mouseup, and only when
 * the unmodified primary-button press was released without
 * dragging. Everything else (drag-selection started in the empty
 * area, shift-extension, context menu) stays native.
 */

import type { CompositionState } from '../model/CompositionState.js';
import { createEmptyParagraph, generateBlockId, getBlockLength } from '../model/Document.js';
import {
	type FileHandlerDispatchOutcome,
	dispatchFilesToHandlers,
} from '../model/FileHandlerDispatcher.js';
import type { FileHandlerRegistry } from '../model/FileHandlerRegistry.js';
import { PluginCallbackExecutor } from '../model/PluginCallbackExecutor.js';
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
import {
	isEventFromEditorContent,
	isNodeFromEditorContent,
} from '../platform/EditorEventBoundary.js';
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
	readonly applyUpdate: (
		newState: EditorState,
		tr: Transaction,
		skipSelectionSync?: boolean,
	) => void;
	readonly isUpdating: () => boolean;
	readonly compositionState: CompositionState;
	readonly cursorWrapper: CursorWrapper;
	readonly isReadOnly: () => boolean;
	readonly fileHandlerRegistry?: FileHandlerRegistry;
	readonly callbackExecutor?: PluginCallbackExecutor;
	readonly onMousedown?: () => void;
}

interface DropPositionBookmark {
	position: Position | null;
	cancelled: boolean;
}

interface BelowContentPress {
	readonly clientX: number;
	readonly clientY: number;
	dragged: boolean;
}

/** Pointer travel (per axis, in px) beyond which a press counts as a drag. */
const CLICK_DRAG_THRESHOLD_PX = 4;

function hasMouseModifiers(event: MouseEvent): boolean {
	return event.shiftKey || event.ctrlKey || event.altKey || event.metaKey;
}

function exceededDragThreshold(press: BelowContentPress, event: MouseEvent): boolean {
	return (
		Math.abs(event.clientX - press.clientX) > CLICK_DRAG_THRESHOLD_PX ||
		Math.abs(event.clientY - press.clientY) > CLICK_DRAG_THRESHOLD_PX
	);
}

export class EditorViewEvents {
	private readonly deps: EventCoordinatorDeps;
	private readonly handleSelectionChange: () => void;
	private readonly handleMousedown: (e: MouseEvent) => void;
	private readonly handleMousemove: (e: MouseEvent) => void;
	private readonly handleMouseup: (e: MouseEvent) => void;
	private readonly handleDragover: (e: DragEvent) => void;
	private readonly handleDrop: (e: DragEvent) => void;
	private readonly handleCompositionStart: (event: CompositionEvent) => void;
	private readonly handleCompositionEnd: (event: CompositionEvent) => void;
	private pendingNodeSelectionClear = false;
	private pendingGapCursorClear = false;
	private pendingBelowContentPress: BelowContentPress | null = null;
	private readonly pendingDropBookmarks = new Set<DropPositionBookmark>();
	private readonly callbackExecutor: PluginCallbackExecutor;
	private active = true;

	constructor(deps: EventCoordinatorDeps) {
		this.deps = deps;
		this.callbackExecutor = deps.callbackExecutor ?? PluginCallbackExecutor.silent;

		this.handleCompositionStart = (event: CompositionEvent) => {
			if (!isEventFromEditorContent(event, deps.contentElement)) return;
			deps.cursorWrapper.onCompositionStart(deps.getState());
		};
		this.handleCompositionEnd = (event: CompositionEvent) => {
			if (!isEventFromEditorContent(event, deps.contentElement)) return;
			deps.cursorWrapper.cleanup();
		};
		deps.contentElement.addEventListener('compositionstart', this.handleCompositionStart);
		deps.contentElement.addEventListener('compositionend', this.handleCompositionEnd);

		this.handleSelectionChange = this.onSelectionChange.bind(this);
		document.addEventListener('selectionchange', this.handleSelectionChange);

		this.handleMousedown = this.onMousedown.bind(this);
		deps.contentElement.addEventListener('mousedown', this.handleMousedown);

		this.handleMousemove = this.onMousemove.bind(this);

		// A below-content drag may end anywhere, so the release is
		// observed on the document rather than the content element.
		this.handleMouseup = this.onMouseup.bind(this);
		document.addEventListener('mouseup', this.handleMouseup);

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
		// Skip syncSelectionToDOM — the DOM is the source of truth here.
		// Re-writing the selection via setBaseAndExtent() would disrupt
		// the browser's native drag-selection and double-click tracking.
		this.deps.applyUpdate(newState, tr, true);
	}

	/** Removes all event listeners. */
	destroy(): void {
		if (!this.active) return;
		this.active = false;
		const el: HTMLElement = this.deps.contentElement;
		el.removeEventListener('compositionstart', this.handleCompositionStart);
		el.removeEventListener('compositionend', this.handleCompositionEnd);
		document.removeEventListener('selectionchange', this.handleSelectionChange);
		document.removeEventListener('mouseup', this.handleMouseup);
		el.removeEventListener('mousedown', this.handleMousedown);
		this.clearBelowContentPress();
		el.removeEventListener('dragover', this.handleDragover);
		el.removeEventListener('drop', this.handleDrop);
		for (const bookmark of this.pendingDropBookmarks) bookmark.cancelled = true;
		this.pendingDropBookmarks.clear();
	}

	/** Maps pending async file-drop positions through every committed transaction. */
	onStateChange(oldState: EditorState, state: EditorState, tr: Transaction): void {
		if (oldState.doc !== state.doc) {
			this.clearBelowContentPress();
			this.pendingNodeSelectionClear = false;
			this.pendingGapCursorClear = false;
		}
		if (!isNodeSelection(state.selection)) this.pendingNodeSelectionClear = false;
		if (!isGapCursor(state.selection)) this.pendingGapCursorClear = false;

		for (const bookmark of this.pendingDropBookmarks) {
			if (!bookmark.position) continue;
			if (oldState.doc !== state.doc && tr.steps.length === 0) {
				bookmark.cancelled = true;
				this.pendingDropBookmarks.delete(bookmark);
				continue;
			}
			const mapped = tr.mapping.mapResult(bookmark.position, -1);
			if (mapped.deleted || !state.getBlock(mapped.pos.blockId)) {
				bookmark.cancelled = true;
				this.pendingDropBookmarks.delete(bookmark);
				continue;
			}
			bookmark.position = mapped.pos;
		}
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
		if (!isNodeFromEditorContent(activeEl, this.deps.contentElement)) return;

		this.syncSelectionFromDOM();
	}

	/** Handles mousedown on selectable/void blocks. */
	private onMousedown(e: MouseEvent): void {
		this.clearBelowContentPress();
		if (this.deps.isUpdating()) return;
		if (!isEventFromEditorContent(e, this.deps.contentElement)) return;
		this.deps.onMousedown?.();

		const target = e.target;
		if (!(target instanceof HTMLElement)) return;

		const nearestBlockEl = target.closest('[data-block-id]');

		if (
			!(nearestBlockEl instanceof HTMLElement) ||
			!this.deps.contentElement.contains(nearestBlockEl)
		) {
			if (this.deps.contentElement.contains(target) || target === this.deps.contentElement) {
				this.trackBelowContentPress(e);
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
	 * Records an unmodified primary-button press below the last
	 * block. The default is deliberately not prevented so the
	 * browser can start a drag-selection from the empty area.
	 */
	private trackBelowContentPress(e: MouseEvent): void {
		if (this.deps.isReadOnly()) return;
		if (e.defaultPrevented || e.button !== 0 || hasMouseModifiers(e)) return;
		if (!this.isBelowLastRootBlock(e.clientY)) return;

		this.markPendingSelectionClear();
		this.pendingBelowContentPress = {
			clientX: e.clientX,
			clientY: e.clientY,
			dragged: false,
		};
		document.addEventListener('mousemove', this.handleMousemove);
	}

	/** Records threshold crossings for the full gesture, not only its final displacement. */
	private onMousemove(e: MouseEvent): void {
		const press: BelowContentPress | null = this.pendingBelowContentPress;
		if (!press) return;

		if ((e.buttons & 1) === 0) {
			this.clearBelowContentPress();
			return;
		}
		if (!exceededDragThreshold(press, e)) return;

		press.dragged = true;
		document.removeEventListener('mousemove', this.handleMousemove);
	}

	/** Completes a pending below-content press released without dragging. */
	private onMouseup(e: MouseEvent): void {
		const press: BelowContentPress | null = this.clearBelowContentPress();
		if (!press) return;

		if (this.deps.isUpdating()) return;
		if (e.defaultPrevented || e.button !== 0 || e.buttons !== 0 || hasMouseModifiers(e)) return;
		if (press.dragged || exceededDragThreshold(press, e)) return;
		if (!this.isBelowLastRootBlock(e.clientY)) return;

		this.handleClickBelowContent();
	}

	/** Cancels and returns the current gesture while releasing its temporary listener. */
	private clearBelowContentPress(): BelowContentPress | null {
		const press: BelowContentPress | null = this.pendingBelowContentPress;
		this.pendingBelowContentPress = null;
		document.removeEventListener('mousemove', this.handleMousemove);
		return press;
	}

	/** Returns whether the viewport point is still below the current last root block. */
	private isBelowLastRootBlock(clientY: number): boolean {
		const state: EditorState = this.deps.getState();
		const lastRoot = state.doc.children[state.doc.children.length - 1];
		if (!lastRoot) return false;

		const lastBlockEl: Element | null = this.deps.contentElement.querySelector(
			`[data-block-id="${lastRoot.id}"]`,
		);
		return !!lastBlockEl && clientY > lastBlockEl.getBoundingClientRect().bottom;
	}

	/**
	 * Appends a new paragraph after the last block and focuses it,
	 * reusing a trailing empty paragraph when one already exists.
	 */
	private handleClickBelowContent(): void {
		if (this.deps.isReadOnly()) return;

		const state: EditorState = this.deps.getState();
		const lastRoot = state.doc.children[state.doc.children.length - 1];
		if (!lastRoot) return;
		const lastBlockId: BlockId = lastRoot.id;

		const lastBlock = state.getBlock(lastBlockId);
		if (lastBlock?.type === 'paragraph' && getBlockLength(lastBlock) === 0) {
			const tr: Transaction = state
				.transaction('input')
				.setSelection(createCollapsedSelection(lastBlockId, 0))
				.build();
			this.deps.dispatch(tr);
			return;
		}

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

		const bookmark: DropPositionBookmark = {
			position: this.getPositionFromPoint(e.clientX, e.clientY),
			cancelled: false,
		};
		this.pendingDropBookmarks.add(bookmark);
		const outcome = dispatchFilesToHandlers({
			registry: this.deps.fileHandlerRegistry,
			executor: this.callbackExecutor,
			files,
			getPosition: () => bookmark.position,
			isActive: () => this.active && !this.deps.isReadOnly() && !bookmark.cancelled,
		});
		if (outcome instanceof Promise) {
			// The browser cannot be prevented retroactively. Once a plugin returns a
			// Promise, this coordinator owns the drop while false/reject continue
			// through the remaining registered handlers.
			e.preventDefault();
			void this.finishAsyncFileDrop(outcome, bookmark);
			return;
		}
		this.pendingDropBookmarks.delete(bookmark);
		if (outcome.handled) e.preventDefault();
	}

	private async finishAsyncFileDrop(
		pending: Promise<FileHandlerDispatchOutcome>,
		bookmark: DropPositionBookmark,
	): Promise<void> {
		try {
			await pending;
		} catch (cause) {
			this.callbackExecutor.reportFailure(
				{ pluginId: 'core', name: 'File drop continuation', kind: 'file-handler' },
				cause,
			);
		} finally {
			this.pendingDropBookmarks.delete(bookmark);
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
