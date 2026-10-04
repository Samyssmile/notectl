import { describe, expect, it } from 'vitest';
import { splitDeclarations } from './CSSDeclarations.js';

describe('splitDeclarations', () => {
	it('splits at semicolons and trims each declaration', () => {
		expect(splitDeclarations(' color: red ;font-size: 18px; ')).toEqual([
			'color: red',
			'font-size: 18px',
		]);
	});

	it('keeps a semicolon inside quotes within its declaration', () => {
		expect(splitDeclarations(`font-family: 'A;B', "C;D"; color: red`)).toEqual([
			`font-family: 'A;B', "C;D"`,
			'color: red',
		]);
	});

	it('keeps a semicolon inside parentheses within its declaration', () => {
		expect(splitDeclarations('background: url(data:image/png;base64,AAAA); color: red')).toEqual([
			'background: url(data:image/png;base64,AAAA)',
			'color: red',
		]);
	});

	it('returns nothing for an empty list', () => {
		expect(splitDeclarations(' ; ; ')).toEqual([]);
	});
});
