/**
 * InputRule: pattern-based text transformations triggered on text input.
 */

import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';

/**
 * Stand-in character for an inline node when building the "text before cursor"
 * an input rule is matched against (U+FFFC OBJECT REPLACEMENT CHARACTER, the
 * same sentinel ProseMirror uses). It makes the matched string width-consistent
 * with model offsets — every inline node occupies exactly one position — so a
 * rule's `start`/`end` are true model offsets even when inline nodes (inline
 * images, formulas, hard breaks) precede the match. Rules that capture and
 * re-insert their matched text must exclude this character so they neither span
 * an inline node nor write the sentinel back as literal text.
 */
export const INLINE_NODE_PLACEHOLDER = '\uFFFC';

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
