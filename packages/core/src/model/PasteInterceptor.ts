/**
 * Paste interceptor types: pure data contracts for the paste interception system.
 *
 * These types live in `model/` because they are consumed by both `input/`
 * and `plugins/` layers — placing them here avoids a cross-layer dependency.
 */

import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';

/**
 * Paste interceptor callback. Receives raw clipboard text and HTML,
 * plus the current state. Returns a Transaction to claim the paste,
 * or null to pass through to the next interceptor / default handling.
 */
export type PasteInterceptor = (
	plainText: string,
	html: string,
	state: EditorState,
) => Transaction | null;

export interface PasteInterceptorOptions {
	/** Human-readable name for debugging and introspection. */
	readonly name?: string;
	/** Execution priority (lower values run first). Defaults to 100. */
	readonly priority?: number;
}

export interface PasteInterceptorEntry {
	readonly name: string;
	readonly pluginId: string;
	readonly interceptor: PasteInterceptor;
	readonly priority: number;
}
