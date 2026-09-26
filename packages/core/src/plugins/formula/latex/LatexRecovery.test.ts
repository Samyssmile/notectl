import { describe, expect, it } from 'vitest';
import { latexToMathML } from './LatexToMathML.js';

const PROTOTYPE_COMMANDS = [
	'toString',
	'constructor',
	'valueOf',
	'hasOwnProperty',
	'isPrototypeOf',
	'propertyIsEnumerable',
	'toLocaleString',
];

describe.each([false, true])('LaTeX recovery (#228), display=%s', (display) => {
	it.each(PROTOTYPE_COMMANDS)('marks unknown command %s and continues parsing', (name) => {
		const command = `\\${name}`;
		const result = latexToMathML(`  x+${command}+y`, { display });
		expect(result).toEqual({
			presentation: `<mrow><mi>x</mi><mo>+</mo><merror><mtext>${command}</mtext></merror><mo>+</mo><mi>y</mi></mrow>`,
			errors: [{ message: 'Unknown command', command, position: 4 }],
		});
	});

	it.each(Object.getOwnPropertyNames(Object.prototype))(
		'marks unknown environment %s and preserves the body and following content',
		(name) => {
			const result = latexToMathML(`\\begin{${name}}x\\end{${name}}+y`, {
				display,
			});
			expect(result.errors).toContainEqual({ message: 'Unknown environment', command: name });
			expect(result.presentation).toContain(`<merror><mtext>${name}</mtext></merror>`);
			expect(result.presentation).toContain('<mi>x</mi>');
			expect(result.presentation).toContain('<mo>+</mo><mi>y</mi>');
		},
	);

	it.each([
		['\\alpha', '<mi>α</mi>'],
		['\\quad', '<mspace width="1em"></mspace>'],
		['\\hat{x}', '<mover accent="true"><mi>x</mi><mo>^</mo></mover>'],
		['\\mathbb{R}', '<mi>ℝ</mi>'],
		['\\boldsymbol{x}', '<mstyle mathvariant="bold-italic"><mi>x</mi></mstyle>'],
		['\\text{a b}', '<mtext>a b</mtext>'],
		['\\mbox{a b}', '<mtext>a b</mtext>'],
		['\\textbf{a b}', '<mtext mathvariant="bold">a b</mtext>'],
		['\\mathrm{x}', '<mi mathvariant="normal">x</mi>'],
		['\\operatorname{lcm}', '<mi mathvariant="normal">lcm</mi>'],
		[
			'\\begin{array}{c}x\\end{array}',
			'<mtable><mtr><mtd><mrow><mi>x</mi></mrow></mtd></mtr></mtable>',
		],
		[
			'\\begin{aligned}x\\end{aligned}',
			'<mtable columnalign="right left"><mtr><mtd><mrow><mi>x</mi></mrow></mtd></mtr></mtable>',
		],
		['\\left. x\\right.', '<mrow><mi>x</mi></mrow>'],
	])('keeps registered syntax %s valid', (latex, presentation) => {
		expect(latexToMathML(latex, { display })).toEqual({ presentation, errors: [] });
	});
});

describe('unknown delimiter diagnostics (#228)', () => {
	const unknownSpecs = [
		...PROTOTYPE_COMMANDS.map((name) => [`\\${name}`, `\\${name}`]),
		['\\notadelimiter', '\\notadelimiter'],
		['q', 'q'],
		['<', '&lt;'],
		['\\&', '\\&amp;'],
		['"', '"'],
	];

	describe.each(unknownSpecs)('delimiter %s', (spec, escaped) => {
		const marker = `<merror><mtext>${escaped}</mtext></merror>`;
		const open = '<mo fence="true" stretchy="true">(</mo>';
		const close = '<mo fence="true" stretchy="true">)</mo>';

		it.each([
			['left', spec, ')', marker, close],
			['right', '(', spec, open, marker],
			['both', spec, spec, marker, marker],
		])(
			'marks %s at its source position and keeps the body and suffix',
			(_side, left, right, leftMarkup, rightMarkup) => {
				const prefix = '  a+\\left ';
				const middle = ' x\\right ';
				const latex = `${prefix + left + middle + right}+z`;
				const errors = [];
				if (left === spec) {
					errors.push({ message: 'Unknown delimiter', command: spec, position: prefix.length });
				}
				if (right === spec) {
					errors.push({
						message: 'Unknown delimiter',
						command: spec,
						position: prefix.length + left.length + middle.length,
					});
				}
				expect(latexToMathML(latex)).toEqual({
					presentation: `<mrow><mi>a</mi><mo>+</mo><mrow>${leftMarkup}<mi>x</mi>${rightMarkup}</mrow><mo>+</mo><mi>z</mi></mrow>`,
					errors,
				});
			},
		);

		it('marks a stray right delimiter and retains the unmatched-right diagnostic', () => {
			const result = latexToMathML(`a+\\right ${spec}+z`);
			expect(result.presentation).toBe(
				`<mrow><mi>a</mi><mo>+</mo>${marker}<mo>+</mo><mi>z</mi></mrow>`,
			);
			expect(result.errors).toHaveLength(2);
			expect(result.errors).toContainEqual({
				message: 'Unknown delimiter',
				command: spec,
				position: 9,
			});
			expect(result.errors).toContainEqual({ message: 'Unmatched \\right', position: 2 });
		});

		it('retains the unmatched-left diagnostic alongside the marker', () => {
			const result = latexToMathML(`\\left ${spec} x+z`);
			expect(result.presentation).toBe(`<mrow>${marker}<mi>x</mi><mo>+</mo><mi>z</mi></mrow>`);
			expect(result.errors).toEqual([
				{ message: 'Unknown delimiter', command: spec, position: 6 },
				{ message: 'Unmatched \\left' },
			]);
		});
	});

	it.each([')', '.'])('keeps the existing behavior for a valid stray right %s', (spec) => {
		expect(latexToMathML(`\\right${spec}`)).toEqual({
			presentation: '',
			errors: [{ message: 'Unmatched \\right', position: 0 }],
		});
	});

	it.each([
		['\\left', '<mrow></mrow>', [{ message: 'Unmatched \\left' }]],
		['\\right', '', [{ message: 'Unmatched \\right', position: 0 }]],
		['\\left. x\\right', '<mrow><mi>x</mi></mrow>', []],
	])('preserves missing delimiter tokens at EOF for %s', (latex, presentation, errors) => {
		expect(latexToMathML(latex)).toEqual({ presentation, errors });
	});
});
