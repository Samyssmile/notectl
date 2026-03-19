import { describe, expect, it } from 'vitest';
import {
	SYNTAX_TOKEN_TYPES,
	resolveTokenColor,
	resolveTokenFontStyle,
	resolveTokenFontWeight,
} from './SyntaxTokenTypes.js';
import type { TokenStyle, TokenStyleValue } from './SyntaxTokenTypes.js';

describe('SYNTAX_TOKEN_TYPES', () => {
	it('contains all expected token types', () => {
		const expected: readonly string[] = [
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
		];
		expect([...SYNTAX_TOKEN_TYPES]).toEqual(expected);
	});

	it('has no duplicates', () => {
		const set = new Set(SYNTAX_TOKEN_TYPES);
		expect(set.size).toBe(SYNTAX_TOKEN_TYPES.length);
	});
});

describe('resolveTokenColor', () => {
	it('returns a plain string value as-is', () => {
		const value: TokenStyleValue = '#d73a49';
		expect(resolveTokenColor(value)).toBe('#d73a49');
	});

	it('extracts color from a TokenStyle object', () => {
		const value: TokenStyle = { color: '#6a737d', fontStyle: 'italic' };
		expect(resolveTokenColor(value)).toBe('#6a737d');
	});
});

describe('resolveTokenFontStyle', () => {
	it('returns undefined for a plain string value', () => {
		expect(resolveTokenFontStyle('#d73a49')).toBeUndefined();
	});

	it('returns fontStyle from a TokenStyle object', () => {
		const value: TokenStyle = { color: '#6a737d', fontStyle: 'italic' };
		expect(resolveTokenFontStyle(value)).toBe('italic');
	});

	it('returns undefined when fontStyle is not set', () => {
		const value: TokenStyle = { color: '#6a737d' };
		expect(resolveTokenFontStyle(value)).toBeUndefined();
	});
});

describe('resolveTokenFontWeight', () => {
	it('returns undefined for a plain string value', () => {
		expect(resolveTokenFontWeight('#d73a49')).toBeUndefined();
	});

	it('returns fontWeight from a TokenStyle object', () => {
		const value: TokenStyle = { color: '#d73a49', fontWeight: 'bold' };
		expect(resolveTokenFontWeight(value)).toBe('bold');
	});

	it('returns undefined when fontWeight is not set', () => {
		const value: TokenStyle = { color: '#d73a49' };
		expect(resolveTokenFontWeight(value)).toBeUndefined();
	});
});
