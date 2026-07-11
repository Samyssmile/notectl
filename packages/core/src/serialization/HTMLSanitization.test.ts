import DOMPurify from 'dompurify';
import { describe, expect, it } from 'vitest';
import { preserveHTMLIdSanitizeConfig } from './HTMLSanitization.js';

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
