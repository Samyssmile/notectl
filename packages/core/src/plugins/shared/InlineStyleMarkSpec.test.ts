import { describe, expect, it } from 'vitest';
import type { Mark } from '../../model/Document.js';
import { markType } from '../../model/TypeBrands.js';
import { createInlineStyleMarkSpec, styleDeclaration } from './InlineStyleMarkSpec.js';

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

describe('styleDeclaration', () => {
	it('joins property and value into one raw declaration', () => {
		expect(styleDeclaration('color', '#e03131')).toBe('color: #e03131');
	});
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

	it('exports raw CSS and escapes it only where it writes a style attribute', () => {
		const familySpec = createInlineStyleMarkSpec({
			type: 'test',
			rank: 1,
			valueAttr: 'family',
			domStyleProperty: 'fontFamily',
			cssProperty: 'font-family',
			validate: () => true,
		});
		const family: Mark = { type: markType('test'), attrs: { family: '"Inter", sans-serif' } };

		expect(familySpec.toHTMLStyle?.(family)).toBe('font-family: "Inter", sans-serif');
		expect(familySpec.toHTMLString?.(family, 'x')).toBe(
			'<span style="font-family: &quot;Inter&quot;, sans-serif">x</span>',
		);
		const declarations: string[] = [];
		familySpec.toHTMLString?.(family, 'x', {
			styleAttr: (value: string) => {
				declarations.push(value);
				return ' class="font"';
			},
		});
		expect(declarations).toEqual(['font-family: "Inter", sans-serif']);
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

	describe('known values', () => {
		const knownFamilySpec = createInlineStyleMarkSpec({
			type: 'test',
			rank: 1,
			valueAttr: 'family',
			domStyleProperty: 'fontFamily',
			cssProperty: 'font-family',
			validate: () => true,
			transformParsed: (v) => v.toUpperCase(),
			knownValues: ['Georgia, serif', "'Inter', sans-serif"],
		});

		function parseFamily(family: string): unknown {
			const rule = knownFamilySpec.parseHTML?.[0];
			const el: HTMLElement = document.createElement('span');
			el.style.setProperty('font-family', family);
			return rule && 'getAttrs' in rule && rule.getAttrs?.(el);
		}

		it('stores a value the browser reads like a known value in the known spelling', () => {
			expect(parseFamily('"Inter", sans-serif')).toEqual({ family: "'Inter', sans-serif" });
			expect(parseFamily('Inter, sans-serif')).toEqual({ family: "'Inter', sans-serif" });
		});

		it('stores other values as transformParsed returns them', () => {
			expect(parseFamily('Arial, sans-serif')).toEqual({ family: 'ARIAL, SANS-SERIF' });
		});
	});
});
