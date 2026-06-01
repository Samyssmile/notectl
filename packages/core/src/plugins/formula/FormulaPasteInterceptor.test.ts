import { describe, expect, it } from 'vitest';
import { isStandaloneMathHtml } from './FormulaPasteInterceptor.js';

describe('isStandaloneMathHtml', () => {
	it('accepts a bare math element', () => {
		expect(isStandaloneMathHtml('<math><mi>x</mi></math>')).toBe(true);
	});

	it('accepts a KaTeX clipboard fragment (aria-hidden visual layer + assistive math)', () => {
		const katex =
			'<span class="katex">' +
			'<span class="katex-mathml"><math><semantics><mrow><mi>x</mi></mrow>' +
			'<annotation encoding="application/x-tex">x</annotation></semantics></math></span>' +
			'<span class="katex-html" aria-hidden="true"><span class="base">x</span></span>' +
			'</span>';
		expect(isStandaloneMathHtml(katex)).toBe(true);
	});

	it('accepts a MathJax container with assistive math', () => {
		const mathjax =
			'<mjx-container class="MathJax"><math><mi>y</mi></math>' +
			'<mjx-assistive-mml aria-hidden="true"><math><mi>y</mi></math></mjx-assistive-mml>' +
			'</mjx-container>';
		expect(isStandaloneMathHtml(mathjax)).toBe(true);
	});

	it('rejects mixed rich content (text alongside a formula)', () => {
		expect(isStandaloneMathHtml('<p>Let <math><mi>x</mi></math> be positive.</p>')).toBe(false);
	});

	it('rejects html with no math', () => {
		expect(isStandaloneMathHtml('<p>just text</p>')).toBe(false);
		expect(isStandaloneMathHtml('')).toBe(false);
	});
});
