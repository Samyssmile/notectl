import { describe, expect, it } from 'vitest';
import { formatDeclaration, parseDeclaration } from './StyleClass.js';

describe('parseDeclaration', () => {
	it('splits a declaration into a lowercase property and a trimmed value', () => {
		expect(parseDeclaration('  Color :  #e03131 ; ')).toEqual({
			property: 'color',
			value: '#e03131',
		});
	});

	it('keeps the case of custom properties and the value as written', () => {
		expect(parseDeclaration('--Brand-Color: #E03131')).toEqual({
			property: '--Brand-Color',
			value: '#E03131',
		});
	});

	it('keeps quotes and colons inside the value', () => {
		expect(parseDeclaration('font-family: "Fira Code", monospace')?.value).toBe(
			'"Fira Code", monospace',
		);
		expect(parseDeclaration('background: url(https://x.test/a.png)')?.value).toBe(
			'url(https://x.test/a.png)',
		);
	});

	it.each([
		['no colon', 'color red'],
		['no property', ': red'],
		['an invalid property', '1color: red'],
		['no value', 'color:'],
		['two declarations', 'color: red; font-size: 18px'],
		['a rule breakout', 'color: red } body { display: none'],
		['a style element breakout', 'color: red</style>'],
		['!important', 'color: red !important'],
	])('rejects %s', (_label: string, declaration: string) => {
		expect(parseDeclaration(declaration)).toBeUndefined();
	});

	it('parses a long value in linear time', () => {
		const declaration: string = `font-family: a${' '.repeat(200_000)}b`;
		const started: number = performance.now();

		parseDeclaration(declaration);

		expect(performance.now() - started).toBeLessThan(1000);
	});
});

describe('formatDeclaration', () => {
	it('writes property and value as one declaration', () => {
		expect(formatDeclaration({ property: 'color', value: '#e03131' })).toBe('color: #e03131');
	});
});
