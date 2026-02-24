import { describe, expect, it } from 'vitest';
import { isValidHexColor, resolveColors } from './ColorValidation.js';

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
});
