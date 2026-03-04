/**
 * Types for the regex-based tokenizer and language definitions.
 */

/** A single token pattern for a language. Pattern must be ^-anchored. */
export interface TokenPattern {
	readonly type: string;
	readonly pattern: RegExp;
}

/** Language definition for syntax highlighting. */
export interface LanguageDefinition {
	readonly name: string;
	readonly aliases: readonly string[];
	readonly patterns: readonly TokenPattern[];
}
