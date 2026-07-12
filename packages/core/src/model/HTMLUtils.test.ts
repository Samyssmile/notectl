import { describe, expect, it } from 'vitest';
import {
	SAFE_URI_REGEXP,
	escapeAttr,
	escapeHTML,
	formatHTML,
	fragmentIdentifiers,
	normalizeHTMLId,
	sanitizeHref,
} from './HTMLUtils.js';

/**
 * Wall-clock ceiling for the ReDoS-resistance checks below. Catastrophic
 * backtracking takes seconds, so a one-second ceiling separates linear
 * formatting (well under a millisecond) from a regression while staying robust
 * to CPU contention when the full suite runs in parallel. Not a micro-benchmark.
 */
const REDOS_CEILING_MS = 1000;

describe('normalizeHTMLId', () => {
	it.each(['section', '123', 'überblick', 'chapter.one', 'a:b', 'x#y'])(
		'keeps conforming ID %s',
		(value) => {
			expect(normalizeHTMLId(value)).toBe(value);
		},
	);

	it.each(['', 'two words', 'tab\tseparated', 'line\nbreak', 'form\ffeed', 'carriage\rreturn'])(
		'rejects non-conforming ID %j',
		(value) => {
			expect(normalizeHTMLId(value)).toBeUndefined();
		},
	);

	it.each([undefined, null, 42, true, {}])('rejects non-string value %j', (value) => {
		expect(normalizeHTMLId(value)).toBeUndefined();
	});
});

describe('fragmentIdentifiers', () => {
	it('returns the raw fragment before its decoded form', () => {
		expect(fragmentIdentifiers('#chapter%20one')).toEqual(['chapter%20one', 'chapter one']);
	});

	it('URL-serializes authored spaces and Unicode before decoding', () => {
		expect(fragmentIdentifiers('#chapter one')).toEqual(['chapter%20one', 'chapter one']);
		expect(fragmentIdentifiers('#café')).toEqual(['caf%C3%A9', 'café']);
	});

	it('does not duplicate an unencoded fragment', () => {
		expect(fragmentIdentifiers('#section')).toEqual(['section']);
	});

	it('keeps malformed percent escapes available for raw lookup', () => {
		expect(fragmentIdentifiers('#bad%zz')).toEqual(['bad%zz']);
	});

	it('decodes invalid UTF-8 without throwing', () => {
		expect(fragmentIdentifiers('#%FF')).toEqual(['%FF', '\uFFFD']);
	});

	it.each(['', '#', '/page#section', 'https://example.com/#section'])(
		'rejects non-local fragment %j',
		(value) => {
			expect(fragmentIdentifiers(value)).toEqual([]);
		},
	);
});

describe('SAFE_URI_REGEXP', () => {
	it('allows blob: URIs', () => {
		expect(SAFE_URI_REGEXP.test('blob:http://localhost/abc-123')).toBe(true);
	});

	it('allows data: URIs', () => {
		expect(SAFE_URI_REGEXP.test('data:image/png;base64,abc')).toBe(true);
	});

	it('allows https: URIs', () => {
		expect(SAFE_URI_REGEXP.test('https://example.com')).toBe(true);
	});

	it('allows http: URIs', () => {
		expect(SAFE_URI_REGEXP.test('http://example.com')).toBe(true);
	});

	it('allows mailto: URIs', () => {
		expect(SAFE_URI_REGEXP.test('mailto:user@example.com')).toBe(true);
	});

	it('rejects javascript: URIs', () => {
		expect(SAFE_URI_REGEXP.test('javascript:alert(1)')).toBe(false);
	});

	it('rejects vbscript: URIs', () => {
		expect(SAFE_URI_REGEXP.test('vbscript:exec')).toBe(false);
	});
});

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

	it('indents colgroups while keeping col elements void', () => {
		const result: string = formatHTML(
			'<table><colgroup><col><col style="width: 120px"></colgroup><tbody><tr><td>A</td></tr></tbody></table>',
		);
		expect(result).toBe(
			'<table>\n  <colgroup>\n    <col>\n    <col style="width: 120px">\n  </colgroup>\n  <tbody>\n    <tr>\n      <td>\n        A\n      </td>\n    </tr>\n  </tbody>\n</table>',
		);
	});

	it('handles headings', () => {
		const result: string = formatHTML('<h1>Title</h1><p>Content</p>');
		expect(result).toBe('<h1>\n  Title\n</h1>\n<p>\n  Content\n</p>');
	});

	it('handles elements with attributes', () => {
		const result: string = formatHTML('<p style="text-align: center">Centered</p>');
		expect(result).toBe('<p style="text-align: center">\n  Centered\n</p>');
	});

	it('tokenizes self-closing tags correctly', () => {
		const result: string = formatHTML('<p>Line 1<br/>Line 2</p>');
		expect(result).toContain('Line 1');
		expect(result).toContain('Line 2');
	});

	it('tokenizes self-closing tags with space correctly', () => {
		const result: string = formatHTML('<p>Line 1<br />Line 2</p>');
		expect(result).toContain('Line 1');
		expect(result).toContain('Line 2');
	});
});

