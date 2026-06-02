import { describe, expect, it } from 'vitest';
import { latexToMathML } from './LatexToMathML.js';

function render(latex: string, display = false): string {
	return latexToMathML(latex, { display }).presentation;
}

describe('entry contract', () => {
	it('returns an empty mrow for empty input', () => {
		const result = latexToMathML('');
		expect(result.presentation).toBe('<mrow></mrow>');
		expect(result.errors).toEqual([]);
	});

	it('treats whitespace-only input as empty', () => {
		expect(render('   ')).toBe('<mrow></mrow>');
	});

	it('returns a single element root unwrapped', () => {
		expect(render('x')).toBe('<mi>x</mi>');
	});

	it('wraps multiple top-level atoms in one mrow root', () => {
		expect(render('a+b')).toBe('<mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow>');
	});

	it('never throws on arbitrary input', () => {
		expect(() => render('}{)(^_&\\\\\\right\\end{x}')).not.toThrow();
	});

	it('recovers from pathologically deep nesting instead of overflowing the stack', () => {
		const deep = '{'.repeat(20000) + '}'.repeat(20000);
		expect(() => latexToMathML(deep)).not.toThrow();
		const result = latexToMathML(deep);
		expect(result.presentation).toBeTypeOf('string');
		expect(result.errors.some((e) => e.message.toLowerCase().includes('depth'))).toBe(true);
	});

	it('recovers from deep unbalanced nesting instead of overflowing the stack', () => {
		expect(() => latexToMathML('{'.repeat(20000))).not.toThrow();
	});
});

describe('ordinary atoms', () => {
	it('renders letters as mi and digits as mn', () => {
		expect(render('a1')).toBe('<mrow><mi>a</mi><mn>1</mn></mrow>');
	});

	it('groups multi-digit numbers and decimals', () => {
		expect(render('3.14')).toBe('<mn>3.14</mn>');
	});

	it('renders binary operators and relations as mo', () => {
		expect(render('a-b')).toBe('<mrow><mi>a</mi><mo>-</mo><mi>b</mi></mrow>');
		expect(render('a=b')).toBe('<mrow><mi>a</mi><mo>=</mo><mi>b</mi></mrow>');
	});

	it('escapes < and > as operators', () => {
		expect(render('a<b')).toBe('<mrow><mi>a</mi><mo>&lt;</mo><mi>b</mi></mrow>');
	});
});

describe('superscripts and subscripts', () => {
	it('attaches a superscript', () => {
		expect(render('x^2')).toBe('<msup><mi>x</mi><mn>2</mn></msup>');
	});

	it('attaches a subscript', () => {
		expect(render('x_i')).toBe('<msub><mi>x</mi><mi>i</mi></msub>');
	});

	it('combines sub and super into msubsup regardless of order', () => {
		expect(render('x_i^2')).toBe('<msubsup><mi>x</mi><mi>i</mi><mn>2</mn></msubsup>');
		expect(render('x^2_i')).toBe('<msubsup><mi>x</mi><mi>i</mi><mn>2</mn></msubsup>');
	});

	it('uses a group as the script body', () => {
		expect(render('x^{i+1}')).toBe(
			'<msup><mi>x</mi><mrow><mi>i</mi><mo>+</mo><mn>1</mn></mrow></msup>',
		);
	});

	it('renders a prime as a superscript', () => {
		expect(render("f'")).toBe('<msup><mi>f</mi><mo>′</mo></msup>');
	});

	it('accumulates multiple primes', () => {
		expect(render("f''")).toBe('<msup><mi>f</mi><mo>′′</mo></msup>');
	});

	it('combines an explicit superscript with primes', () => {
		expect(render("f'^2")).toBe('<msup><mi>f</mi><mrow><mo>′</mo><mn>2</mn></mrow></msup>');
	});

	it('recovers from a double superscript without throwing', () => {
		const result = latexToMathML('a^b^c');
		expect(result.presentation).toBe('<msup><mi>a</mi><mrow><mi>b</mi><mi>c</mi></mrow></msup>');
		expect(result.errors).toEqual([{ message: 'Double superscript' }]);
	});

	it('attaches a script to an empty box when no base precedes it', () => {
		expect(render('^2')).toBe('<msup><mrow></mrow><mn>2</mn></msup>');
	});
});

