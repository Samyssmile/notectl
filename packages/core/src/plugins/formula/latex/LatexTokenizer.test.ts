import { describe, expect, it } from 'vitest';
import { TokenType, isControlSymbol, tokenize } from './LatexTokenizer.js';

function types(src: string): TokenType[] {
	return tokenize(src).map((t) => t.type);
}

function values(src: string): string[] {
	return tokenize(src).map((t) => t.value);
}

describe('tokenize', () => {
	it('reads single characters and numbers', () => {
		expect(values('x+1')).toEqual(['x', '+', '1']);
		expect(types('x+1')).toEqual([TokenType.Char, TokenType.Char, TokenType.Number]);
	});

	it('groups consecutive digits and decimals into one number token', () => {
		expect(values('3.14x')).toEqual(['3.14', 'x']);
		expect(types('3.14')).toEqual([TokenType.Number]);
	});

	it('does not absorb a trailing dot with no following digit', () => {
		expect(values('12.')).toEqual(['12', '.']);
	});

	it('reads lettered commands and swallows following whitespace', () => {
		const tokens = tokenize('\\alpha  x');
		expect(tokens.map((t) => t.value)).toEqual(['alpha', 'x']);
		expect(tokens[0]?.type).toBe(TokenType.Command);
	});

	it('reads control symbols as single-char commands', () => {
		expect(values('\\{\\}\\,')).toEqual(['{', '}', ',']);
		expect(types('\\{')).toEqual([TokenType.Command]);
	});

	it('reads \\\\ as a row break', () => {
		expect(types('a\\\\b')).toEqual([TokenType.Char, TokenType.RowBreak, TokenType.Char]);
	});

	it('reads backslash-space as a space command', () => {
		const tokens = tokenize('a\\ b');
		expect(tokens[1]?.type).toBe(TokenType.Command);
		expect(tokens[1]?.value).toBe(' ');
	});

	it('classifies structural markers', () => {
		expect(types('a^b_c')).toEqual([
			TokenType.Char,
			TokenType.Superscript,
			TokenType.Char,
			TokenType.Subscript,
			TokenType.Char,
		]);
		expect(types("a'")).toEqual([TokenType.Char, TokenType.Prime]);
		expect(types('a&b')).toEqual([TokenType.Char, TokenType.Ampersand, TokenType.Char]);
		expect(types('a~b')).toEqual([TokenType.Char, TokenType.NbSpace, TokenType.Char]);
	});

	it('skips ordinary whitespace in math mode', () => {
		expect(values('a   b')).toEqual(['a', 'b']);
	});

	it('records source positions', () => {
		const tokens = tokenize('  x');
		expect(tokens[0]?.position).toBe(2);
	});
});

describe('isControlSymbol', () => {
	it('recognizes single-char control symbols', () => {
		expect(isControlSymbol(',')).toBe(true);
		expect(isControlSymbol('{')).toBe(true);
		expect(isControlSymbol('alpha')).toBe(false);
	});
});
