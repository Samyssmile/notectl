import { describe, expect, it } from 'vitest';
import { normalizeHTMLWhitespace } from './HTMLWhitespace.js';

/** Parses HTML into a fragment, runs the normalizer, and returns the fragment. */
function normalize(html: string): DocumentFragment {
	const template: HTMLTemplateElement = document.createElement('template');
	template.innerHTML = html;
	normalizeHTMLWhitespace(template.content);
	return template.content;
}

/** Normalizes HTML and returns the resulting `textContent`. */
function normalizedText(html: string): string {
	return normalize(html).textContent ?? '';
}

const NBSP: string = String.fromCharCode(0x00a0);

describe('normalizeHTMLWhitespace', () => {
	describe('collapsing within a block', () => {
		it('collapses embedded newlines to a single space (Firefox clipboard wrapping)', () => {
			const html =
				'<p>Do not collect the GST/HST when a customer gives you a deposit\n' +
				'towards a taxable purchase. Collect the GST/HST on the deposit when you\n' +
				'apply it to the purchase price.</p>';
			expect(normalizedText(html)).toBe(
				'Do not collect the GST/HST when a customer gives you a deposit ' +
					'towards a taxable purchase. Collect the GST/HST on the deposit when you ' +
					'apply it to the purchase price.',
			);
		});

		it('collapses runs of spaces, tabs and newlines to one space', () => {
			expect(normalizedText('<p>a \t\n  b</p>')).toBe('a b');
		});

		it('trims leading and trailing whitespace at block edges', () => {
			expect(normalizedText('<p>\n  hello world  \n</p>')).toBe('hello world');
		});
	});

	describe('preserving significant whitespace', () => {
		it('preserves non-breaking spaces (does not treat U+00A0 as collapsible)', () => {
			expect(normalizedText('<p>a&nbsp;&nbsp;b</p>')).toBe(`a${NBSP}${NBSP}b`);
		});

		it('preserves whitespace inside <pre>', () => {
			expect(normalizedText('<pre>  line1\n    line2\n</pre>')).toBe('  line1\n    line2\n');
		});

		it('preserves whitespace under white-space: pre-wrap', () => {
			expect(normalizedText('<div style="white-space: pre-wrap">a\n  b</div>')).toBe('a\n  b');
		});
	});

	describe('cross-element collapsing', () => {
		it('keeps a single space between inline siblings', () => {
			expect(normalizedText('<p><strong>bold</strong> and <em>italic</em></p>')).toBe(
				'bold and italic',
			);
		});

		it('collapses a newline that falls at an inline element boundary', () => {
			expect(normalizedText('<p>foo\n<strong>bar</strong></p>')).toBe('foo bar');
		});

		it('does not introduce a double space across inline boundaries', () => {
			// Trailing space in one node + leading space in the next collapse to one.
			expect(normalizedText('<p><span>foo </span><span> bar</span></p>')).toBe('foo bar');
		});

		it('trims trailing whitespace that ends inside a nested inline element', () => {
			expect(normalizedText('<p>foo <strong>bar </strong></p>')).toBe('foo bar');
		});
	});

	describe('block boundaries', () => {
		it('resets collapsing per block, no leading/trailing space leaks between blocks', () => {
			const fragment: DocumentFragment = normalize('<p>  first  </p>\n  <p>  second  </p>');
			const paragraphs: HTMLParagraphElement[] = Array.from(fragment.querySelectorAll('p'));
			expect(paragraphs.map((p) => p.textContent)).toEqual(['first', 'second']);
		});

		it('drops whitespace-only text between list items', () => {
			const fragment: DocumentFragment = normalize(
				'<ul>\n  <li>  a  </li>\n  <li>  b  </li>\n</ul>',
			);
			const items: HTMLLIElement[] = Array.from(fragment.querySelectorAll('li'));
			expect(items.map((li) => li.textContent)).toEqual(['a', 'b']);
		});
	});

	describe('hard breaks (deliberately left intact)', () => {
		it('does not remove <br> elements', () => {
			const fragment: DocumentFragment = normalize('<p>line1<br>line2</p>');
			expect(fragment.querySelectorAll('br')).toHaveLength(1);
		});
	});
});
