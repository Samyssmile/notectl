import { describe, expect, it } from 'vitest';
import {
	type MathAlphabetStyle,
	applyMathAlphabet,
	applyUprightIdentifiers,
	mathAlphaChar,
} from './MathAlphabet.js';

describe('mathAlphaChar contiguous blocks', () => {
	it('maps the uppercase bases', () => {
		expect(mathAlphaChar('A', 'double-struck')).toBe('𝔸');
		expect(mathAlphaChar('A', 'script')).toBe('𝒜');
		expect(mathAlphaChar('A', 'fraktur')).toBe('𝔄');
		expect(mathAlphaChar('A', 'bold')).toBe('𝐀');
		expect(mathAlphaChar('A', 'italic')).toBe('𝐴');
		expect(mathAlphaChar('A', 'sans-serif')).toBe('𝖠');
		expect(mathAlphaChar('A', 'monospace')).toBe('𝙰');
	});

	it('maps the lowercase bases', () => {
		expect(mathAlphaChar('a', 'double-struck')).toBe('𝕒');
		expect(mathAlphaChar('a', 'script')).toBe('𝒶');
		expect(mathAlphaChar('a', 'fraktur')).toBe('𝔞');
		expect(mathAlphaChar('a', 'bold')).toBe('𝐚');
		expect(mathAlphaChar('a', 'italic')).toBe('𝑎');
		expect(mathAlphaChar('a', 'sans-serif')).toBe('𝖺');
		expect(mathAlphaChar('a', 'monospace')).toBe('𝚊');
	});

	it('maps an interior uppercase letter by offset', () => {
		expect(mathAlphaChar('x', 'bold')).toBe('𝐱');
		expect(mathAlphaChar('z', 'monospace')).toBe('𝚣');
	});
});

describe('mathAlphaChar Letterlike-Symbols holes', () => {
	it('maps every blackboard-bold hole', () => {
		expect(mathAlphaChar('C', 'double-struck')).toBe('ℂ');
		expect(mathAlphaChar('H', 'double-struck')).toBe('ℍ');
		expect(mathAlphaChar('N', 'double-struck')).toBe('ℕ');
		expect(mathAlphaChar('P', 'double-struck')).toBe('ℙ');
		expect(mathAlphaChar('Q', 'double-struck')).toBe('ℚ');
		expect(mathAlphaChar('R', 'double-struck')).toBe('ℝ');
		expect(mathAlphaChar('Z', 'double-struck')).toBe('ℤ');
	});

	it('maps every script hole', () => {
		expect(mathAlphaChar('B', 'script')).toBe('ℬ');
		expect(mathAlphaChar('E', 'script')).toBe('ℰ');
		expect(mathAlphaChar('F', 'script')).toBe('ℱ');
		expect(mathAlphaChar('H', 'script')).toBe('ℋ');
		expect(mathAlphaChar('I', 'script')).toBe('ℐ');
		expect(mathAlphaChar('L', 'script')).toBe('ℒ');
		expect(mathAlphaChar('M', 'script')).toBe('ℳ');
		expect(mathAlphaChar('R', 'script')).toBe('ℛ');
		expect(mathAlphaChar('e', 'script')).toBe('ℯ');
		expect(mathAlphaChar('g', 'script')).toBe('ℊ');
		expect(mathAlphaChar('o', 'script')).toBe('ℴ');
	});

	it('maps every fraktur hole', () => {
		expect(mathAlphaChar('C', 'fraktur')).toBe('ℭ');
		expect(mathAlphaChar('H', 'fraktur')).toBe('ℌ');
		expect(mathAlphaChar('I', 'fraktur')).toBe('ℑ');
		expect(mathAlphaChar('R', 'fraktur')).toBe('ℜ');
		expect(mathAlphaChar('Z', 'fraktur')).toBe('ℨ');
	});

	it('maps the lone italic lowercase-h hole', () => {
		expect(mathAlphaChar('h', 'italic')).toBe('ℎ');
	});
});

