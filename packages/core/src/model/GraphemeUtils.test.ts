import { describe, expect, it } from 'vitest';
import { nextGraphemeSize, prevGraphemeSize } from './GraphemeUtils.js';

describe('nextGraphemeSize', () => {
	it('returns 1 for ASCII characters', () => {
		expect(nextGraphemeSize('hello', 0)).toBe(1);
		expect(nextGraphemeSize('hello', 4)).toBe(1);
	});

	it('returns 2 for surrogate pair emoji', () => {
		// Wave emoji U+1F44B = 2 UTF-16 code units
		expect(nextGraphemeSize('\u{1F44B}hello', 0)).toBe(2);
	});

	it('returns full size for ZWJ sequence', () => {
		// Family emoji: man + ZWJ + woman + ZWJ + girl
		const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
		expect(nextGraphemeSize(family, 0)).toBe(family.length);
	});

	it('returns 2 for combining character', () => {
		// e + combining acute accent
		expect(nextGraphemeSize('e\u0301', 0)).toBe(2);
	});

	it('returns 0 at end of string', () => {
		expect(nextGraphemeSize('hello', 5)).toBe(0);
	});

	it('returns 0 for empty string', () => {
		expect(nextGraphemeSize('', 0)).toBe(0);
	});

	it('returns correct size for emoji in middle of string', () => {
		// "a" + wave emoji + "b"
		expect(nextGraphemeSize('a\u{1F44B}b', 1)).toBe(2);
	});

	it('handles flag emoji (regional indicators)', () => {
		// US flag: U+1F1FA U+1F1F8 = 4 UTF-16 code units
		const flag = '\u{1F1FA}\u{1F1F8}';
		expect(nextGraphemeSize(flag, 0)).toBe(flag.length);
	});
});

describe('prevGraphemeSize', () => {
	it('returns 1 for ASCII characters', () => {
		expect(prevGraphemeSize('hello', 1)).toBe(1);
		expect(prevGraphemeSize('hello', 5)).toBe(1);
	});

	it('returns 2 for surrogate pair emoji', () => {
		const text = '\u{1F44B}hello';
		expect(prevGraphemeSize(text, 2)).toBe(2);
	});

	it('returns full size for ZWJ sequence', () => {
		const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
		expect(prevGraphemeSize(family, family.length)).toBe(family.length);
	});

	it('returns 2 for combining character', () => {
		expect(prevGraphemeSize('e\u0301', 2)).toBe(2);
	});

	it('returns 0 at offset 0', () => {
		expect(prevGraphemeSize('hello', 0)).toBe(0);
	});

	it('returns 0 for empty string', () => {
		expect(prevGraphemeSize('', 0)).toBe(0);
	});

	it('returns correct size for emoji at end of string', () => {
		// "abc" + wave emoji
		const text = 'abc\u{1F44B}';
		expect(prevGraphemeSize(text, text.length)).toBe(2);
	});

	it('returns 1 for ASCII after emoji', () => {
		// wave emoji + "b"
		expect(prevGraphemeSize('\u{1F44B}b', 3)).toBe(1);
	});
});
