/**
 * EditorView: orchestrates input handling, reconciliation, and selection sync.
 */

import { DecorationSet } from '../decorations/Decoration.js';
import { ClipboardHandler } from '../input/ClipboardHandler.js';
import { InputHandler } from '../input/InputHandler.js';
import { KeyboardHandler } from '../input/KeyboardHandler.js';
import { PasteHandler } from '../input/PasteHandler.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { Position } from '../model/Selection.js';
import { createNodeSelection, isNodeSelection, selectionsEqual } from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import { blockId as toBlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import { HistoryManager } from '../state/History.js';
import type { Transaction } from '../state/Transaction.js';
import type { NodeView } from './NodeView.js';
import { reconcile } from './Reconciler.js';
import { domPositionToState, readSelectionFromDOM, syncSelectionToDOM } from './SelectionSync.js';

export type StateChangeCallback = (
	oldState: EditorState,
	newState: EditorState,
	tr: Transaction,
) => void;

export interface EditorViewOptions {
	state: EditorState;
	schemaRegistry?: SchemaRegistry;
	maxHistoryDepth?: number;
	onStateChange?: StateChangeCallback;
	getDecorations?: (state: EditorState, tr?: Transaction) => DecorationSet;
}

export class EditorView {
	private state: EditorState;
	private readonly contentElement: HTMLElement;
	private readonly inputHandler: InputHandler;
	private readonly keyboardHandler: KeyboardHandler;
	private readonly pasteHandler: PasteHandler;
	private readonly clipboardHandler: ClipboardHandler;
	readonly history: HistoryManager;
	private readonly stateChangeCallbacks: StateChangeCallback[] = [];
	private readonly handleSelectionChange: () => void;
	private readonly handleMousedown: (e: MouseEvent) => void;
	private readonly handleDragover: (e: DragEvent) => void;
	private readonly handleDrop: (e: DragEvent) => void;
	private isUpdating = false;
	private pendingNodeSelectionClear = false;
	private readonly schemaRegistry?: SchemaRegistry;
	private readonly nodeViews = new Map<string, NodeView>();
	private decorations: DecorationSet = DecorationSet.empty;
	private readonly getDecorations?: (state: EditorState, tr?: Transaction) => DecorationSet;

	constructor(contentElement: HTMLElement, options: EditorViewOptions) {
		this.state = options.state;
		this.contentElement = contentElement;
		this.schemaRegistry = options.schemaRegistry;
		this.getDecorations = options.getDecorations;

		this.history = new HistoryManager({
			maxDepth: options.maxHistoryDepth ?? 100,
		});

		if (options.onStateChange) {
			this.stateChangeCallbacks.push(options.onStateChange);
		}

		this.inputHandler = new InputHandler(contentElement, {
			getState: () => this.state,
			dispatch: (tr: Transaction) => this.dispatch(tr),
			syncSelection: () => this.syncSelectionFromDOM(),
			schemaRegistry: this.schemaRegistry,
		});
		this.keyboardHandler = new KeyboardHandler(contentElement, {
			getState: () => this.state,
			dispatch: (tr: Transaction) => this.dispatch(tr),
			undo: () => this.undo(),
			redo: () => this.redo(),
			schemaRegistry: this.schemaRegistry,
		});
		this.pasteHandler = new PasteHandler(contentElement, {
			getState: () => this.state,
			dispatch: (tr: Transaction) => this.dispatch(tr),
			schemaRegistry: this.schemaRegistry,
		});
		this.clipboardHandler = new ClipboardHandler(contentElement, {
			getState: () => this.state,
			dispatch: (tr: Transaction) => this.dispatch(tr),
			schemaRegistry: this.schemaRegistry,
			syncSelection: () => this.syncSelectionFromDOM(),
		});

		this.handleSelectionChange = this.onSelectionChange.bind(this);
		document.addEventListener('selectionchange', this.handleSelectionChange);

		this.handleMousedown = this.onMousedown.bind(this);
		contentElement.addEventListener('mousedown', this.handleMousedown);

		this.handleDragover = this.onDragover.bind(this);
		contentElement.addEventListener('dragover', this.handleDragover);

		this.handleDrop = this.onDrop.bind(this);
		contentElement.addEventListener('drop', this.handleDrop);

		// Initial render
		this.decorations = this.getDecorations?.(this.state) ?? DecorationSet.empty;
		reconcile(contentElement, null, this.state, {
			...this.reconcileOptions(),
			decorations: this.decorations,
		});
		syncSelectionToDOM(contentElement, this.state.selection);
	}

	/** Returns the current editor state. */
	getState(): EditorState {
		return this.state;
	}

	/**
	 * Central update cycle: sets state, collects decorations, reconciles DOM,
	 * syncs selection, and notifies listeners. Guarded against re-entrancy.
	 */
	private applyUpdate(
		newState: EditorState,
		tr: Transaction,
		options?: { readonly pushHistory?: boolean },
	): void {
		if (this.isUpdating) return;
		this.isUpdating = true;
		try {
			const oldState = this.state;
			this.state = newState;

			if (options?.pushHistory && tr.metadata.origin !== 'history') {
				this.history.push(tr);
			}

			const oldDecorations = this.decorations;
			const newDecorations = this.getDecorations?.(newState, tr) ?? DecorationSet.empty;
			this.decorations = newDecorations;

			reconcile(this.contentElement, oldState, newState, {
				...this.reconcileOptions(oldState.selection),
				decorations: newDecorations,
				oldDecorations,
			});
			syncSelectionToDOM(this.contentElement, newState.selection);

			for (const cb of this.stateChangeCallbacks) {
				cb(oldState, newState, tr);
			}
		} finally {
			this.isUpdating = false;
		}
	}

	/** Dispatches a transaction, updates state, reconciles DOM, syncs selection. */
	dispatch(tr: Transaction): void {
		const newState = this.state.apply(tr);
		this.applyUpdate(newState, tr, { pushHistory: true });
	}

	/** Performs undo. */
	undo(): void {
		// Guard needed here: history.undo() mutates stacks before applyUpdate runs
		if (this.isUpdating) return;
		const result = this.history.undo(this.state);
		if (!result) return;
		this.applyUpdate(result.state, result.transaction);
	}

	/** Performs redo. */
	redo(): void {
		// Guard needed here: history.redo() mutates stacks before applyUpdate runs
		if (this.isUpdating) return;
		const result = this.history.redo(this.state);
		if (!result) return;
		this.applyUpdate(result.state, result.transaction);
	}

	/** Registers a state change callback. */
	onStateChange(callback: StateChangeCallback): () => void {
		this.stateChangeCallbacks.push(callback);
		return () => {
			const idx = this.stateChangeCallbacks.indexOf(callback);
			if (idx !== -1) this.stateChangeCallbacks.splice(idx, 1);
		};
	}

	/** Replaces the editor state without destroying handlers or history. */
	replaceState(newState: EditorState): void {
		if (this.isUpdating) return;
		this.isUpdating = true;
		try {
			const oldState = this.state;
			this.state = newState;
			this.history.clear();

			const oldDecorations = this.decorations;
			const newDecorations = this.getDecorations?.(newState) ?? DecorationSet.empty;
			this.decorations = newDecorations;

			reconcile(this.contentElement, oldState, newState, {
				...this.reconcileOptions(oldState.selection),
				decorations: newDecorations,
				oldDecorations,
			});
			syncSelectionToDOM(this.contentElement, newState.selection);
		} finally {
			this.isUpdating = false;
		}
	}

	/** Syncs the DOM selection to the editor state. */
	private syncSelectionFromDOM(): void {
		// If NodeSelection is active, preserve it — DOM selectionchange should not override.
		// Exception: after mousedown on a non-selectable block, allow the DOM selection to take over.
		if (isNodeSelection(this.state.selection) && !this.pendingNodeSelectionClear) return;
		this.pendingNodeSelectionClear = false;

		const sel = readSelectionFromDOM(this.contentElement);
		if (!sel) return;

		// Check if selection actually changed
		if (selectionsEqual(sel, this.state.selection)) return;

		// Update state with new selection (clear stored marks on selection change)
		const tr = this.state
			.transaction('input')
			.setSelection(sel)
			.setStoredMarks(null, this.state.storedMarks)
			.build();

		const newState = this.state.apply(tr);
		this.applyUpdate(newState, tr);
	}

	/** Handles mousedown on selectable/void blocks to create NodeSelection. */
	private onMousedown(e: MouseEvent): void {
		if (this.isUpdating) return;
		const target = e.target;
		if (!(target instanceof HTMLElement)) return;

		const nearestBlockEl = target.closest('[data-block-id]');
		if (!(nearestBlockEl instanceof HTMLElement)) return;
		if (!this.contentElement.contains(nearestBlockEl)) return;

		const isNodeSelectable =
			nearestBlockEl.hasAttribute('data-void') || nearestBlockEl.hasAttribute('data-selectable');
		if (!isNodeSelectable) {
			// When clicking a non-selectable block while NodeSelection is active,
			// allow the next syncSelectionFromDOM to override the NodeSelection
			if (isNodeSelection(this.state.selection)) {
				this.pendingNodeSelectionClear = true;
			}
			return;
		}

		// If clicking inside contentDOM (e.g. code block content area),
		// allow browser cursor placement instead of creating NodeSelection.
		const contentDOM: Element | null = nearestBlockEl.querySelector('[data-content-dom]');
		if (contentDOM?.contains(target)) {
			if (isNodeSelection(this.state.selection)) {
				this.pendingNodeSelectionClear = true;
			}
			return;
		}

		e.preventDefault();
		this.contentElement.focus();

		const bid = toBlockId(nearestBlockEl.getAttribute('data-block-id') ?? '');
		const path = this.buildBlockPath(nearestBlockEl);
		const sel = createNodeSelection(bid, path);

		const tr = this.state
			.transaction('input')
			.setSelection(sel)
			.setStoredMarks(null, this.state.storedMarks)
			.build();

		const newState = this.state.apply(tr);
		this.applyUpdate(newState, tr);
	}

	/** Builds an array of block IDs from root to leaf. */
	private buildBlockPath(leafBlockEl: HTMLElement): BlockId[] {
		const path: BlockId[] = [];
		let current: HTMLElement | null = leafBlockEl;
		while (current && current !== this.contentElement) {
			if (current.hasAttribute('data-block-id')) {
				path.unshift(toBlockId(current.getAttribute('data-block-id') ?? ''));
			}
			current = current.parentElement;
		}
		return path;
	}

	/** Allows file drop by preventing default on dragover when files are present. */
	private onDragover(e: DragEvent): void {
		if (!this.schemaRegistry) return;
		if (!e.dataTransfer) return;
		if (e.dataTransfer.types.includes('Files')) {
			e.preventDefault();
		}
	}

	/** Handles file drop by delegating to registered file handlers. */
	private onDrop(e: DragEvent): void {
		if (!this.schemaRegistry) return;
		if (!e.dataTransfer) return;

		const files: File[] = Array.from(e.dataTransfer.files);
		if (files.length === 0) return;

		const position: Position | null = this.getPositionFromPoint(e.clientX, e.clientY);

		for (const file of files) {
			const handlers = this.schemaRegistry.matchFileHandlers(file.type);
			for (const handler of handlers) {
				const result = handler(files, position);
				if (result === true) {
					e.preventDefault();
					return;
				}
				if (result instanceof Promise) {
					e.preventDefault();
					return;
				}
			}
		}
	}

	/** Converts screen coordinates to an editor Position. */
	private getPositionFromPoint(x: number, y: number): Position | null {
		const root = this.contentElement.getRootNode() as Document | ShadowRoot;

		let domNode: Node | null = null;
		let domOffset = 0;

		// Standard API (caretPositionFromPoint)
		if ('caretPositionFromPoint' in root) {
			const cp = (root as Document).caretPositionFromPoint(x, y);
			if (cp) {
				domNode = cp.offsetNode;
				domOffset = cp.offset;
			}
		}

		// Fallback (caretRangeFromPoint)
		if (!domNode && 'caretRangeFromPoint' in root) {
			const range = (root as Document).caretRangeFromPoint(x, y);
			if (range) {
				domNode = range.startContainer;
				domOffset = range.startOffset;
			}
		}

		if (!domNode) return null;
		if (!this.contentElement.contains(domNode)) return null;

		return domPositionToState(this.contentElement, domNode, domOffset);
	}

	/** Handles DOM selection changes (clicks, arrow keys). */
	private onSelectionChange(): void {
		if (this.isUpdating) return;

		// Only process if our content element is focused
		const shadowRoot = this.contentElement.getRootNode() as ShadowRoot | Document;
		const activeEl =
			'activeElement' in shadowRoot ? shadowRoot.activeElement : document.activeElement;
		if (!this.contentElement.contains(activeEl) && activeEl !== this.contentElement) return;

		this.syncSelectionFromDOM();
	}

	private reconcileOptions(oldSelection?: import('../model/Selection.js').EditorSelection) {
		const selectedNodeId = isNodeSelection(this.state.selection)
			? this.state.selection.nodeId
			: undefined;
		const previousSelectedNodeId =
			oldSelection && isNodeSelection(oldSelection) ? oldSelection.nodeId : undefined;
		return {
			registry: this.schemaRegistry,
			nodeViews: this.nodeViews,
			getState: () => this.state,
			dispatch: (tr: Transaction) => this.dispatch(tr),
			selectedNodeId,
			previousSelectedNodeId,
		};
	}

	/** Cleans up all event listeners and handlers. */
	destroy(): void {
		this.inputHandler.destroy();
		this.keyboardHandler.destroy();
		this.pasteHandler.destroy();
		this.clipboardHandler.destroy();
		document.removeEventListener('selectionchange', this.handleSelectionChange);
		this.contentElement.removeEventListener('mousedown', this.handleMousedown);
		this.contentElement.removeEventListener('dragover', this.handleDragover);
		this.contentElement.removeEventListener('drop', this.handleDrop);
		// Destroy all NodeViews
		for (const nv of this.nodeViews.values()) {
			nv.destroy?.();
		}
		this.nodeViews.clear();
	}
}
