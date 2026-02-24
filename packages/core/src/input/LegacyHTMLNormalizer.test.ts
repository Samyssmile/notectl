import { describe, expect, it } from 'vitest';
import { normalizeLegacyHTML } from './LegacyHTMLNormalizer.js';

/** Parses HTML into a DocumentFragment and runs normalization. */
function normalize(html: string): string {
	const template: HTMLTemplateElement = document.createElement('template');
	template.innerHTML = html;
	normalizeLegacyHTML(template.content);
	return template.innerHTML;
}

describe('normalizeLegacyHTML', () => {
	it('converts font color to span style', () => {
		const result: string = normalize('<font color="#f75d5d">red text</font>');
		expect(result).toContain('<span');
		expect(result).toContain('color: #f75d5d');
		expect(result).toContain('red text');
		expect(result).not.toContain('<font');
	});

	it('converts font face to span font-family', () => {
		const result: string = normalize('<font face="Arial, sans-serif">text</font>');
		expect(result).toContain('font-family: Arial, sans-serif');
		expect(result).not.toContain('<font');
	});

	it('prefers existing inline font-size over size attribute', () => {
		const result: string = normalize('<font size="4" style="font-size: 14pt">text</font>');
		expect(result).toContain('font-size: 14pt');
		expect(result).not.toContain('large');
		expect(result).not.toContain('<font');
	});

	it('maps size attribute to CSS keyword when no inline font-size', () => {
		const result: string = normalize('<font size="2">small text</font>');
		expect(result).toContain('font-size: small');
		expect(result).not.toContain('<font');
	});

	it('maps all size values correctly', () => {
		const expected: Record<string, string> = {
			'1': 'x-small',
			'2': 'small',
			'3': 'medium',
			'4': 'large',
			'5': 'x-large',
			'6': 'xx-large',
			'7': 'xxx-large',
		};

		for (const [size, keyword] of Object.entries(expected)) {
			const result: string = normalize(`<font size="${size}">text</font>`);
			expect(result).toContain(`font-size: ${keyword}`);
		}
	});

	it('combines color and face attributes', () => {
		const result: string = normalize('<font color="red" face="Lato">styled</font>');
		expect(result).toContain('color: red');
		expect(result).toContain('font-family: Lato');
		expect(result).toContain('styled');
		expect(result).not.toContain('<font');
	});

	it('combines all three attributes', () => {
		const result: string = normalize('<font color="blue" face="Georgia" size="5">big blue</font>');
		expect(result).toContain('color: blue');
		expect(result).toContain('font-family: Georgia');
		expect(result).toContain('font-size: x-large');
	});

	it('unwraps font with no meaningful attributes', () => {
		const result: string = normalize('<p><font>bare text</font></p>');
		expect(result).not.toContain('<font');
		expect(result).not.toContain('<span');
		expect(result).toContain('bare text');
	});

	it('converts nested font elements independently', () => {
		const result: string = normalize('<font color="red"><font face="Arial">nested</font></font>');
		expect(result).not.toContain('<font');
		expect(result).toContain('color: red');
		expect(result).toContain('font-family: Arial');
	});

	it('preserves children and non-font elements', () => {
		const result: string = normalize(
			'<p><font color="green"><strong>bold green</strong></font> plain</p>',
		);
		expect(result).toContain('<strong>bold green</strong>');
		expect(result).toContain('color: green');
		expect(result).toContain(' plain');
	});

	it('preserves existing inline styles alongside new ones', () => {
		const result: string = normalize(
			'<font color="red" style="text-decoration: underline">text</font>',
		);
		expect(result).toContain('text-decoration: underline');
		expect(result).toContain('color: red');
	});

	it('handles empty container gracefully', () => {
		const result: string = normalize('');
		expect(result).toBe('');
	});

	it('leaves non-font elements untouched', () => {
		const html = '<p><span style="color: blue">normal span</span></p>';
		const result: string = normalize(html);
		expect(result).toBe(html);
	});
});
