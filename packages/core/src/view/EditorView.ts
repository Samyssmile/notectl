/**
 * EditorView: orchestrates state updates, reconciliation, and
 * selection sync.
 */

import { DecorationSet } from '../decorations/Decoration.js';
import type { CompositionState } from '../model/CompositionState.js';
import type { FileHandlerRegistry } from '../model/FileHandlerRegistry.js';
import type { KeymapRegistry } from '../model/KeymapRegistry.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { isNodeSelection } from '../model/Selection.js';
import type { EditorState } from '../state/EditorState.js';
import { HistoryManager } from '../state/History.js';
import { isSelectionOnlyTransaction } from '../state/ReadonlyGuard.js';
import type { Transaction } from '../state/Transaction.js';
import { CursorWrapper } from './CursorWrapper.js';
import { EditorViewEvents } from './EditorViewEvents.js';
import { EditorViewNavigation } from './EditorViewNavigation.js';
import type { NodeView } from './NodeView.js';
import type { NodeViewRegistry } from './NodeViewRegistry.js';
import { type ReconcileOptions, reconcile } from './Reconciler.js';
import { syncSelectionToDOM } from './SelectionSync.js';

export type StateChangeCallback = (
	oldState: EditorState,
	newState: EditorState,
	tr: Transaction,
) => void;

export interface EditorViewOptions {
	state: EditorState;
	schemaRegistry?: SchemaRegistry;
	keymapRegistry?: KeymapRegistry;
	fileHandlerRegistry?: FileHandlerRegistry;
	nodeViewRegistry?: NodeViewRegistry;
	maxHistoryDepth?: number;
	onStateChange?: StateChangeCallback;
	getDecorations?: (state: EditorState, tr?: Transaction) => DecorationSet;
	isReadOnly?: () => boolean;
	compositionState?: CompositionState;
}

export class EditorView {
	private state: EditorState;
	private readonly contentElement: HTMLElement;
	readonly history: HistoryManager;
	private readonly stateChangeCallbacks: StateChangeCallback[] = [];
	private isUpdating = false;
	private readonly schemaRegistry?: SchemaRegistry;
	private readonly nodeViewRegistry?: NodeViewRegistry;
	private readonly nodeViews = new Map<string, NodeView>();
	private decorations: DecorationSet = DecorationSet.empty;
	private readonly getDecorations?: (state: EditorState, tr?: Transaction) => DecorationSet;
	private readonly isReadOnly: () => boolean;
	private readonly compositionState: CompositionState;
	private readonly cursorWrapper: CursorWrapper;
	private readonly navigation: EditorViewNavigation;
	private readonly events: EditorViewEvents;

