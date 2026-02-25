/**
 * Keyboard handler: intercepts keydown events for shortcuts.
 * Checks plugin-registered keymaps first, then falls back to built-in
 * structural shortcuts (undo, redo, select all) and NodeSelection navigation.
 *
 * Mark-specific shortcuts (Mod-B, Mod-I, Mod-U) are registered by
 * their respective plugins via keymaps, not hardcoded here.
 */

import {
	deleteBackwardAtGap,
	deleteForwardAtGap,
	deleteNodeSelection,
	insertTextCommand,
	navigateArrowIntoVoid,
	selectAll,
	splitBlockCommand,
} from '../commands/Commands.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { isGapCursor, isNodeSelection, selectionsEqual } from '../model/Selection.js';
import type { Transaction } from '../state/Transaction.js';
import { navigateFromGapCursor } from '../view/CaretNavigation.js';
import type { CompositionTracker } from './CompositionTracker.js';
import type { DispatchFn, GetStateFn, RedoFn, UndoFn } from './InputHandler.js';

export interface KeyboardHandlerOptions {
	getState: GetStateFn;
	dispatch: DispatchFn;
	undo: UndoFn;
	redo: RedoFn;
	schemaRegistry?: SchemaRegistry;
	isReadOnly?: () => boolean;
	compositionTracker?: CompositionTracker;
}

export class KeyboardHandler {
	private readonly getState: GetStateFn;
	private readonly dispatch: DispatchFn;
	private readonly undo: UndoFn;
	private readonly redo: RedoFn;
	private readonly schemaRegistry?: SchemaRegistry;
	private readonly isReadOnly: () => boolean;
	private readonly compositionTracker?: CompositionTracker;
	private readonly handleKeydown: (e: KeyboardEvent) => void;

	constructor(
		private readonly element: HTMLElement,
		options: KeyboardHandlerOptions,
	) {
		this.getState = options.getState;
		this.dispatch = options.dispatch;
		this.undo = options.undo;
		this.redo = options.redo;
		this.schemaRegistry = options.schemaRegistry;
		this.isReadOnly = options.isReadOnly ?? (() => false);
		this.compositionTracker = options.compositionTracker;

		this.handleKeydown = this.onKeydown.bind(this);
		element.addEventListener('keydown', this.handleKeydown);
	}

	private onKeydown(e: KeyboardEvent): void {
		// During IME composition, let the browser handle all keys
		if (this.compositionTracker?.isComposing) return;

		// Handle NodeSelection keys before plugin keymaps
		if (this.handleNodeSelectionKeys(e)) return;

		// Handle GapCursor keys (typing, Enter, Backspace, Delete)
		if (this.handleGapCursorKeys(e)) return;

		// Readonly mode: allow navigation keymaps + escape, block everything else
		if (this.isReadOnly()) {
			if (this.schemaRegistry) {
				const descriptor: string = normalizeKeyDescriptor(e);
				const navKeymaps = this.schemaRegistry.getKeymapsByPriority().navigation;
				for (let i = navKeymaps.length - 1; i >= 0; i--) {
					const handler = navKeymaps[i]?.[descriptor];
					if (handler?.()) {
						e.preventDefault();
						return;
					}
				}
			}
			if (this.handleEscape(e)) return;
			return;
		}

		// Normal mode: try plugin keymaps in priority order (context > navigation > default).
		// Within each priority, iterate in reverse so later-registered keymaps take precedence.
		if (this.schemaRegistry) {
			const descriptor: string = normalizeKeyDescriptor(e);
			const groups = this.schemaRegistry.getKeymapsByPriority();
			for (const keymaps of [groups.context, groups.navigation, groups.default]) {
				for (let i = keymaps.length - 1; i >= 0; i--) {
					const handler = keymaps[i]?.[descriptor];
					if (handler?.()) {
						e.preventDefault();
						return;
					}
				}
			}
		}

		// GapCursor arrow fallback: if no plugin keymap handled the arrow,
		// provide basic escape from GapCursor state.
		if (this.handleGapCursorArrowFallback(e)) return;

		// Tab fallback: insert tab character when no plugin handled it
		if (this.handleTab(e)) return;

		// Escape fallback: exit editor when no plugin handled it (WCAG 2.1.2)
		if (this.handleEscape(e)) return;

		// Fall back to built-in structural shortcuts
		const mod = e.metaKey || e.ctrlKey;
		if (!mod) return;

		const key = e.key.toLowerCase();
		const state = this.getState();
		let tr: Transaction | null = null;

		if (key === 'z' && !e.shiftKey) {
			e.preventDefault();
			this.undo();
			return;
		}

		if ((key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey)) {
			e.preventDefault();
			this.redo();
			return;
		}

		if (key === 'a' && !e.shiftKey) {
			e.preventDefault();
			tr = selectAll(state);
		}

		if (tr) {
			this.dispatch(tr);
		}
	}