describe('fractions, roots, binomials', () => {
	it('builds a fraction', () => {
		expect(render('\\frac{1}{2}')).toBe('<mfrac><mn>1</mn><mn>2</mn></mfrac>');
	});

	it('builds nested fractions', () => {
		expect(render('\\frac{\\frac{1}{2}}{3}')).toBe(
			'<mfrac><mfrac><mn>1</mn><mn>2</mn></mfrac><mn>3</mn></mfrac>',
		);
	});

	it('treats dfrac and tfrac like frac', () => {
		expect(render('\\dfrac{a}{b}')).toBe('<mfrac><mi>a</mi><mi>b</mi></mfrac>');
		expect(render('\\tfrac{a}{b}')).toBe('<mfrac><mi>a</mi><mi>b</mi></mfrac>');
	});

	it('builds a square root', () => {
		expect(render('\\sqrt{x}')).toBe('<msqrt><mi>x</mi></msqrt>');
	});

	it('builds an n-th root from the optional index', () => {
		expect(render('\\sqrt[3]{x}')).toBe('<mroot><mi>x</mi><mn>3</mn></mroot>');
	});

	it('falls back to msqrt when the optional index is empty', () => {
		expect(render('\\sqrt[]{x}')).toBe('<msqrt><mi>x</mi></msqrt>');
	});

	it('builds a binomial coefficient with parentheses and no fraction line', () => {
		expect(render('\\binom{n}{k}')).toBe(
			'<mrow><mo fence="true">(</mo>' +
				'<mfrac linethickness="0"><mi>n</mi><mi>k</mi></mfrac>' +
				'<mo fence="true">)</mo></mrow>',
		);
	});
});

describe('left/right delimiters', () => {
	it('makes paired delimiters stretchy', () => {
		expect(render('\\left( \\frac{a}{b} \\right)')).toBe(
			'<mrow><mo fence="true" stretchy="true">(</mo>' +
				'<mfrac><mi>a</mi><mi>b</mi></mfrac>' +
				'<mo fence="true" stretchy="true">)</mo></mrow>',
		);
	});

	it('renders a null left delimiter as nothing', () => {
		expect(render('\\left. \\frac{a}{b} \\right|')).toBe(
			'<mrow><mfrac><mi>a</mi><mi>b</mi></mfrac>' +
				'<mo fence="true" stretchy="true">|</mo></mrow>',
		);
	});

	it('handles named delimiters like langle/rangle', () => {
		expect(render('\\left\\langle x \\right\\rangle')).toBe(
			'<mrow><mo fence="true" stretchy="true">⟨</mo><mi>x</mi>' +
				'<mo fence="true" stretchy="true">⟩</mo></mrow>',
		);
	});
});

describe('big operators with limits', () => {
	it('uses munderover in display mode', () => {
		expect(render('\\sum_{i=0}^{n}', true)).toBe(
			'<munderover><mo movablelimits="true" largeop="true">∑</mo>' +
				'<mrow><mi>i</mi><mo>=</mo><mn>0</mn></mrow><mi>n</mi></munderover>',
		);
	});

	it('uses msubsup inline', () => {
		expect(render('\\sum_{i=0}^{n}', false)).toBe(
			'<msubsup><mo movablelimits="true" largeop="true">∑</mo>' +
				'<mrow><mi>i</mi><mo>=</mo><mn>0</mn></mrow><mi>n</mi></msubsup>',
		);
	});

	it('keeps integral limits as side scripts even in display mode', () => {
		expect(render('\\int_0^1', true)).toBe(
			'<msubsup><mo movablelimits="true" largeop="true">∫</mo><mn>0</mn><mn>1</mn></msubsup>',
		);
	});

	it('renders lim with an under-script in display mode', () => {
		expect(render('\\lim_{x\\to\\infty}', true)).toBe(
			'<munder><mo movablelimits="true">lim</mo>' +
				'<mrow><mi>x</mi><mo>→</mo><mi>∞</mi></mrow></munder>',
		);
	});

	it('honors \\nolimits in display mode', () => {
		expect(render('\\sum\\nolimits_{i}', true)).toBe(
			'<msub><mo movablelimits="true" largeop="true">∑</mo><mi>i</mi></msub>',
		);
	});

	it('honors \\limits inline', () => {
		expect(render('\\sum\\limits_{i}', false)).toBe(
			'<munder><mo movablelimits="true" largeop="true">∑</mo><mi>i</mi></munder>',
		);
	});
});

