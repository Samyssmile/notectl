/**
 * Font-size HTML round-trip for formulas (issue #160). The size is carried as
 * the native MathML `mathsize` attribute. A full serialize → parse round-trip
 * through `DocumentSerializer` cannot be unit-tested because happy-dom's
 * DOMPurify strips MathML (it is only namespaced in a real browser, see the
 * e2e `formula.spec.ts`), so these tests exercise the serialization functions
 * directly; the encoding logic is where the bug lived.
 */

import { describe, expect, it } from 'vitest';
import { createInlineNode } from '../../model/Document.js';
import { inlineType } from '../../model/TypeBrands.js';
import { createDisplayMathNodeSpec } from './DisplayMathNodeSpec.js';
import {
	formulaToHTMLString,
	parseFormulaElement,
	readFormulaFontSize,
} from './FormulaSerialization.js';
import { INLINE_MATH_TYPE } from './FormulaTypes.js';
import { createInlineMathNodeSpec } from './InlineMathNodeSpec.js';
import { buildMathML, withMathsize } from './mathml/MathMLDocument.js';

const INLINE_MATHML: string = buildMathML({
	presentation: '<mrow><mi>x</mi></mrow>',
	display: false,
	latex: 'x',
	alt: 'x',
});

const DISPLAY_MATHML: string = buildMathML({
	presentation: '<mrow><mi>E</mi><mo>=</mo><mi>m</mi></mrow>',
	display: true,
	latex: 'E=m',
	alt: 'E equals m',
});

/** Parses a `<math>` HTML string into a single element (bypasses DOMPurify). */
function mathElement(html: string): HTMLElement {
	const template: HTMLTemplateElement = document.createElement('template');
	template.innerHTML = html;
	const el: Element | null = template.content.firstElementChild;
	if (!el) throw new Error('no element parsed');
	return el as HTMLElement;
}

function asParsed(value: Record<string, string> | false): Record<string, string> {
	if (value === false) throw new Error('expected parsed attrs, got false');
	return value;
}

describe('formulaToHTMLString — export', () => {
	it('emits the font size as a native mathsize attribute', () => {
		const html: string = formulaToHTMLString({
			mathml: INLINE_MATHML,
			latex: 'x',
			alt: 'x',
			fontSize: '48px',
		});
		expect(html).toContain('mathsize="48px"');
		expect(html).toMatch(/^<math\b/);
	});

	it('omits mathsize when the formula has no size', () => {
		const html: string = formulaToHTMLString({
			mathml: INLINE_MATHML,
			latex: 'x',
			alt: 'x',
			fontSize: '',
		});
		expect(html).not.toContain('mathsize');
	});

	it('omits an invalid (non-CSS) size rather than emitting it', () => {
		const html: string = formulaToHTMLString({
			mathml: INLINE_MATHML,
			latex: 'x',
			alt: 'x',
			fontSize: 'expression(evil)',
		});
		expect(html).not.toContain('mathsize');
	});

	it('returns empty markup for an empty formula', () => {
		expect(formulaToHTMLString({ mathml: '', latex: '', alt: '', fontSize: '48px' })).toBe('');
	});
});

describe('parseFormulaElement — import', () => {
	it('lifts mathsize into fontSize and strips it from the stored mathml (inline)', () => {
		const el: HTMLElement = mathElement(withMathsize(INLINE_MATHML, '48px'));
		const parsed: Record<string, string> = asParsed(parseFormulaElement(el, false));
		expect(parsed.fontSize).toBe('48px');
		expect(parsed.mathml).not.toContain('mathsize');
		expect(parsed.latex).toBe('x');
		expect(parsed.alt).toBe('x');
	});

	it('lifts mathsize into fontSize for a display formula', () => {
		const el: HTMLElement = mathElement(withMathsize(DISPLAY_MATHML, '64px'));
		const parsed: Record<string, string> = asParsed(parseFormulaElement(el, true));
		expect(parsed.fontSize).toBe('64px');
		expect(parsed.mathml).not.toContain('mathsize');
	});

	it('reports no fontSize when the element carries none', () => {
		const el: HTMLElement = mathElement(INLINE_MATHML);
		expect(asParsed(parseFormulaElement(el, false)).fontSize).toBe('');
	});

	it('ignores an invalid (non-CSS) mathsize value', () => {
		const el: HTMLElement = mathElement(
			withMathsize(INLINE_MATHML, '48px').replace('48px', 'url(x)'),
		);
		expect(asParsed(parseFormulaElement(el, false)).fontSize).toBe('');
	});

	it('yields to the other spec when the display kind does not match', () => {
		expect(parseFormulaElement(mathElement(INLINE_MATHML), true)).toBe(false);
		expect(parseFormulaElement(mathElement(DISPLAY_MATHML), false)).toBe(false);
	});
});

describe('readFormulaFontSize', () => {
	it('returns a valid mathsize value', () => {
		expect(readFormulaFontSize(mathElement(withMathsize(INLINE_MATHML, '32px')))).toBe('32px');
	});

	it('returns empty string when mathsize is absent or invalid', () => {
		expect(readFormulaFontSize(mathElement(INLINE_MATHML))).toBe('');
		expect(readFormulaFontSize(mathElement('<math mathsize="javascript:1">x</math>'))).toBe('');
	});
});

describe('node specs wire the size round-trip', () => {
	it('inline spec exports and re-reads the font size', () => {
		const spec = createInlineMathNodeSpec();
		const node = createInlineNode(inlineType(INLINE_MATH_TYPE), {
			mathml: INLINE_MATHML,
			latex: 'x',
			alt: 'x',
			fontSize: '24px',
		});
		const html: string = spec.toHTMLString?.(node) ?? '';
		expect(html).toContain('mathsize="24px"');

		const rule = spec.parseHTML?.find((r) => r.tag === 'math');
		const attrs = rule?.getAttrs?.(mathElement(html));
		expect(attrs).not.toBe(false);
		expect((attrs as Record<string, unknown>).fontSize).toBe('24px');
	});

	it('display spec exports and re-reads the font size', () => {
		const spec = createDisplayMathNodeSpec();
		const html: string =
			spec.toHTML?.(
				{
					id: 'd1',
					type: 'math_display',
					attrs: { mathml: DISPLAY_MATHML, latex: 'E=m', alt: 'E equals m', fontSize: '96px' },
					children: [],
				} as never,
				'',
				undefined,
			) ?? '';
		expect(html).toContain('mathsize="96px"');

		const rule = spec.parseHTML?.find((r) => r.tag === 'math');
		const attrs = rule?.getAttrs?.(mathElement(html));
		expect((attrs as Record<string, unknown>).fontSize).toBe('96px');
	});
});
