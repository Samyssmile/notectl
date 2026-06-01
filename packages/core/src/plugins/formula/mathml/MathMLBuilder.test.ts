import { describe, expect, it } from 'vitest';
import {
	element,
	escapeAttr,
	escapeText,
	group,
	mfrac,
	mi,
	mn,
	mo,
	mroot,
	mrow,
	msqrt,
	msubsup,
	msup,
	mtable,
	munderover,
} from './MathMLBuilder.js';

describe('escaping', () => {
	it('escapes text content', () => {
		expect(escapeText('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
	});

	it('escapes attribute values including quotes', () => {
		expect(escapeAttr('a "b" <c>')).toBe('a &quot;b&quot; &lt;c&gt;');
	});
});

describe('leaf builders', () => {
	it('builds identifiers, numbers, operators', () => {
		expect(mi('x')).toBe('<mi>x</mi>');
		expect(mn('42')).toBe('<mn>42</mn>');
		expect(mo('+')).toBe('<mo>+</mo>');
	});

	it('escapes operator content', () => {
		expect(mo('<')).toBe('<mo>&lt;</mo>');
	});

	it('serializes attributes, dropping false/boolean-true correctly', () => {
		expect(mo('(', { stretchy: true, fence: false })).toBe('<mo stretchy="true">(</mo>');
		expect(element('mi', 'x', { mathvariant: 'bold' })).toBe('<mi mathvariant="bold">x</mi>');
	});
});

describe('structural builders', () => {
	it('builds fractions, roots, scripts', () => {
		expect(mfrac(mn('1'), mn('2'))).toBe('<mfrac><mn>1</mn><mn>2</mn></mfrac>');
		expect(msqrt(mi('x'))).toBe('<msqrt><mi>x</mi></msqrt>');
		expect(mroot(mi('x'), mn('3'))).toBe('<mroot><mi>x</mi><mn>3</mn></mroot>');
		expect(msup(mi('x'), mn('2'))).toBe('<msup><mi>x</mi><mn>2</mn></msup>');
		expect(msubsup(mi('x'), mi('i'), mn('2'))).toBe(
			'<msubsup><mi>x</mi><mi>i</mi><mn>2</mn></msubsup>',
		);
	});

	it('builds big-operator limits', () => {
		expect(munderover(mo('∑'), mn('0'), mi('n'))).toBe(
			'<munderover><mo>∑</mo><mn>0</mn><mi>n</mi></munderover>',
		);
	});

	it('builds a 2x2 table', () => {
		const table = mtable([
			[mn('1'), mn('2')],
			[mn('3'), mn('4')],
		]);
		expect(table).toBe(
			'<mtable>' +
				'<mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd></mtr>' +
				'<mtr><mtd><mn>3</mn></mtd><mtd><mn>4</mn></mtd></mtr>' +
				'</mtable>',
		);
	});
});

describe('group', () => {
	it('returns a single child unwrapped', () => {
		expect(group([mi('x')])).toBe('<mi>x</mi>');
	});

	it('wraps multiple children in an mrow', () => {
		expect(group([mi('x'), mo('+'), mi('y')])).toBe(mrow('<mi>x</mi><mo>+</mo><mi>y</mi>'));
	});

	it('returns empty string for no children', () => {
		expect(group([])).toBe('');
	});
});
