/**
 * Shared low-level iteration over tokenized regions of source code.
 *
 * Used by both the `RegexTokenizer` (for syntax highlighting) and the
 * smart-paste `LexerDetector` (for language detection) so both consumers
 * see exactly the same tokenization for a given language definition.
 */

import type { LanguageDefinition } from './TokenizerTypes.js';

/** A successfully matched token region produced by `iterateTokens`. */
export interface IteratedToken {
	readonly type: string;
	readonly from: number;
	readonly to: number;
}

/**
 * Iterates tokens of `code` according to the language's sticky-regex patterns.
 *
 * Walks left-to-right; at each position emits the first matching pattern's
 * token and advances past it. Positions where no pattern matches are silently
 * skipped one byte at a time and never appear in the output — a consumer
 * that needs unknown-byte counts can derive them from `code.length` minus the
 * sum of yielded token widths.
 */
export function* iterateTokens(
	code: string,
	language: LanguageDefinition,
): Generator<IteratedToken> {
	let pos = 0;
	while (pos < code.length) {
		let matched = false;
		for (const pattern of language.patterns) {
			pattern.pattern.lastIndex = pos;
			const match: RegExpExecArray | null = pattern.pattern.exec(code);
			if (match && match.index === pos && match[0].length > 0) {
				const len: number = match[0].length;
				yield { type: pattern.type, from: pos, to: pos + len };
				pos += len;
				matched = true;
				break;
			}
		}
		if (!matched) {
			pos++;
		}
	}
}
