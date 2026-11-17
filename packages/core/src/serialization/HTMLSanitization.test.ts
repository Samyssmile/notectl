import DOMPurify from 'dompurify';
import { describe, expect, it } from 'vitest';
import { preserveHTMLIdSanitizeConfig, sanitizeHTMLFragment } from './HTMLSanitization.js';

describe('preserveHTMLIdSanitizeConfig', () => {
	it('keeps a clobber-sensitive ID and respects the caller attribute policy', () => {
		const html = DOMPurify.sanitize('<p id="target" name="target">Destination</p>', {
			ALLOWED_TAGS: ['p'],
			ALLOWED_ATTR: ['id', 'name'],
			...preserveHTMLIdSanitizeConfig(),
		});

		expect(html).toBe('<p id="target" name="target">Destination</p>');
	});

	it('can explicitly forbid named controls during a broad sanitizer pass', () => {
		const html = DOMPurify.sanitize('<p id="target" name="target">Destination</p>', {
			ALLOWED_TAGS: ['p'],
			ALLOWED_ATTR: ['id', 'name'],
			...preserveHTMLIdSanitizeConfig('name'),
		});

		expect(html).toBe('<p id="target">Destination</p>');
	});
});

describe('sanitizeHTMLFragment', () => {
	it('resanitizes a fragment without losing preformatted lines or mutating its source', () => {
		const source: DocumentFragment = document.createDocumentFragment();
		const pre: HTMLElement = document.createElement('pre');
		pre.textContent = '\n\na\nb\n';
		pre.setAttribute('onclick', 'alert(1)');
		source.append(pre, document.createElement('script'));
		const config = { ALLOWED_TAGS: ['pre'], ALLOWED_ATTR: [] };

		const sanitized: DocumentFragment = sanitizeHTMLFragment(source, config);
		const repeated: DocumentFragment = sanitizeHTMLFragment(sanitized, config);

		expect(repeated.querySelector('pre')?.textContent).toBe('\n\na\nb\n');
		expect(repeated.querySelector('script, [onclick]')).toBeNull();
		expect(source.querySelector('script')).not.toBeNull();
		expect(pre.hasAttribute('onclick')).toBe(true);
	});
});
