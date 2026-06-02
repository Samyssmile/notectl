import { describe, expect, it } from 'vitest';
import type { Mark } from '../../model/Document.js';
import { markType } from '../../model/TypeBrands.js';
import { createInlineStyleMarkSpec } from './InlineStyleMarkSpec.js';

function mark(attrs: Record<string, string>): Mark {
	return { type: markType('test'), attrs };
}

const colorSpec = createInlineStyleMarkSpec({
	type: 'test',
	rank: 1,
	valueAttr: 'color',
	domStyleProperty: 'backgroundColor',
	cssProperty: 'background-color',
	validate: (v) => v === 'red' || v === 'blue',
	validateOnParse: true,
});

describe('createInlineStyleMarkSpec', () => {
	it('renders the configured DOM style property', () => {
		const el = colorSpec.toDOM(mark({ color: 'red' }) as never);
		expect(el.style.backgroundColor).toBe('red');
	});

	it('omits the style when the value is empty', () => {
		const el = colorSpec.toDOM(mark({ color: '' }) as never);
		expect(el.style.backgroundColor).toBe('');
	});

	it('exports a style declaration only for valid values', () => {
		expect(colorSpec.toHTMLStyle?.(mark({ color: 'red' }))).toBe('background-color: red');
		expect(colorSpec.toHTMLStyle?.(mark({ color: 'notacolor' }))).toBeNull();
	});

	it('wraps content in a span for valid values and passes through invalid ones', () => {
		expect(colorSpec.toHTMLString?.(mark({ color: 'blue' }), 'x')).toBe(
			'<span style="background-color: blue">x</span>',
		);
		expect(colorSpec.toHTMLString?.(mark({ color: 'bad' }), 'x')).toBe('x');
	});

	it('parses a matching span and rejects invalid values when validateOnParse is set', () => {
		const rule = colorSpec.parseHTML?.[0];
		const good = document.createElement('span');
		good.style.backgroundColor = 'red';
		expect(rule && 'getAttrs' in rule && rule.getAttrs?.(good)).toEqual({ color: 'red' });

		const bad = document.createElement('span');
		bad.style.backgroundColor = 'chartreuse-ish';
		expect(rule && 'getAttrs' in rule && rule.getAttrs?.(bad)).toBe(false);
	});

	it('applies transformParsed without validating when validateOnParse is unset', () => {
		const fontSpec = createInlineStyleMarkSpec({
			type: 'test',
			rank: 1,
			valueAttr: 'family',
			domStyleProperty: 'fontFamily',
			cssProperty: 'font-family',
			validate: () => false, // would reject everything if applied on parse
			transformParsed: (v) => v.toUpperCase(),
		});
		const rule = fontSpec.parseHTML?.[0];
		const el = document.createElement('span');
		el.style.fontFamily = 'arial';
		// validate is ignored on parse; transformParsed is applied to the raw value.
		expect(rule && 'getAttrs' in rule && rule.getAttrs?.(el)).toEqual({ family: 'ARIAL' });
	});
});