	constructor(contentElement: HTMLElement, options: EditorViewOptions) {
		this.state = options.state;
		this.contentElement = contentElement;
		this.schemaRegistry = options.schemaRegistry;
		this.nodeViewRegistry = options.nodeViewRegistry;
		this.getDecorations = options.getDecorations;
		this.isReadOnly = options.isReadOnly ?? (() => false);
		this.compositionState = options.compositionState ?? {
			isComposing: false,
			activeBlockId: null,
		};

		this.history = new HistoryManager({
			maxDepth: options.maxHistoryDepth ?? 100,
		});

		if (options.onStateChange) {
			this.stateChangeCallbacks.push(options.onStateChange);
		}

		this.cursorWrapper = new CursorWrapper(contentElement, this.schemaRegistry);

		this.navigation = new EditorViewNavigation({
			contentElement,
			getState: () => this.state,
			dispatch: (tr: Transaction) => this.dispatch(tr),
			keymapRegistry: options.keymapRegistry,
		});

		this.events = new EditorViewEvents({
			contentElement,
			getState: () => this.state,
			dispatch: (tr: Transaction) => this.dispatch(tr),
			applyUpdate: (newState: EditorState, tr: Transaction) => this.applyUpdate(newState, tr),
			isUpdating: () => this.isUpdating,
			compositionState: this.compositionState,
			cursorWrapper: this.cursorWrapper,
			isReadOnly: this.isReadOnly,
			fileHandlerRegistry: options.fileHandlerRegistry,
			onMousedown: () => this.navigation.clearGoalColumn(),
		});

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
	 * Central update cycle: sets state, collects decorations, reconciles
	 * DOM, syncs selection, and notifies listeners.
	 * Guarded against re-entrancy.
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

			if (this.cursorWrapper.isActive && !newState.storedMarks?.length) {
				this.cursorWrapper.cleanup();
			}

			if (options?.pushHistory && tr.metadata.origin !== 'history') {
				this.history.push(tr);
			} else if (isSelectionOnlyTransaction(tr)) {
				// Selection-only updates are not undoable, but they must still
				// break typing groups so later edits don't merge across cursor moves.
				this.history.push(tr);
			}

			const newDecorations = this.getDecorations?.(newState, tr) ?? DecorationSet.empty;
			this.reconcileAndSync(oldState, newState, newDecorations);

			for (const cb of this.stateChangeCallbacks) {
				cb(oldState, newState, tr);
			}
			this.navigation.resetAfterUpdate();
		} finally {
			this.isUpdating = false;
		}
	}

	/** Dispatches a transaction, updates state, reconciles DOM. */
	dispatch(tr: Transaction): void {
		const newState = this.state.apply(tr);
		this.applyUpdate(newState, tr, { pushHistory: true });
	}

	/** Performs undo. */
	undo(): void {
		if (this.isUpdating || this.isReadOnly()) return;
		const result = this.history.undo(this.state);
		if (!result) return;
		this.applyUpdate(result.state, result.transaction);
	}

	/** Performs redo. */
	redo(): void {
		if (this.isUpdating || this.isReadOnly()) return;
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

			if (this.cursorWrapper.isActive && !newState.storedMarks?.length) {
				this.cursorWrapper.cleanup();
			}

			const tr: Transaction = {
				steps: [],
				selectionBefore: oldState.selection,
				selectionAfter: newState.selection,
				storedMarksAfter: newState.storedMarks,
				metadata: {
					origin: 'api',
					timestamp: Date.now(),
				},
			};
			const newDecorations = this.getDecorations?.(newState, tr) ?? DecorationSet.empty;
			this.reconcileAndSync(oldState, newState, newDecorations);

			for (const cb of this.stateChangeCallbacks) {
				cb(oldState, newState, tr);
			}
			this.navigation.resetAfterUpdate();
		} finally {
			this.isUpdating = false;
		}
	}

	/** Syncs the DOM selection into editor state. */
	syncSelection(): void {
		this.events.syncSelectionFromDOM();
	}

	/** Reconciles DOM and syncs selection, updating decoration state. */
	private reconcileAndSync(
		oldState: EditorState,
		newState: EditorState,
		newDecorations: DecorationSet,
	): void {
		const oldDecorations = this.decorations;
		this.decorations = newDecorations;

		reconcile(this.contentElement, oldState, newState, {
			...this.reconcileOptions(oldState.selection),
			decorations: newDecorations,
			oldDecorations,
			compositionBlockId: this.compositionState.isComposing
				? (this.compositionState.activeBlockId ?? undefined)
				: undefined,
		});
		if (!this.compositionState.isComposing) {
			syncSelectionToDOM(this.contentElement, newState.selection);
		}
	}

	private reconcileOptions(
		oldSelection?: import('../model/Selection.js').EditorSelection,
	): ReconcileOptions {
		const selectedNodeId = isNodeSelection(this.state.selection)
			? this.state.selection.nodeId
			: undefined;
		const previousSelectedNodeId =
			oldSelection && isNodeSelection(oldSelection) ? oldSelection.nodeId : undefined;
		return {
			registry: this.schemaRegistry,
			nodeViewRegistry: this.nodeViewRegistry,
			nodeViews: this.nodeViews,
			getState: () => this.state,
			dispatch: (tr: Transaction) => this.dispatch(tr),
			selectedNodeId,
			previousSelectedNodeId,
		};
	}

	/** Cleans up all event listeners and handlers. */
	destroy(): void {
		this.cursorWrapper.cleanup();
		this.events.destroy();
		this.navigation.destroy();
		for (const nv of this.nodeViews.values()) {
			nv.destroy?.();
		}
		this.nodeViews.clear();
	}
}
