import { describe, expect, it } from 'vitest';
import { createInlineNode } from '../../model/Document.js';
import { inlineType } from '../../model/TypeBrands.js';
import { mathMarkup, readFormulaAttrs, setFormulaFontSize } from './FormulaRendering.js';
import { createInlineMathNodeSpec } from './InlineMathNodeSpec.js';

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

describe('setFormulaFontSize', () => {
	it('applies the fontSize attr to the host style', () => {
		const host: HTMLElement = document.createElement('div');
		setFormulaFontSize(host, { fontSize: '48px' });
		expect(host.style.fontSize).toBe('48px');
	});

	it('clears the host fontSize when the attr is empty or missing', () => {
		const host: HTMLElement = document.createElement('div');
		host.style.fontSize = '48px';
		setFormulaFontSize(host, { fontSize: '' });
		expect(host.style.fontSize).toBe('');
		host.style.fontSize = '48px';
		setFormulaFontSize(host, {});
		expect(host.style.fontSize).toBe('');
	});
});

describe('inline math node spec rendering', () => {
	it('applies the node fontSize attr to the rendered element', () => {
		const spec = createInlineMathNodeSpec();
		const node = createInlineNode(inlineType('math_inline'), {
			mathml: '<math><mi>x</mi></math>',
			fontSize: '32px',
		});
		const el: HTMLElement = spec.toDOM(node);
		expect(el.style.fontSize).toBe('32px');
	});
});