describe('environments', () => {
	it('builds a pmatrix with parentheses', () => {
		expect(render('\\begin{pmatrix}1 & 2 \\\\ 3 & 4\\end{pmatrix}')).toBe(
			'<mrow><mo stretchy="true" fence="true">(</mo>' +
				'<mtable>' +
				'<mtr><mtd><mrow><mn>1</mn></mrow></mtd><mtd><mrow><mn>2</mn></mrow></mtd></mtr>' +
				'<mtr><mtd><mrow><mn>3</mn></mrow></mtd><mtd><mrow><mn>4</mn></mrow></mtd></mtr>' +
				'</mtable>' +
				'<mo stretchy="true" fence="true">)</mo></mrow>',
		);
	});

	it('builds a bmatrix with square brackets', () => {
		expect(render('\\begin{bmatrix}a\\end{bmatrix}')).toBe(
			'<mrow><mo stretchy="true" fence="true">[</mo>' +
				'<mtable><mtr><mtd><mrow><mi>a</mi></mrow></mtd></mtr></mtable>' +
				'<mo stretchy="true" fence="true">]</mo></mrow>',
		);
	});

	it('builds a vmatrix with vertical bars', () => {
		expect(render('\\begin{vmatrix}a\\end{vmatrix}')).toContain(
			'<mo stretchy="true" fence="true">|</mo>',
		);
	});

	it('builds cases with a single opening brace', () => {
		expect(render('\\begin{cases} a & x>0 \\\\ b & x<0 \\end{cases}')).toBe(
			'<mrow><mo stretchy="true" fence="true">{</mo>' +
				'<mtable columnalign="left">' +
				'<mtr><mtd><mrow><mi>a</mi></mrow></mtd>' +
				'<mtd><mrow><mi>x</mi><mo>&gt;</mo><mn>0</mn></mrow></mtd></mtr>' +
				'<mtr><mtd><mrow><mi>b</mi></mrow></mtd>' +
				'<mtd><mrow><mi>x</mi><mo>&lt;</mo><mn>0</mn></mrow></mtd></mtr>' +
				'</mtable></mrow>',
		);
	});

	it('builds a fence-less plain matrix', () => {
		expect(render('\\begin{matrix}a & b\\end{matrix}')).toBe(
			'<mtable><mtr><mtd><mrow><mi>a</mi></mrow></mtd>' +
				'<mtd><mrow><mi>b</mi></mrow></mtd></mtr></mtable>',
		);
	});

	it('builds a Bmatrix with curly braces', () => {
		expect(render('\\begin{Bmatrix}a\\end{Bmatrix}')).toBe(
			'<mrow><mo stretchy="true" fence="true">{</mo>' +
				'<mtable><mtr><mtd><mrow><mi>a</mi></mrow></mtd></mtr></mtable>' +
				'<mo stretchy="true" fence="true">}</mo></mrow>',
		);
	});

	it('builds a Vmatrix with double bars', () => {
		expect(render('\\begin{Vmatrix}a\\end{Vmatrix}')).toBe(
			'<mrow><mo stretchy="true" fence="true">‖</mo>' +
				'<mtable><mtr><mtd><mrow><mi>a</mi></mrow></mtd></mtr></mtable>' +
				'<mo stretchy="true" fence="true">‖</mo></mrow>',
		);
	});

	it('discards an array column spec instead of rendering it', () => {
		const result = render('\\begin{array}{cc}1 & 2\\end{array}');
		expect(result).toBe(
			'<mtable><mtr><mtd><mrow><mn>1</mn></mrow></mtd>' +
				'<mtd><mrow><mn>2</mn></mrow></mtd></mtr></mtable>',
		);
		expect(result).not.toContain('<mi>c</mi>');
	});

	it('tolerates an array position arg before the column spec', () => {
		expect(render('\\begin{array}[t]{c}1\\end{array}')).toBe(
			'<mtable><mtr><mtd><mrow><mn>1</mn></mrow></mtd></mtr></mtable>',
		);
	});

	it('reports an unterminated environment but still produces output', () => {
		const result = latexToMathML('\\begin{pmatrix}1 & 2');
		expect(result.presentation).toContain('<mtable>');
		expect(result.errors.some((e) => e.message.includes('Unterminated'))).toBe(true);
	});

	it('recovers from a stray closing brace inside an environment without hanging', () => {
		const result = latexToMathML('\\begin{matrix}}\\end{matrix}');
		expect(result.presentation).toContain('<mtable>');
		expect(result.errors.some((e) => e.message.includes('Unmatched brace'))).toBe(true);
	});

	it('recovers from a stray closing brace inside a matrix cell', () => {
		const result = latexToMathML('\\begin{pmatrix} a } b \\end{pmatrix}');
		expect(result.presentation).toContain('<mtable>');
		expect(result.presentation).toContain('<mi>a</mi>');
		expect(result.presentation).toContain('<mi>b</mi>');
	});
});

