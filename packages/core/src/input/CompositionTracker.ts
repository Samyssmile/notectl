/**
 * Centralized composition state tracker.
 * Exposes the current IME composition status so that KeyboardHandler,
 * SelectionSync, and Reconciler can guard against DOM mutations
 * that would break an active browser composition session.
 */

import type { BlockId } from '../model/TypeBrands.js';

export class CompositionTracker {
	private _composing = false;
	private _activeBlockId: BlockId | null = null;

	/** Whether an IME composition session is currently active. */
	get isComposing(): boolean {
		return this._composing;
	}

	/** The block in which the composition is happening, or null if idle. */
	get activeBlockId(): BlockId | null {
		return this._activeBlockId;
	}

	/** Marks the start of a composition session in the given block. */
	start(blockId: BlockId): void {
		this._composing = true;
		this._activeBlockId = blockId;
	}

	/** Marks the end of a composition session. */
	end(): void {
		this._composing = false;
		this._activeBlockId = null;
	}
}
