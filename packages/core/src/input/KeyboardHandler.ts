/**
 * Keyboard handler: intercepts keydown events for shortcuts.
 * Checks plugin-registered keymaps first, then falls back to built-in
 * structural shortcuts (undo, redo, select all) and NodeSelection navigation.
 *
 * Mark-specific shortcuts (Mod-B, Mod-I, Mod-U) are registered by
 * their respective plugins via keymaps, not hardcoded here.
 */

import {
	deleteNodeSelection,
	navigateArrowIntoVoid,
	selectAll,
	splitBlockCommand,
} from '../commands/Commands.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { isNodeSelection } from '../model/Selection.js';
import type { Transaction } from '../state/Transaction.js';
import type { DispatchFn, GetStateFn, RedoFn, UndoFn } from './InputHandler.js';

export interface KeyboardHandlerOptions {
	getState: GetStateFn;
	dispatch: DispatchFn;
	undo: UndoFn;
	redo: RedoFn;
	schemaRegistry?: SchemaRegistry;
}

export class KeyboardHandler {
	private readonly getState: GetStateFn;
	private readonly dispatch: DispatchFn;
	private readonly undo: UndoFn;
	private readonly redo: RedoFn;
	private readonly schemaRegistry?: SchemaRegistry;
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

		this.handleKeydown = this.onKeydown.bind(this);
		element.addEventListener('keydown', this.handleKeydown);
	}

	private onKeydown(e: KeyboardEvent): void {
		// Handle NodeSelection keys before plugin keymaps
		if (this.handleNodeSelectionKeys(e)) return;

		// Handle arrow key navigation into void blocks
		if (this.handleArrowIntoVoid(e)) return;

		// Try plugin keymaps first (last registered has highest precedence)
		if (this.schemaRegistry) {
			const descriptor = normalizeKeyDescriptor(e);
			const keymaps = this.schemaRegistry.getKeymaps();
			// Iterate in reverse so later-registered keymaps take precedence
			for (let i = keymaps.length - 1; i >= 0; i--) {
				const handler = keymaps[i]?.[descriptor];
				if (handler?.()) {
					e.preventDefault();
					return;
				}
			}
		}

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

		// Arrow keys: navigate away from NodeSelection
		if (key === 'ArrowLeft' || key === 'ArrowUp' || key === 'ArrowRight' || key === 'ArrowDown') {
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
			e.preventDefault();
			const tr = deleteNodeSelection(state, sel);
			if (tr) this.dispatch(tr);
			return true;
		}

		// Enter: insert paragraph after
		if (key === 'Enter') {
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

	/** Handles arrow key navigation from text blocks into adjacent void blocks. */
	private handleArrowIntoVoid(e: KeyboardEvent): boolean {
		const key = e.key;
		if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown') {
			return false;
		}

		// Don't intercept modified arrows (selection extension, word jump)
		if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return false;

		const state = this.getState();
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
