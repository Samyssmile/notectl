import { describe, expect, it } from 'vitest';
import { isStandaloneMathHtml } from './FormulaPasteInterceptor.js';

// NOTE: the DOMPurify sanitization path (sanitizeMath) cannot be unit-tested here:
// happy-dom has no MathML namespace, so DOMPurify drops `<math>` entirely (returns '').
// Allowlist invariants are locked in MathMLSanitize.test.ts, and the real
// browser sanitization behaviour is covered by e2e/formula.spec.ts.

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
