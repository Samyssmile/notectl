import { describe, expect, it } from 'vitest';
import {
	isValidCSSColor,
	isValidCSSFontFamily,
	isValidCSSFontSize,
	isValidHexColor,
	resolveColors,
} from './ColorValidation.js';

const FALLBACK: readonly string[] = ['#aaa', '#bbb', '#ccc'];

describe('ColorValidation', () => {
	describe('isValidHexColor', () => {
		it('accepts 6-digit hex', () => {
			expect(isValidHexColor('#ff0000')).toBe(true);
		});

		it('accepts 3-digit hex', () => {
			expect(isValidHexColor('#f00')).toBe(true);
		});

		it('is case-insensitive', () => {
			expect(isValidHexColor('#FF00AA')).toBe(true);
		});

		it('rejects named colors', () => {
			expect(isValidHexColor('red')).toBe(false);
		});

		it('rejects hex without hash', () => {
			expect(isValidHexColor('ff0000')).toBe(false);
		});

		it('rejects rgb()', () => {
			expect(isValidHexColor('rgb(0,0,0)')).toBe(false);
		});

		it('rejects 4-digit hex', () => {
			expect(isValidHexColor('#ff00')).toBe(false);
		});

		it('rejects empty string', () => {
			expect(isValidHexColor('')).toBe(false);
		});
	});

	describe('isValidCSSColor', () => {
		// --- Hex ---
		it('accepts 6-digit hex', () => {
			expect(isValidCSSColor('#ff0000')).toBe(true);
		});

		it('accepts 3-digit hex', () => {
			expect(isValidCSSColor('#f00')).toBe(true);
		});

		it('accepts uppercase hex', () => {
			expect(isValidCSSColor('#FF00AA')).toBe(true);
		});

		// --- RGB / RGBA ---
		it('accepts rgb()', () => {
			expect(isValidCSSColor('rgb(255, 0, 0)')).toBe(true);
		});

		it('accepts rgb() without spaces', () => {
			expect(isValidCSSColor('rgb(255,0,0)')).toBe(true);
		});

		it('accepts rgba()', () => {
			expect(isValidCSSColor('rgba(255, 0, 0, 0.5)')).toBe(true);
		});

		it('accepts rgba() with alpha 0', () => {
			expect(isValidCSSColor('rgba(0, 0, 0, 0)')).toBe(true);
		});

		it('accepts rgba() with alpha 1', () => {
			expect(isValidCSSColor('rgba(0, 0, 0, 1)')).toBe(true);
		});

		it('accepts rgb() with percentage values', () => {
			expect(isValidCSSColor('rgb(100%, 0%, 50%)')).toBe(true);
		});

		// --- HSL / HSLA ---
		it('accepts hsl()', () => {
			expect(isValidCSSColor('hsl(120, 100%, 50%)')).toBe(true);
		});

		it('accepts hsla()', () => {
			expect(isValidCSSColor('hsla(120, 100%, 50%, 0.5)')).toBe(true);
		});

		// --- Named colors ---
		it('accepts named color "red"', () => {
			expect(isValidCSSColor('red')).toBe(true);
		});

		it('accepts named color "transparent"', () => {
			expect(isValidCSSColor('transparent')).toBe(true);
		});

		it('accepts named color case-insensitively', () => {
			expect(isValidCSSColor('DarkSlateGray')).toBe(true);
		});

		it('accepts named color "rebeccapurple"', () => {
			expect(isValidCSSColor('rebeccapurple')).toBe(true);
		});

		// --- Rejection: injection strings ---
		it('rejects CSS injection via semicolon', () => {
			expect(isValidCSSColor('red; background: url(evil)')).toBe(false);
		});

		it('rejects expression() injection', () => {
			expect(isValidCSSColor('expression(alert(1))')).toBe(false);
		});

		it('rejects url() injection', () => {
			expect(isValidCSSColor('url(javascript:alert(1))')).toBe(false);
		});

		it('rejects value with curly braces', () => {
			expect(isValidCSSColor('red} .evil { color: green')).toBe(false);
		});

		it('rejects arbitrary strings', () => {
			expect(isValidCSSColor('not-a-color')).toBe(false);
		});

		// --- Rejection: edge cases ---
		it('rejects empty string', () => {
			expect(isValidCSSColor('')).toBe(false);
		});

		it('rejects whitespace-only string', () => {
			expect(isValidCSSColor('   ')).toBe(false);
		});

		it('rejects hex without hash', () => {
			expect(isValidCSSColor('ff0000')).toBe(false);
		});

		it('rejects 4-digit hex', () => {
			expect(isValidCSSColor('#ff00')).toBe(false);
		});
	});

	describe('resolveColors', () => {
		it('returns fallback when colors is undefined', () => {
			expect(resolveColors(undefined, FALLBACK, 'Test')).toBe(FALLBACK);
		});

		it('returns fallback when colors is empty', () => {
			expect(resolveColors([], FALLBACK, 'Test')).toBe(FALLBACK);
		});

		it('returns validated custom colors', () => {
			const result = resolveColors(['#ff0000', '#00ff00'], FALLBACK, 'Test');
			expect(result).toEqual(['#ff0000', '#00ff00']);
		});

		it('normalizes colors to lowercase', () => {
			const result = resolveColors(['#FF0000', '#00FF00'], FALLBACK, 'Test');
			expect(result).toEqual(['#ff0000', '#00ff00']);
		});

		it('deduplicates case-insensitively', () => {
			const result = resolveColors(['#FF0000', '#ff0000', '#00FF00'], FALLBACK, 'Test');
			expect(result).toEqual(['#ff0000', '#00ff00']);
		});

		it('throws on invalid color with plugin name', () => {
			expect(() => resolveColors(['red'], FALLBACK, 'MyPlugin')).toThrow(
				'MyPlugin: invalid hex color(s): red. Expected format: #RGB or #RRGGBB.',
			);
		});

		it('throws listing all invalid values', () => {
			expect(() => resolveColors(['#ff0000', 'bad', 'rgb(0,0,0)'], FALLBACK, 'X')).toThrow(
				'X: invalid hex color(s): bad, rgb(0,0,0)',
			);
		});

		it('accepts shorthand hex colors', () => {
			const result = resolveColors(['#f00', '#0f0'], FALLBACK, 'Test');
			expect(result).toEqual(['#f00', '#0f0']);
		});
	});

	describe('isValidCSSFontFamily', () => {
		it('accepts simple font family', () => {
			expect(isValidCSSFontFamily('Arial')).toBe(true);
		});

		it('accepts quoted font family with fallback', () => {
			expect(isValidCSSFontFamily("'Fira Code', monospace")).toBe(true);
		});

		it('rejects value with curly braces', () => {
			expect(isValidCSSFontFamily('Arial} .evil { color: red')).toBe(false);
		});

		it('rejects value with semicolon', () => {
			expect(isValidCSSFontFamily('Arial; background: url(evil)')).toBe(false);
		});

		it('rejects url() injection', () => {
			expect(isValidCSSFontFamily('url(evil)')).toBe(false);
		});

		it('rejects expression() injection', () => {
			expect(isValidCSSFontFamily('expression(alert(1))')).toBe(false);
		});

		it('rejects empty string', () => {
			expect(isValidCSSFontFamily('')).toBe(false);
		});

		it('rejects whitespace-only', () => {
			expect(isValidCSSFontFamily('   ')).toBe(false);
		});

		it('rejects value with angle brackets', () => {
			expect(isValidCSSFontFamily('Arial<script>')).toBe(false);
		});
	});

	describe('isValidCSSFontSize', () => {
		it('accepts 16px', () => {
			expect(isValidCSSFontSize('16px')).toBe(true);
		});

		it('accepts 1.5em', () => {
			expect(isValidCSSFontSize('1.5em')).toBe(true);
		});

		it('accepts 12pt', () => {
			expect(isValidCSSFontSize('12pt')).toBe(true);
		});

		it('accepts 100%', () => {
			expect(isValidCSSFontSize('100%')).toBe(true);
		});

		it('accepts 0.875rem', () => {
			expect(isValidCSSFontSize('0.875rem')).toBe(true);
		});

		it('rejects expression()', () => {
			expect(isValidCSSFontSize('expression(alert(1))')).toBe(false);
		});

		it('rejects arbitrary string', () => {
			expect(isValidCSSFontSize('large')).toBe(false);
		});

		it('rejects empty string', () => {
			expect(isValidCSSFontSize('')).toBe(false);
		});

		it('rejects number without unit', () => {
			expect(isValidCSSFontSize('16')).toBe(false);
		});
	});
});
