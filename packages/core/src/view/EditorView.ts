/**
 * EditorView: orchestrates input handling, reconciliation, and selection sync.
 */

import { DecorationSet } from '../decorations/Decoration.js';
import { InputHandler } from '../input/InputHandler.js';
import { KeyboardHandler } from '../input/KeyboardHandler.js';
import { PasteHandler } from '../input/PasteHandler.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { EditorState } from '../state/EditorState.js';
import { HistoryManager } from '../state/History.js';
import type { Transaction } from '../state/Transaction.js';
import type { NodeView } from './NodeView.js';
import { reconcile } from './Reconciler.js';
import { readSelectionFromDOM, syncSelectionToDOM } from './SelectionSync.js';

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
	readonly history: HistoryManager;
	private readonly stateChangeCallbacks: StateChangeCallback[] = [];
	private readonly handleSelectionChange: () => void;
	private isUpdating = false;
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

		this.handleSelectionChange = this.onSelectionChange.bind(this);
		document.addEventListener('selectionchange', this.handleSelectionChange);

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
				...this.reconcileOptions(),
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
				...this.reconcileOptions(),
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
		const sel = readSelectionFromDOM(this.contentElement);
		if (!sel) return;

		// Check if selection actually changed
		const currentSel = this.state.selection;
		if (
			sel.anchor.blockId === currentSel.anchor.blockId &&
			sel.anchor.offset === currentSel.anchor.offset &&
			sel.head.blockId === currentSel.head.blockId &&
			sel.head.offset === currentSel.head.offset
		) {
			return;
		}

		// Update state with new selection (clear stored marks on selection change)
		const tr = this.state
			.transaction('input')
			.setSelection(sel)
			.setStoredMarks(null, this.state.storedMarks)
			.build();

		const newState = this.state.apply(tr);
		this.applyUpdate(newState, tr);
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

	private reconcileOptions() {
		return {
			registry: this.schemaRegistry,
			nodeViews: this.nodeViews,
			getState: () => this.state,
			dispatch: (tr: Transaction) => this.dispatch(tr),
		};
	}

	/** Cleans up all event listeners and handlers. */
	destroy(): void {
		this.inputHandler.destroy();
		this.keyboardHandler.destroy();
		this.pasteHandler.destroy();
		document.removeEventListener('selectionchange', this.handleSelectionChange);
		// Destroy all NodeViews
		for (const nv of this.nodeViews.values()) {
			nv.destroy?.();
		}
		this.nodeViews.clear();
	}
}
