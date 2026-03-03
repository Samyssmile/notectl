/**
 * InputRule: pattern-based text transformations triggered on text input.
 */

import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';

export interface InputRule {
	/** Must end with `$` — matched against the text before the cursor. */
	readonly pattern: RegExp;
	/** Returns a transaction to apply, or null to skip this rule. */
	handler(
		state: EditorState,
		match: RegExpMatchArray,
		start: number,
		end: number,
	): Transaction | null;
}