describe('formatHTML ReDoS resistance', () => {
	it('completes in reasonable time with long input and no closing bracket', () => {
		const malicious: string = `<${'a'.repeat(1000)}${'/'.repeat(500)}`;
		const start: number = performance.now();
		formatHTML(malicious);
		const elapsed: number = performance.now() - start;
		expect(elapsed).toBeLessThan(REDOS_CEILING_MS);
	});

	it('completes in reasonable time with repeated slashes', () => {
		const malicious: string = `<div ${'/'.repeat(1000)}>`;
		const start: number = performance.now();
		formatHTML(malicious);
		const elapsed: number = performance.now() - start;
		expect(elapsed).toBeLessThan(REDOS_CEILING_MS);
	});
});

describe('sanitizeHref', () => {
	describe('safe schemes', () => {
		it.each([
			'http://example.com',
			'https://example.com/path?q=1',
			'mailto:user@example.com',
			'tel:+1-555-1234',
		])('keeps %s', (input) => {
			expect(sanitizeHref(input)).toBe(input);
		});

		it('keeps fragment-only URLs', () => {
			expect(sanitizeHref('#section')).toBe('#section');
		});

		it('keeps absolute paths', () => {
			expect(sanitizeHref('/page')).toBe('/page');
		});

		it('keeps bare relative URLs (no scheme)', () => {
			expect(sanitizeHref('example.com')).toBe('example.com');
			expect(sanitizeHref('page.html')).toBe('page.html');
		});

		it('trims surrounding whitespace before returning', () => {
			expect(sanitizeHref('  https://example.com  ')).toBe('https://example.com');
		});
	});

	describe('unsafe schemes', () => {
		it.each([
			'javascript:alert(1)',
			'JaVaScRiPt:alert(1)',
			'JAVASCRIPT:alert(1)',
			'\tjavascript:alert(1)',
			' javascript:alert(1)',
			'java\nscript:alert(1)',
			'vbscript:exec',
			'data:text/html,<script>alert(1)</script>',
			'data:image/png;base64,abc',
			'file:///etc/passwd',
			'blob:https://example.com/abc',
		])('rejects %s', (input) => {
			expect(sanitizeHref(input)).toBe('');
		});

		it('rejects javascript: with embedded NUL byte', () => {
			expect(sanitizeHref('java\u0000script:alert(1)')).toBe('');
		});

		it('rejects javascript: with embedded DEL byte', () => {
			expect(sanitizeHref('javascript\u007F:alert(1)')).toBe('');
		});
	});

	describe('edge cases', () => {
		it('returns empty for empty string', () => {
			expect(sanitizeHref('')).toBe('');
		});

		it('returns empty for whitespace-only', () => {
			expect(sanitizeHref('   \t\n')).toBe('');
		});

		it('returns empty for control-chars-only', () => {
			expect(sanitizeHref('\u0000\u001F\u007F')).toBe('');
		});
	});
});

describe('escapeAttr', () => {
	it('escapes double quotes', () => {
		expect(escapeAttr('a"b')).toBe('a&quot;b');
	});

	it('escapes ampersands', () => {
		expect(escapeAttr('a&b')).toBe('a&amp;b');
	});

	it('escapes angle brackets', () => {
		expect(escapeAttr('a<b>c')).toBe('a&lt;b&gt;c');
	});

	it('leaves safe strings unchanged', () => {
		expect(escapeAttr('hello world')).toBe('hello world');
	});

	it('handles all special characters together', () => {
		expect(escapeAttr('"&<>')).toBe('&quot;&amp;&lt;&gt;');
	});
});