describe('accents', () => {
	it('builds a hat accent', () => {
		expect(render('\\hat{x}')).toBe('<mover accent="true"><mi>x</mi><mo>^</mo></mover>');
	});

	it('builds a vector arrow', () => {
		expect(render('\\vec{v}')).toBe('<mover accent="true"><mi>v</mi><mo>→</mo></mover>');
	});

	it('builds a stretchy overline', () => {
		expect(render('\\overline{AB}')).toBe(
			'<mover accent="true"><mrow><mi>A</mi><mi>B</mi></mrow>' +
				'<mo stretchy="true">‾</mo></mover>',
		);
	});

	it('builds an underbrace', () => {
		expect(render('\\underbrace{x}')).toBe(
			'<munder accentunder="true"><mi>x</mi><mo stretchy="true">⏟</mo></munder>',
		);
	});
});

describe('fonts and text', () => {
	it('renders mathbb as the literal blackboard-bold glyph', () => {
		expect(render('\\mathbb{R}')).toBe('<mi>ℝ</mi>');
		expect(render('\\mathbb{N}')).toBe('<mi>ℕ</mi>');
	});

	it('renders each letter of a multi-letter mathbb argument, holes included', () => {
		expect(render('\\mathbb{ABC}')).toBe('<mrow><mi>𝔸</mi><mi>𝔹</mi><mi>ℂ</mi></mrow>');
	});

	it('renders mathcal as the script glyph', () => {
		expect(render('\\mathcal{L}')).toBe('<mi>ℒ</mi>');
	});

	it('renders mathfrak holes from the Letterlike block', () => {
		expect(render('\\mathfrak{H}')).toBe('<mi>ℌ</mi>');
	});

	it('renders mathbf lowercase from the contiguous bold block', () => {
		expect(render('\\mathbf{x}')).toBe('<mi>𝐱</mi>');
	});

	it('renders the mathit lowercase-h hole', () => {
		expect(render('\\mathit{h}')).toBe('<mi>ℎ</mi>');
	});

	it('renders a blackboard-bold digit from the digit block', () => {
		expect(render('\\mathbb{1}')).toBe('<mn>𝟙</mn>');
	});

	it('keeps mathit digits as plain ASCII (no italic digit block)', () => {
		expect(render('\\mathit{2}')).toBe('<mn>2</mn>');
	});

	it('passes a non-letter mathbb argument through unchanged', () => {
		expect(render('\\mathbb{+}')).toBe('<mo>+</mo>');
	});

	it('keeps the glyph when scripts follow a mathbb argument', () => {
		expect(render('\\mathbb{R}^n')).toBe('<msup><mi>ℝ</mi><mi>n</mi></msup>');
	});

	it('renders mathrm as upright identifiers, single and multi-letter', () => {
		expect(render('\\mathrm{d}')).toBe('<mi mathvariant="normal">d</mi>');
		expect(render('\\mathrm{abc}')).toBe(
			'<mrow><mi mathvariant="normal">a</mi>' +
				'<mi mathvariant="normal">b</mi><mi mathvariant="normal">c</mi></mrow>',
		);
	});

	it('still emits mathvariant for bold-italic boldsymbol (no glyph block)', () => {
		expect(render('\\boldsymbol{x}')).toBe('<mstyle mathvariant="bold-italic"><mi>x</mi></mstyle>');
	});

	it('renders text content as upright mtext preserving spaces', () => {
		expect(render('\\text{if } x>0')).toBe(
			'<mrow><mtext>if </mtext><mi>x</mi><mo>&gt;</mo><mn>0</mn></mrow>',
		);
	});

	it('renders operatorname as an upright identifier', () => {
		expect(render('\\operatorname{lcm}')).toBe('<mi mathvariant="normal">lcm</mi>');
	});

	it('renders textbf as bold mtext', () => {
		expect(render('\\textbf{hi}')).toBe('<mtext mathvariant="bold">hi</mtext>');
	});
});

describe('named functions', () => {
	it('renders sin as an upright identifier', () => {
		expect(render('\\sin x')).toBe('<mrow><mi mathvariant="normal">sin</mi><mi>x</mi></mrow>');
	});

	it('renders log with a subscript base', () => {
		expect(render('\\log_2 x')).toBe(
			'<mrow><msub><mi mathvariant="normal">log</mi><mn>2</mn></msub><mi>x</mi></mrow>',
		);
	});
});

