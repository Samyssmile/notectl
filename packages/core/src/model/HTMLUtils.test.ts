import { describe, expect, it } from 'vitest';
import { escapeHTML, formatHTML } from './HTMLUtils.js';

describe('escapeHTML', () => {
	it('escapes ampersands, angle brackets, and quotes', () => {
		expect(escapeHTML('a & b < c > d "e"')).toBe('a &amp; b &lt; c &gt; d &quot;e&quot;');
	});
});

describe('formatHTML', () => {
	it('adds line breaks between block-level elements', () => {
		const result: string = formatHTML('<p>Hello</p><p>World</p>');
		expect(result).toBe('<p>\n  Hello\n</p>\n<p>\n  World\n</p>');
	});

	it('indents nested block elements', () => {
		const result: string = formatHTML('<ul><li>Item 1</li><li>Item 2</li></ul>');
		expect(result).toBe('<ul>\n  <li>\n    Item 1\n  </li>\n  <li>\n    Item 2\n  </li>\n</ul>');
	});

	it('preserves inline content on the same level', () => {
		const result: string = formatHTML('<p><strong>bold</strong> text</p>');
		expect(result).toBe('<p>\n  <strong>bold</strong> text\n</p>');
	});

	it('handles void elements without indentation increase', () => {
		const result: string = formatHTML('<p>Line 1<br>Line 2</p>');
		expect(result).toBe('<p>\n  Line 1\n  <br>\n  Line 2\n</p>');
	});

	it('handles hr as void block element', () => {
		const result: string = formatHTML('<p>Before</p><hr><p>After</p>');
		expect(result).toBe('<p>\n  Before\n</p>\n<hr>\n<p>\n  After\n</p>');
	});

	it('supports custom indent string', () => {
		const result: string = formatHTML('<p>Hello</p>', '\t');
		expect(result).toBe('<p>\n\tHello\n</p>');
	});

	it('returns empty string for empty input', () => {
		expect(formatHTML('')).toBe('');
	});

	it('handles table structures', () => {
		const result: string = formatHTML('<table><tr><td>Cell</td></tr></table>');
		expect(result).toBe('<table>\n  <tr>\n    <td>\n      Cell\n    </td>\n  </tr>\n</table>');
	});

	it('handles headings', () => {
		const result: string = formatHTML('<h1>Title</h1><p>Content</p>');
		expect(result).toBe('<h1>\n  Title\n</h1>\n<p>\n  Content\n</p>');
	});

	it('handles elements with attributes', () => {
		const result: string = formatHTML('<p style="text-align: center">Centered</p>');
		expect(result).toBe('<p style="text-align: center">\n  Centered\n</p>');
	});
});
