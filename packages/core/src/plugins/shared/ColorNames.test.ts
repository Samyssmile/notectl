import { describe, expect, it } from 'vitest';
import { getColorName, isLightColor } from './ColorNames.js';

describe('ColorNames', () => {
	describe('getColorName', () => {
		it('returns name for known text color palette colors', () => {
			expect(getColorName('#000000')).toBe('Black');
			expect(getColorName('#ff0000')).toBe('Red');
			expect(getColorName('#ffffff')).toBe('White');
			expect(getColorName('#4a86e8')).toBe('Cornflower Blue');
			expect(getColorName('#9900ff')).toBe('Purple');
		});

		it('returns name for known highlight palette colors', () => {
			expect(getColorName('#fff176')).toBe('Bright Yellow');
			expect(getColorName('#80cbc4')).toBe('Teal');
			expect(getColorName('#f48fb1')).toBe('Pink');
			expect(getColorName('#66bb6a')).toBe('Emerald');
		});

		it('is case-insensitive', () => {
			expect(getColorName('#FF0000')).toBe('Red');
			expect(getColorName('#Ff0000')).toBe('Red');
		});

		it('returns tint/shade names for palette variations', () => {
			expect(getColorName('#f4cccc')).toBe('Light Red 3');
			expect(getColorName('#ea9999')).toBe('Light Red 2');
			expect(getColorName('#e06666')).toBe('Light Red 1');
			expect(getColorName('#cc0000')).toBe('Dark Red 1');
			expect(getColorName('#990000')).toBe('Dark Red 2');
		});

		it('returns gray names', () => {
			expect(getColorName('#434343')).toBe('Dark Gray 4');
			expect(getColorName('#999999')).toBe('Dark Gray 2');
			expect(getColorName('#cccccc')).toBe('Light Gray 3');
			expect(getColorName('#efefef')).toBe('Light Gray 1');
		});

		it('falls back to computed description for unknown colors', () => {
			const name: string = getColorName('#ff3366');
			expect(name).toBeTruthy();
			expect(typeof name).toBe('string');
		});

		it('describes unknown achromatic colors', () => {
			expect(getColorName('#111111')).toBe('Black');
			expect(getColorName('#555555')).toBe('Dark Gray');
			expect(getColorName('#777777')).toBe('Gray');
			expect(getColorName('#aaaaaa')).toBe('Light Gray');
		});

		it('describes unknown chromatic colors with hue and lightness', () => {
			// Pure-ish blue at medium lightness
			const name: string = getColorName('#3344ff');
			expect(name).toContain('Blue');
		});

		it('handles 3-digit hex via fallback', () => {
			// #f00 = Red, but not in the map (which has #ff0000)
			const name: string = getColorName('#f00');
			expect(name).toBeTruthy();
			expect(name).toContain('Red');
		});
	});

	describe('isLightColor', () => {
		it('returns true for white', () => {
			expect(isLightColor('#ffffff')).toBe(true);
		});

		it('returns true for near-white colors', () => {
			expect(isLightColor('#f3f3f3')).toBe(true);
			expect(isLightColor('#efefef')).toBe(true);
			expect(isLightColor('#fafafa')).toBe(true);
		});

		it('returns true for light yellows', () => {
			expect(isLightColor('#ffff00')).toBe(true);
			expect(isLightColor('#fff2cc')).toBe(true);
		});

		it('returns false for black', () => {
			expect(isLightColor('#000000')).toBe(false);
		});

		it('returns false for dark colors', () => {
			expect(isLightColor('#980000')).toBe(false);
			expect(isLightColor('#0000ff')).toBe(false);
			expect(isLightColor('#351c75')).toBe(false);
		});

		it('returns false for vivid red', () => {
			expect(isLightColor('#ff0000')).toBe(false);
		});

		it('handles 3-digit hex', () => {
			expect(isLightColor('#fff')).toBe(true);
			expect(isLightColor('#000')).toBe(false);
		});
	});
});
