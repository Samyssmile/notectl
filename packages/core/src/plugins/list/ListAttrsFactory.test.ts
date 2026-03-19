import { describe, expect, it } from 'vitest';
import { buildListItemAttrs } from './ListAttrsFactory.js';

describe('buildListItemAttrs', () => {
	it('builds bullet list attrs without checked', () => {
		const attrs = buildListItemAttrs('bullet', 0);
		expect(attrs).toEqual({ listType: 'bullet', indent: 0 });
		expect('checked' in attrs).toBe(false);
	});

	it('builds ordered list attrs without checked', () => {
		const attrs = buildListItemAttrs('ordered', 2);
		expect(attrs).toEqual({ listType: 'ordered', indent: 2 });
		expect('checked' in attrs).toBe(false);
	});

	it('builds checklist attrs with default checked false', () => {
		const attrs = buildListItemAttrs('checklist', 0);
		expect(attrs).toEqual({ listType: 'checklist', indent: 0, checked: false });
	});

	it('builds checklist attrs with explicit checked true', () => {
		const attrs = buildListItemAttrs('checklist', 1, true);
		expect(attrs).toEqual({ listType: 'checklist', indent: 1, checked: true });
	});

	it('builds checklist attrs with explicit checked false', () => {
		const attrs = buildListItemAttrs('checklist', 0, false);
		expect(attrs).toEqual({ listType: 'checklist', indent: 0, checked: false });
	});

	it('preserves indent value', () => {
		const attrs = buildListItemAttrs('bullet', 5);
		expect(attrs.indent).toBe(5);
	});

	it('ignores checked parameter for non-checklist types', () => {
		const attrs = buildListItemAttrs('bullet', 0, true);
		expect('checked' in attrs).toBe(false);
	});
});