	/** Handles arrow keys, Enter, Backspace, Delete, Escape when a NodeSelection is active. */
	private handleNodeSelectionKeys(e: KeyboardEvent): boolean {
		const state = this.getState();
		const sel = state.selection;
		if (!isNodeSelection(sel)) return false;

		const key = e.key;

		// Arrow keys: navigate away from NodeSelection (only unmodified arrows)
		if (
			(key === 'ArrowLeft' || key === 'ArrowUp' || key === 'ArrowRight' || key === 'ArrowDown') &&
			!e.shiftKey &&
			!e.metaKey &&
			!e.ctrlKey &&
			!e.altKey
		) {
			const direction =
				key === 'ArrowLeft'
					? 'left'
					: key === 'ArrowRight'
						? 'right'
						: key === 'ArrowUp'
							? 'up'
							: 'down';
			const tr = navigateArrowIntoVoid(state, direction);
			if (tr) {
				e.preventDefault();
				this.dispatch(tr);
				return true;
			}
			return false;
		}

		// Backspace / Delete: remove the selected void block
		if (key === 'Backspace' || key === 'Delete') {
			if (this.isReadOnly()) return true;
			e.preventDefault();
			const tr = deleteNodeSelection(state, sel);
			if (tr) this.dispatch(tr);
			return true;
		}

		// Enter: insert paragraph after
		if (key === 'Enter') {
			if (this.isReadOnly()) return true;
			e.preventDefault();
			const tr = splitBlockCommand(state);
			if (tr) this.dispatch(tr);
			return true;
		}

		// Escape: move to start of next block
		if (key === 'Escape') {
			e.preventDefault();
			const tr = navigateArrowIntoVoid(state, 'right');
			if (tr) this.dispatch(tr);
			return true;
		}

		return false;
	}

	/**
	 * Handles keyboard input when a GapCursor is active.
	 *
	 * Since the browser has no DOM selection at a GapCursor position,
	 * no `beforeinput` events fire. This method intercepts printable
	 * characters, Enter, Backspace, and Delete to dispatch the
	 * corresponding editor commands.
	 */
	private handleGapCursorKeys(e: KeyboardEvent): boolean {
		const state = this.getState();
		const sel = state.selection;
		if (!isGapCursor(sel)) return false;

		const key: string = e.key;

		// Arrow keys: let GapCursorPlugin keymaps handle them
		if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
			return false;
		}

		// Escape / Tab: pass through
		if (key === 'Escape' || key === 'Tab') return false;

		// Modifier combos (Ctrl/Meta/Alt): let shortcuts like Ctrl+Z through
		if (e.ctrlKey || e.metaKey || e.altKey) return false;

		// Enter: insert paragraph at gap
		if (key === 'Enter') {
			if (this.isReadOnly()) return true;
			e.preventDefault();
			const tr: Transaction | null = splitBlockCommand(state);
			if (tr) this.dispatch(tr);
			return true;
		}

		// Backspace: delete backward at gap
		if (key === 'Backspace') {
			if (this.isReadOnly()) return true;
			e.preventDefault();
			const tr: Transaction | null = deleteBackwardAtGap(state, sel);
			if (tr) this.dispatch(tr);
			return true;
		}

		// Delete: delete forward at gap
		if (key === 'Delete') {
			if (this.isReadOnly()) return true;
			e.preventDefault();
			const tr: Transaction | null = deleteForwardAtGap(state, sel);
			if (tr) this.dispatch(tr);
			return true;
		}

		// Printable characters: insert text in a new paragraph
		if (key.length === 1) {
			if (this.isReadOnly()) return true;
			e.preventDefault();
			const tr: Transaction = insertTextCommand(state, key);
			this.dispatch(tr);
			return true;
		}

		return false;
	}

	/**
	 * Fallback arrow handler for GapCursor when no plugin keymap handled the arrow.
	 * Provides basic escape from GapCursor state even without GapCursorPlugin.
	 */
	private handleGapCursorArrowFallback(e: KeyboardEvent): boolean {
		const state = this.getState();
		const sel = state.selection;
		if (!isGapCursor(sel)) return false;

		const key: string = e.key;
		if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown') {
			return false;
		}

		const direction =
			key === 'ArrowLeft'
				? 'left'
				: key === 'ArrowRight'
					? 'right'
					: key === 'ArrowUp'
						? 'up'
						: 'down';
		const tr: Transaction | null = navigateFromGapCursor(state, direction);
		if (tr && !selectionsEqual(tr.selectionAfter, sel)) {
			e.preventDefault();
			this.dispatch(tr);
			return true;
		}
		return false;
	}

	/**
	 * Inserts a tab character when Tab is pressed and no plugin handled it.
	 * Shift-Tab is suppressed to prevent focus leaving the editor.
	 */
	private handleTab(e: KeyboardEvent): boolean {
		if (e.key !== 'Tab') return false;
		if (e.metaKey || e.ctrlKey || e.altKey) return false;

		e.preventDefault();

		if (e.shiftKey) return true;

		const state = this.getState();
		const tr: Transaction = insertTextCommand(state, '\t');
		this.dispatch(tr);
		return true;
	}

	/**
	 * Exits the editor when Escape is pressed and no plugin handled it.
	 * Satisfies WCAG 2.1.2 "No Keyboard Trap" — since Tab is intercepted
	 * for indent/insert, Escape provides the keyboard exit mechanism.
	 */
	private handleEscape(e: KeyboardEvent): boolean {
		if (e.key !== 'Escape') return false;

		this.element.blur();
		return true;
	}

	destroy(): void {
		this.element.removeEventListener('keydown', this.handleKeydown);
	}
}

/**
 * Normalizes a KeyboardEvent into a consistent key descriptor string.
 * Format: `"Mod-Shift-Alt-Key"` where Mod = Ctrl/Cmd.
 */
export function normalizeKeyDescriptor(e: KeyboardEvent): string {
	const parts: string[] = [];
	if (e.metaKey || e.ctrlKey) parts.push('Mod');
	if (e.shiftKey) parts.push('Shift');
	if (e.altKey) parts.push('Alt');

	let key = e.key;
	// Normalize common keys
	if (key === ' ') key = 'Space';
	else if (key.length === 1) key = key.toUpperCase();
	// For special keys like Enter, Tab, Backspace, keep as-is

	parts.push(key);
	return parts.join('-');
}
