import { describe, expect, it } from 'vitest';
import { MATHML_ATTRS, MATHML_TAGS } from './MathMLSanitize.js';

describe('MathML sanitization allowlist', () => {
	it('allows the presentation elements the converter emits', () => {
		for (const tag of [
			'math',
			'semantics',
			'annotation',
			'mrow',
			'mi',
			'mn',
			'mo',
			'mtext',
			'mfrac',
			'msqrt',
			'mroot',
			'msup',
			'msub',
			'msubsup',
			'mover',
			'munder',
			'munderover',
			'mtable',
			'mtr',
			'mtd',
			'mspace',
			'mstyle',
		]) {
			expect(MATHML_TAGS, `${tag} should be allowed`).toContain(tag);
		}
	});

	it('excludes annotation-xml (HTML integration point / mutation-XSS surface)', () => {
		// `<annotation-xml encoding="text/html">` re-parses its children as HTML when
		// the stored string is assigned via innerHTML. The converter never emits it.
		expect(MATHML_TAGS).not.toContain('annotation-xml');
	});

	it('excludes HTML and script-bearing elements', () => {
		for (const tag of ['script', 'style', 'img', 'iframe', 'svg', 'foreignObject', 'mglyph']) {
			expect(MATHML_TAGS, `${tag} must not be allowed`).not.toContain(tag);
		}
	});

	it('excludes event-handler and URL-bearing attributes', () => {
		for (const attr of ['onerror', 'onclick', 'onload', 'href', 'xlink:href', 'src', 'style']) {
			expect(MATHML_ATTRS, `${attr} must not be allowed`).not.toContain(attr);
		}
	});

	it('allows the presentation attributes the converter and paste path need', () => {
		for (const attr of ['display', 'encoding', 'mathvariant', 'stretchy', 'fence', 'alttext']) {
			expect(MATHML_ATTRS, `${attr} should be allowed`).toContain(attr);
		}
	});
});
