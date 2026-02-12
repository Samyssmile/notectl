/**
 * Keyboard handler: intercepts keydown events for shortcuts.
 * Checks plugin-registered keymaps first, then falls back to built-in
 * structural shortcuts (undo, redo, select all).
 *
 * Mark-specific shortcuts (Mod-B, Mod-I, Mod-U) are registered by
 * their respective plugins via keymaps, not hardcoded here.
 */

import { selectAll } from '../commands/Commands.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
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
