/**
 * Text-input interceptor types: pure data contracts for the text-input
 * interception system.
 *
 * These types live in `model/` because they are consumed by both `input/`
 * and `plugins/` layers — placing them here avoids a cross-layer dependency.
 */

import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';

/**
 * Text-input interceptor callback. Receives the inserted text payload plus
 * the current state. Returns a Transaction to claim the input, or null to
 * pass through to the next interceptor / default `insertTextCommand`.
 */
export type TextInputInterceptor = (text: string, state: EditorState) => Transaction | null;

export interface TextInputInterceptorOptions {
	/** Human-readable name for debugging and introspection. */
	readonly name?: string;
	/** Execution priority (lower values run first). Defaults to 100. */
	readonly priority?: number;
}

export interface TextInputInterceptorEntry {
	readonly name: string;
	readonly pluginId: string;
	readonly interceptor: TextInputInterceptor;
	readonly priority: number;
}
