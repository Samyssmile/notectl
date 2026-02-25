/**
 * EditorView: orchestrates input handling, reconciliation, and selection sync.
 */

import { DecorationSet } from '../decorations/Decoration.js';
import { ClipboardHandler } from '../input/ClipboardHandler.js';
import { CompositionTracker } from '../input/CompositionTracker.js';
import { InputHandler } from '../input/InputHandler.js';
import { KeyboardHandler } from '../input/KeyboardHandler.js';
import { PasteHandler } from '../input/PasteHandler.js';
import { generateBlockId, getBlockLength } from '../model/Document.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { Position } from '../model/Selection.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	isCollapsed,
	isNodeSelection,
	selectionsEqual,
} from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import { nodeType, blockId as toBlockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import { HistoryManager } from '../state/History.js';
import type { Transaction } from '../state/Transaction.js';
import { type CaretDirection, endOfTextblock, navigateAcrossBlocks } from './CaretNavigation.js';
import type { NodeView } from './NodeView.js';
import { type ReconcileOptions, reconcile } from './Reconciler.js';
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
	isReadOnly?: () => boolean;
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
	private readonly isReadOnly: () => boolean;
	private navigationKeymap: Record<string, () => boolean> | null = null;
	readonly compositionTracker: CompositionTracker = new CompositionTracker();

	constructor(contentElement: HTMLElement, options: EditorViewOptions) {
		this.state = options.state;
		this.contentElement = contentElement;
		this.schemaRegistry = options.schemaRegistry;
		this.getDecorations = options.getDecorations;
		this.isReadOnly = options.isReadOnly ?? (() => false);

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
			isReadOnly: this.isReadOnly,
			compositionTracker: this.compositionTracker,
		});
		this.keyboardHandler = new KeyboardHandler(contentElement, {
			getState: () => this.state,
			dispatch: (tr: Transaction) => this.dispatch(tr),
			undo: () => this.undo(),
			redo: () => this.redo(),
			schemaRegistry: this.schemaRegistry,
			isReadOnly: this.isReadOnly,
			compositionTracker: this.compositionTracker,
		});
		this.pasteHandler = new PasteHandler(contentElement, {
			getState: () => this.state,
			dispatch: (tr: Transaction) => this.dispatch(tr),
			schemaRegistry: this.schemaRegistry,
			isReadOnly: this.isReadOnly,
		});
		this.clipboardHandler = new ClipboardHandler(contentElement, {
			getState: () => this.state,
			dispatch: (tr: Transaction) => this.dispatch(tr),
			schemaRegistry: this.schemaRegistry,
			syncSelection: () => this.syncSelectionFromDOM(),
			isReadOnly: this.isReadOnly,
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

		this.registerNavigationKeymaps();
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
				compositionBlockId: this.compositionTracker.isComposing
					? (this.compositionTracker.activeBlockId ?? undefined)
					: undefined,
			});
			if (!this.compositionTracker.isComposing) {
				syncSelectionToDOM(this.contentElement, newState.selection);
			}

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

			const oldDecorations = this.decorations;
			const newDecorations = this.getDecorations?.(newState) ?? DecorationSet.empty;
			this.decorations = newDecorations;

			reconcile(this.contentElement, oldState, newState, {
				...this.reconcileOptions(oldState.selection),
				decorations: newDecorations,
				oldDecorations,
				compositionBlockId: this.compositionTracker.isComposing
					? (this.compositionTracker.activeBlockId ?? undefined)
					: undefined,
			});
			if (!this.compositionTracker.isComposing) {
				syncSelectionToDOM(this.contentElement, newState.selection);
			}
		} finally {
			this.isUpdating = false;
		}
	}

	/** Syncs the DOM selection to the editor state. */
	private syncSelectionFromDOM(): void {
		// During IME composition, do not override the DOM selection
		if (this.compositionTracker.isComposing) return;

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

		// Click in empty space below all blocks → create a paragraph
		if (!(nearestBlockEl instanceof HTMLElement) || !this.contentElement.contains(nearestBlockEl)) {
			if (this.contentElement.contains(target) || target === this.contentElement) {
				this.handleClickBelowContent(e);
			}
			return;
		}

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

	/**
	 * When the user clicks in empty space below all rendered blocks,
	 * appends a new paragraph after the last block and focuses it.
	 */
	private handleClickBelowContent(e: MouseEvent): void {
		if (this.isReadOnly()) return;
		const blockOrder: readonly BlockId[] = this.state.getBlockOrder();
		const lastBlockId: BlockId | undefined = blockOrder[blockOrder.length - 1];
		if (!lastBlockId) return;
		const lastBlockEl: Element | null = this.contentElement.querySelector(
			`[data-block-id="${lastBlockId}"]`,
		);
		if (!lastBlockEl) return;

		// Only act if click is below the last block
		const lastRect: DOMRect = lastBlockEl.getBoundingClientRect();
		if (e.clientY <= lastRect.bottom) return;

		// Check if the last block is already an empty paragraph we can focus
		const lastBlock = this.state.getBlock(lastBlockId);
		if (lastBlock?.type === 'paragraph' && getBlockLength(lastBlock) === 0) {
			// Focus the existing empty paragraph
			const tr: Transaction = this.state
				.transaction('input')
				.setSelection(createCollapsedSelection(lastBlockId, 0))
				.build();
			this.dispatch(tr);
			e.preventDefault();
			return;
		}

		// Create a new paragraph after the last block
		e.preventDefault();
		this.contentElement.focus();

		const newId: BlockId = generateBlockId();
		const lastLen: number = lastBlock ? getBlockLength(lastBlock) : 0;

		const tr: Transaction = this.state
			.transaction('input')
			.splitBlock(lastBlockId, lastLen, newId)
			.setBlockType(newId, nodeType('paragraph'))
			.setSelection(createCollapsedSelection(newId, 0))
			.build();

		this.dispatch(tr);
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
		if (this.isReadOnly()) return;
		if (!this.schemaRegistry) return;
		if (!e.dataTransfer) return;

		const files: File[] = Array.from(e.dataTransfer.files);
		if (files.length === 0) return;

		const position: Position | null = this.getPositionFromPoint(e.clientX, e.clientY);

		let handled = false;
		for (const file of files) {
			const handlers = this.schemaRegistry.matchFileHandlers(file.type);
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
			nodeViews: this.nodeViews,
			getState: () => this.state,
			dispatch: (tr: Transaction) => this.dispatch(tr),
			selectedNodeId,
			previousSelectedNodeId,
		};
	}

	/** Registers arrow-key keymaps with navigation priority for cross-block movement. */
	private registerNavigationKeymaps(): void {
		if (!this.schemaRegistry) return;

		const directions: Record<string, CaretDirection> = {
			ArrowLeft: 'left',
			ArrowRight: 'right',
			ArrowUp: 'up',
			ArrowDown: 'down',
		};

		const keymap: Record<string, () => boolean> = {};
		for (const [key, dir] of Object.entries(directions)) {
			keymap[key] = () => this.handleNavigationArrow(dir);
		}

		this.navigationKeymap = keymap;
		this.schemaRegistry.registerKeymap(keymap, { priority: 'navigation' });
	}

	/** Handles a navigation arrow key: cross-block movement if at textblock boundary. */
	private handleNavigationArrow(direction: CaretDirection): boolean {
		// NodeSelection arrows are handled by handleNodeSelectionKeys
		if (isNodeSelection(this.state.selection)) return false;

		// Non-collapsed selections are Phase 4 (Shift+Arrow)
		if (!isCollapsed(this.state.selection)) return false;

		if (!endOfTextblock(this.contentElement, this.state, direction)) return false;

		const tr: Transaction | null = navigateAcrossBlocks(this.state, direction);
		if (tr) {
			this.dispatch(tr);
			return true;
		}
		return false;
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
		// Remove navigation keymaps from registry
		if (this.navigationKeymap && this.schemaRegistry) {
			this.schemaRegistry.removeKeymap(this.navigationKeymap);
			this.navigationKeymap = null;
		}
		// Destroy all NodeViews
		for (const nv of this.nodeViews.values()) {
			nv.destroy?.();
		}
		this.nodeViews.clear();
	}
}