describe('mathAlphaChar digits', () => {
	it('maps digits for styles with a digit block', () => {
		expect(mathAlphaChar('0', 'double-struck')).toBe('𝟘');
		expect(mathAlphaChar('1', 'double-struck')).toBe('𝟙');
		expect(mathAlphaChar('9', 'double-struck')).toBe('𝟡');
		expect(mathAlphaChar('0', 'bold')).toBe('𝟎');
		expect(mathAlphaChar('5', 'sans-serif')).toBe('𝟧');
		expect(mathAlphaChar('7', 'monospace')).toBe('𝟽');
	});

	it('returns null for digits under styles without a digit block', () => {
		expect(mathAlphaChar('1', 'italic')).toBeNull();
		expect(mathAlphaChar('3', 'script')).toBeNull();
		expect(mathAlphaChar('5', 'fraktur')).toBeNull();
	});
});

describe('mathAlphaChar non-mappable input', () => {
	it('returns null for non-alphanumeric characters', () => {
		for (const ch of ['+', '-', ' ', '∑', '!', '.']) {
			expect(mathAlphaChar(ch, 'bold')).toBeNull();
		}
	});

	it('returns null for non-single-character input', () => {
		expect(mathAlphaChar('', 'bold')).toBeNull();
		expect(mathAlphaChar('ab', 'bold')).toBeNull();
	});

	it('emits astral code points (length 2 in UTF-16)', () => {
		const glyph: string | null = mathAlphaChar('A', 'bold');
		expect(glyph).not.toBeNull();
		expect((glyph ?? '').length).toBe(2);
		expect((glyph ?? '').codePointAt(0)).toBe(0x1d400);
	});
});

describe('applyMathAlphabet markup transform', () => {
	it('remaps a single leaf identifier', () => {
		expect(applyMathAlphabet('<mi>R</mi>', 'double-struck')).toBe('<mi>ℝ</mi>');
	});

	it('remaps each character inside a multi-letter identifier', () => {
		expect(applyMathAlphabet('<mi>AB</mi>', 'double-struck')).toBe('<mi>𝔸𝔹</mi>');
	});

	it('remaps every leaf identifier in an mrow', () => {
		expect(applyMathAlphabet('<mrow><mi>A</mi><mi>C</mi></mrow>', 'double-struck')).toBe(
			'<mrow><mi>𝔸</mi><mi>ℂ</mi></mrow>',
		);
	});

	it('remaps digits inside a number element', () => {
		expect(applyMathAlphabet('<mn>12</mn>', 'double-struck')).toBe('<mn>𝟙𝟚</mn>');
	});

	it('leaves operators and unmapped characters untouched', () => {
		expect(applyMathAlphabet('<mo>+</mo>', 'double-struck')).toBe('<mo>+</mo>');
		expect(applyMathAlphabet('<mn>1</mn>', 'italic')).toBe('<mn>1</mn>');
	});
});

describe('applyUprightIdentifiers', () => {
	it('adds mathvariant="normal" to bare identifiers', () => {
		expect(applyUprightIdentifiers('<mi>d</mi>')).toBe('<mi mathvariant="normal">d</mi>');
	});

	it('marks each identifier of an mrow upright and leaves numbers alone', () => {
		expect(applyUprightIdentifiers('<mrow><mi>a</mi><mn>1</mn></mrow>')).toBe(
			'<mrow><mi mathvariant="normal">a</mi><mn>1</mn></mrow>',
		);
	});

	it('covers the full MathAlphabetStyle union without throwing', () => {
		const styles: readonly MathAlphabetStyle[] = [
			'double-struck',
			'script',
			'fraktur',
			'bold',
			'italic',
			'sans-serif',
			'monospace',
		];
		for (const style of styles) {
			expect(typeof mathAlphaChar('A', style)).toBe('string');
		}
	});
});
