/**
 * Canonical syntax token type list and style resolution utilities.
 *
 * Single source of truth for all syntax highlighting token types.
 * Adding a new token type here automatically propagates to themes,
 * CSS variables, and token CSS classes.
 */

/** All supported syntax token types. */
export const SYNTAX_TOKEN_TYPES = [
	'keyword',
	'string',
	'comment',
	'number',
	'function',
	'operator',
	'punctuation',
	'boolean',
	'null',
	'property',
	'type',
	'annotation',
	'tag',
	'attribute',
	'constant',
	'regex',
] as const;

/** A syntax token type from the canonical list. */
export type SyntaxTokenType = (typeof SYNTAX_TOKEN_TYPES)[number];

/** Per-token style: color plus optional font weight and style. */
export interface TokenStyle {
	readonly color: string;
	readonly fontWeight?: 'normal' | 'bold';
	readonly fontStyle?: 'normal' | 'italic';
}

/** A token style value is either a plain color string or a full TokenStyle object. */
export type TokenStyleValue = string | TokenStyle;

/** Extracts the color from a TokenStyleValue. */
export function resolveTokenColor(value: TokenStyleValue): string {
	return typeof value === 'string' ? value : value.color;
}

/** Extracts the font-style from a TokenStyleValue, or undefined if not set. */
export function resolveTokenFontStyle(value: TokenStyleValue): string | undefined {
	return typeof value === 'object' ? value.fontStyle : undefined;
}

/** Extracts the font-weight from a TokenStyleValue, or undefined if not set. */
export function resolveTokenFontWeight(value: TokenStyleValue): string | undefined {
	return typeof value === 'object' ? value.fontWeight : undefined;
}
