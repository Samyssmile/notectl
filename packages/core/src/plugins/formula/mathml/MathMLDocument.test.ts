import { describe, expect, it } from 'vitest';
import {
	TEX_ANNOTATION_ENCODING,
	buildMathML,
	extractTexAnnotation,
	findAllMathElements,
	findMathElement,
	isDisplayMath,
	stripBlockIds,
	stripMathsize,
	withAlttext,
	withMathsize,
} from './MathMLDocument.js';

describe('buildMathML', () => {
	it('wraps presentation with semantics + tex annotation when latex is given', () => {
		const out = buildMathML({ presentation: '<mi>x</mi>', display: false, latex: 'x' });
		const annotation = `<annotation encoding="${TEX_ANNOTATION_ENCODING}">x</annotation>`;
		expect(out).toBe(
			`<math display="inline"><semantics><mi>x</mi>${annotation}</semantics></math>`,
		);
	});

	it('omits the semantics wrapper when no latex is given', () => {
		const out = buildMathML({ presentation: '<mi>x</mi>', display: false });
		expect(out).toBe('<math display="inline"><mi>x</mi></math>');
	});

	it('marks display math with display="block"', () => {
		const out = buildMathML({ presentation: '<mn>1</mn>', display: true });
		expect(out).toContain('display="block"');
	});

	it('escapes the latex annotation content', () => {
		const out = buildMathML({ presentation: '<mi>a</mi>', display: false, latex: 'a < b & c' });
		expect(out).toContain('a &lt; b &amp; c');
	});

	it('adds an alttext attribute when alt is provided', () => {
		const out = buildMathML({ presentation: '<mi>x</mi>', display: false, alt: 'x squared' });
		expect(out).toContain('alttext="x squared"');
	});
});

describe('extractTexAnnotation', () => {
	it('reads the latex source back, unescaping entities', () => {
		const math = buildMathML({ presentation: '<mi>a</mi>', display: false, latex: 'a < b & c' });
		expect(extractTexAnnotation(math)).toBe('a < b & c');
	});

	it('returns undefined when there is no annotation', () => {
		expect(extractTexAnnotation('<math><mi>x</mi></math>')).toBeUndefined();
	});

	it('ignores non-tex annotations', () => {
		const math =
			'<math><semantics><mi>x</mi>' +
			'<annotation encoding="application/json">{}</annotation></semantics></math>';
		expect(extractTexAnnotation(math)).toBeUndefined();
	});
});

describe('isDisplayMath', () => {
	it('detects block display', () => {
		expect(isDisplayMath('<math display="block"><mn>1</mn></math>')).toBe(true);
	});

	it('returns false for inline display', () => {
		expect(isDisplayMath('<math display="inline"><mn>1</mn></math>')).toBe(false);
	});
});

describe('findMathElement / findAllMathElements', () => {
	it('extracts a single math element from surrounding html', () => {
		const html = '<p>before <math><mi>x</mi></math> after</p>';
		expect(findMathElement(html)).toBe('<math><mi>x</mi></math>');
	});

	it('extracts all math elements in order', () => {
		const html = '<math><mi>a</mi></math> and <math display="block"><mi>b</mi></math>';
		const all = findAllMathElements(html);
		expect(all).toHaveLength(2);
		expect(all[1]).toContain('display="block"');
	});

	it('returns undefined when no math is present', () => {
		expect(findMathElement('<p>plain text</p>')).toBeUndefined();
	});
});

describe('withAlttext', () => {
	it('adds alttext to a math root', () => {
		expect(withAlttext('<math display="inline"><mi>x</mi></math>', 'ex')).toBe(
			'<math alttext="ex" display="inline"><mi>x</mi></math>',
		);
	});

	it('replaces an existing alttext', () => {
		const input = '<math alttext="old"><mi>x</mi></math>';
		expect(withAlttext(input, 'new')).toBe('<math alttext="new"><mi>x</mi></math>');
	});

	it('removes alttext when given an empty label', () => {
		expect(withAlttext('<math alttext="old"><mi>x</mi></math>', '')).toBe(
			'<math><mi>x</mi></math>',
		);
	});
});

describe('stripBlockIds', () => {
	it('removes a data-block-id injected into the math root', () => {
		const input =
			'<math display="block" data-block-id="block-123"><semantics><mrow><mi>y</mi></mrow><annotation encoding="application/x-tex">y=2</annotation></semantics></math>';
		expect(stripBlockIds(input)).toBe(
			'<math display="block"><semantics><mrow><mi>y</mi></mrow><annotation encoding="application/x-tex">y=2</annotation></semantics></math>',
		);
	});

	it('handles single-quoted ids and leaves the annotation intact', () => {
		const input = "<math display='inline' data-block-id='b1'><mi>x</mi></math>";
		const out = stripBlockIds(input);
		expect(out).not.toContain('data-block-id');
		expect(out).toContain('<mi>x</mi>');
	});

	it('returns clean MathML unchanged', () => {
		const input = '<math display="inline"><mi>x</mi></math>';
		expect(stripBlockIds(input)).toBe(input);
	});
});

describe('withMathsize', () => {
	it('adds mathsize to a math root', () => {
		expect(withMathsize('<math display="inline"><mi>x</mi></math>', '48px')).toBe(
			'<math mathsize="48px" display="inline"><mi>x</mi></math>',
		);
	});

	it('replaces an existing mathsize', () => {
		const input = '<math mathsize="16px"><mi>x</mi></math>';
		expect(withMathsize(input, '64px')).toBe('<math mathsize="64px"><mi>x</mi></math>');
	});

	it('removes mathsize when given an empty size', () => {
		expect(withMathsize('<math mathsize="16px"><mi>x</mi></math>', '')).toBe(
			'<math><mi>x</mi></math>',
		);
	});
});

describe('stripMathsize', () => {
	it('removes a mathsize attribute from the math root', () => {
		expect(stripMathsize('<math display="block" mathsize="64px"><mi>y</mi></math>')).toBe(
			'<math display="block"><mi>y</mi></math>',
		);
	});

	it('handles single-quoted values', () => {
		expect(stripMathsize("<math mathsize='24px'><mi>x</mi></math>")).toBe(
			'<math><mi>x</mi></math>',
		);
	});

	it('returns size-free MathML unchanged', () => {
		const input = '<math display="inline"><mi>x</mi></math>';
		expect(stripMathsize(input)).toBe(input);
	});
});
