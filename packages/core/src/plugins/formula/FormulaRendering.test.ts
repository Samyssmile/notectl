import { describe, expect, it } from 'vitest';
import { mathMarkup, readFormulaAttrs } from './FormulaRendering.js';

describe('readFormulaAttrs', () => {
	it('reads string attributes with safe defaults', () => {
		expect(readFormulaAttrs({ mathml: '<math></math>', latex: 'x', alt: 'ex' })).toEqual({
			mathml: '<math></math>',
			latex: 'x',
			alt: 'ex',
		});
	});

	it('falls back to empty strings for missing or non-string values', () => {
		expect(readFormulaAttrs(undefined)).toEqual({ mathml: '', latex: '', alt: '' });
		expect(readFormulaAttrs({ mathml: 42 })).toEqual({ mathml: '', latex: '', alt: '' });
	});
});

describe('mathMarkup', () => {
	it('returns the math markup with alttext injected', () => {
		const markup = mathMarkup({
			mathml: '<math display="inline"><mi>x</mi></math>',
			latex: 'x',
			alt: 'ex',
		});
		expect(markup).toContain('alttext="ex"');
		expect(markup).toContain('<mi>x</mi>');
	});

	it('returns empty string when there is no math element', () => {
		expect(mathMarkup({ mathml: 'not math', latex: 'x', alt: '' })).toBe('');
	});
});
