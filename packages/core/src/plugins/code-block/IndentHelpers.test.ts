import { describe, expect, it } from 'vitest';
import {
	dedentOnce,
	endsWithOpenBracket,
	getCurrentLineIndent,
	getLineRange,
	isBetweenBracketPair,
	isWhitespaceOnlyBeforeOffset,
	lastNonWhitespaceCharBeforeCursor,
	nextIndentLevel,
	resolveIndentUnit,
	shouldOpenIndentBlock,
} from './IndentHelpers.js';

describe('IndentHelpers', () => {
	describe('getLineRange', () => {
		it('returns the full range for a single-line block', () => {
			expect(getLineRange('hello', 2)).toEqual({ start: 0, end: 5 });
		});

		it('returns the correct line at a newline boundary', () => {
			const text = 'aa\nbb\ncc';
			expect(getLineRange(text, 3)).toEqual({ start: 3, end: 5 });
		});

		it('handles cursor at EOF', () => {
			const text = 'aa\nbb';
			expect(getLineRange(text, 5)).toEqual({ start: 3, end: 5 });
		});

		it('handles empty text', () => {
			expect(getLineRange('', 0)).toEqual({ start: 0, end: 0 });
		});
	});

	describe('getCurrentLineIndent', () => {
		it('returns the leading whitespace of the line', () => {
			expect(getCurrentLineIndent('  hello', 3)).toBe('  ');
		});

		it('returns tabs as-is', () => {
			expect(getCurrentLineIndent('\t\tfn', 2)).toBe('\t\t');
		});

		it('preserves mixed tabs and spaces', () => {
			expect(getCurrentLineIndent('\t \tfn', 4)).toBe('\t \t');
		});

		it('returns empty string for non-indented lines', () => {
			expect(getCurrentLineIndent('fn()', 1)).toBe('');
		});

		it('returns indent of the cursor line, not the whole text', () => {
			const text = '\tabc\n    def';
			expect(getCurrentLineIndent(text, 8)).toBe('    ');
		});
	});

	describe('lastNonWhitespaceCharBeforeCursor', () => {
		it('returns the last non-whitespace char on the prefix', () => {
			expect(lastNonWhitespaceCharBeforeCursor('fn() {', 6)).toBe('{');
		});

		it('skips trailing whitespace', () => {
			expect(lastNonWhitespaceCharBeforeCursor('fn() {   ', 9)).toBe('{');
		});

		it('returns empty string for whitespace-only lines', () => {
			expect(lastNonWhitespaceCharBeforeCursor('   ', 3)).toBe('');
		});

		it('does not cross newlines', () => {
			expect(lastNonWhitespaceCharBeforeCursor('abc\n   ', 7)).toBe('');
		});
	});

	describe('isWhitespaceOnlyBeforeOffset', () => {
		it('returns true for leading whitespace only', () => {
			expect(isWhitespaceOnlyBeforeOffset('    ', 4)).toBe(true);
		});

		it('returns false when content precedes the cursor', () => {
			expect(isWhitespaceOnlyBeforeOffset('  x', 3)).toBe(false);
		});

		it('handles cursor at offset 0', () => {
			expect(isWhitespaceOnlyBeforeOffset('hello', 0)).toBe(true);
		});

		it('does not cross newlines', () => {
			expect(isWhitespaceOnlyBeforeOffset('abc\n  ', 6)).toBe(true);
		});
	});

	describe('endsWithOpenBracket', () => {
		it('detects trailing curly', () => {
			expect(endsWithOpenBracket('function foo() {', 16)).toBe(true);
		});

		it('detects trailing paren', () => {
			expect(endsWithOpenBracket('call(', 5)).toBe(true);
		});

		it('detects trailing bracket', () => {
			expect(endsWithOpenBracket('arr[', 4)).toBe(true);
		});

		it('returns false for close brackets', () => {
			expect(endsWithOpenBracket('foo }', 5)).toBe(false);
		});

		it('returns false on whitespace-only line', () => {
			expect(endsWithOpenBracket('   ', 3)).toBe(false);
		});

		it('ignores trailing whitespace after open bracket', () => {
			expect(endsWithOpenBracket('foo {  ', 7)).toBe(true);
		});
	});

	describe('isBetweenBracketPair', () => {
		it('detects {|}', () => {
			expect(isBetweenBracketPair('{}', 1)).toBe(true);
		});

		it('detects [|]', () => {
			expect(isBetweenBracketPair('[]', 1)).toBe(true);
		});

		it('detects (|)', () => {
			expect(isBetweenBracketPair('()', 1)).toBe(true);
		});

		it('returns false for mismatched pairs', () => {
			expect(isBetweenBracketPair('{]', 1)).toBe(false);
		});

		it('returns false at line start', () => {
			expect(isBetweenBracketPair('{}', 0)).toBe(false);
		});
	});

	describe('resolveIndentUnit', () => {
		it('returns tab when useSpaces=false', () => {
			expect(resolveIndentUnit(false, 4)).toBe('\t');
		});

		it('returns N spaces when useSpaces=true', () => {
			expect(resolveIndentUnit(true, 4)).toBe('    ');
		});
	});

	describe('dedentOnce', () => {
		it('removes a single tab', () => {
			expect(dedentOnce('\thello', false, 2)).toEqual({ removed: '\t', rest: 'hello' });
		});

		it('removes N spaces', () => {
			expect(dedentOnce('    hi', true, 4)).toEqual({ removed: '    ', rest: 'hi' });
		});

		it('removes partial space prefix when fewer than N spaces present', () => {
			expect(dedentOnce('  hi', true, 4)).toEqual({ removed: '  ', rest: 'hi' });
		});

		it('returns empty removal when line has no leading whitespace', () => {
			expect(dedentOnce('foo', true, 2)).toEqual({ removed: '', rest: 'foo' });
		});

		it('returns empty removal for empty line', () => {
			expect(dedentOnce('', true, 2)).toEqual({ removed: '', rest: '' });
		});
	});

	describe('nextIndentLevel', () => {
		it("mode='none' returns empty", () => {
			expect(nextIndentLevel('  fn()', 6, 'none', '\t')).toBe('');
		});

		it("mode='keep' returns the line indent only", () => {
			expect(nextIndentLevel('  fn() {', 8, 'keep', '\t')).toBe('  ');
		});

		it("mode='brackets' adds extra unit after open bracket", () => {
			expect(nextIndentLevel('  fn() {', 8, 'brackets', '  ')).toBe('    ');
		});

		it("mode='brackets' returns line indent only when no open bracket", () => {
			expect(nextIndentLevel('  fn();', 7, 'brackets', '\t')).toBe('  ');
		});
	});

	describe('shouldOpenIndentBlock', () => {
		it('matches {|}', () => {
			expect(shouldOpenIndentBlock('{}', 1)).toBe(true);
		});

		it('does not match nearby positions', () => {
			expect(shouldOpenIndentBlock('{}', 0)).toBe(false);
			expect(shouldOpenIndentBlock('{}', 2)).toBe(false);
		});
	});
});
