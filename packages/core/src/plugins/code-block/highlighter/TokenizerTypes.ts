/**
 * Types for the regex-based tokenizer and language definitions.
 */

import type { SyntaxTokenType } from '../../../editor/theme/SyntaxTokenTypes.js';

/** A single token pattern for a language. Pattern must use the sticky (`y`) flag. */
export interface TokenPattern {
	readonly type: SyntaxTokenType | (string & {});
	readonly pattern: RegExp;
}

/** Language definition for syntax highlighting. */
export interface LanguageDefinition {
	readonly name: string;
	readonly aliases: readonly string[];
	readonly patterns: readonly TokenPattern[];
}