describe('spacing', () => {
	it('maps thin space to a small mspace', () => {
		expect(render('a\\,b')).toBe(
			'<mrow><mi>a</mi><mspace width="0.167em"></mspace><mi>b</mi></mrow>',
		);
	});

	it('maps quad to a 1em space', () => {
		expect(render('a\\quad b')).toBe(
			'<mrow><mi>a</mi><mspace width="1em"></mspace><mi>b</mi></mrow>',
		);
	});

	it('maps negative thin space', () => {
		expect(render('a\\!b')).toBe(
			'<mrow><mi>a</mi><mspace width="-0.167em"></mspace><mi>b</mi></mrow>',
		);
	});

	it('maps tilde to a non-breaking space', () => {
		expect(render('a~b')).toBe('<mrow><mi>a</mi><mspace width="0.25em"></mspace><mi>b</mi></mrow>');
	});
});

describe('stacking and modular', () => {
	it('builds overset', () => {
		expect(render('\\overset{!}{=}')).toBe('<mover><mo>=</mo><mo>!</mo></mover>');
	});

	it('builds underset', () => {
		expect(render('\\underset{x}{y}')).toBe('<munder><mi>y</mi><mi>x</mi></munder>');
	});

	it('builds pmod wrapped in a single mrow root', () => {
		expect(render('\\pmod{n}')).toBe(
			'<mrow><mo fence="true">(</mo><mtext>mod</mtext>' +
				'<mspace width="0.25em"></mspace><mi>n</mi><mo fence="true">)</mo></mrow>',
		);
	});

	it('builds substack as a stacked table', () => {
		expect(render('\\substack{a \\\\ b}')).toBe(
			'<mtable><mtr><mtd><mi>a</mi></mtd></mtr><mtr><mtd><mi>b</mi></mtd></mtr></mtable>',
		);
	});
});

describe('control symbols and escapes', () => {
	it('renders escaped literal punctuation as text', () => {
		expect(render('\\%')).toBe('<mtext>%</mtext>');
		expect(render('\\$')).toBe('<mtext>$</mtext>');
		expect(render('\\#')).toBe('<mtext>#</mtext>');
	});

	it('renders \\{ and \\} as fence operators', () => {
		expect(render('\\{')).toBe('<mo fence="true">{</mo>');
		expect(render('\\}')).toBe('<mo fence="true">}</mo>');
	});

	it('renders \\backslash as an operator', () => {
		expect(render('\\backslash')).toBe('<mi>\\</mi>');
	});

	it('renders backslash-space as a normal space', () => {
		expect(render('a\\ b')).toBe(
			'<mrow><mi>a</mi><mspace width="0.25em"></mspace><mi>b</mi></mrow>',
		);
	});
});

describe('error handling', () => {
	it('emits a merror and records an unknown command', () => {
		const result = latexToMathML('\\foo');
		expect(result.presentation).toBe('<merror><mtext>\\foo</mtext></merror>');
		expect(result.errors).toEqual([{ message: 'Unknown command', command: '\\foo', position: 0 }]);
	});

	it('recovers from an unmatched opening brace', () => {
		const result = latexToMathML('{a');
		expect(result.presentation).toBe('<mi>a</mi>');
		expect(result.errors).toEqual([{ message: 'Unmatched brace' }]);
	});

	it('recovers from a stray closing brace', () => {
		expect(() => latexToMathML('a}b')).not.toThrow();
		expect(render('a}b')).toBe('<mrow><mi>a</mi><mi>b</mi></mrow>');
	});

	it('reports an unknown environment', () => {
		const result = latexToMathML('\\begin{nope}x\\end{nope}');
		expect(result.errors.some((e) => e.message === 'Unknown environment')).toBe(true);
	});
});

describe('partial input robustness', () => {
	it('does not throw on a half-typed fraction and yields valid mfrac', () => {
		const result = latexToMathML('\\frac{a}{');
		expect(result.presentation).toBe('<mfrac><mi>a</mi><mrow></mrow></mfrac>');
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it('does not throw on a lone command', () => {
		expect(() => latexToMathML('\\frac')).not.toThrow();
		expect(render('\\frac')).toBe('<mfrac><mrow></mrow><mrow></mrow></mfrac>');
	});

	it('does not throw on an open left without right', () => {
		const result = latexToMathML('\\left( x');
		expect(result.presentation).toContain('<mo fence="true" stretchy="true">(</mo>');
		expect(result.errors.some((e) => e.message === 'Unmatched \\left')).toBe(true);
	});

	it('does not throw on a half-typed superscript', () => {
		expect(() => latexToMathML('x^')).not.toThrow();
		expect(render('x^')).toBe('<msup><mi>x</mi><mrow></mrow></msup>');
	});
});
