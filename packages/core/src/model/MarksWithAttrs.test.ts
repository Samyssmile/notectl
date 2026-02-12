import { describe, expect, it } from 'vitest';
import { type Mark, markSetsEqual, marksEqual } from './Document.js';

describe('marksEqual with attrs', () => {
	it('considers marks equal when both have no attrs', () => {
		const a: Mark = { type: 'bold' };
		const b: Mark = { type: 'bold' };
		expect(marksEqual(a, b)).toBe(true);
	});

	it('considers marks unequal with different types', () => {
		const a: Mark = { type: 'bold' };
		const b: Mark = { type: 'italic' };
		expect(marksEqual(a, b)).toBe(false);
	});

	it('considers marks equal when attrs match', () => {
		const a: Mark = { type: 'link', attrs: { href: 'https://example.com' } };
		const b: Mark = { type: 'link', attrs: { href: 'https://example.com' } };
		expect(marksEqual(a, b)).toBe(true);
	});

	it('considers marks unequal when attrs differ', () => {
		const a: Mark = { type: 'link', attrs: { href: 'https://a.com' } };
		const b: Mark = { type: 'link', attrs: { href: 'https://b.com' } };
		expect(marksEqual(a, b)).toBe(false);
	});

	it('considers marks unequal when one has attrs and the other does not', () => {
		const a: Mark = { type: 'link', attrs: { href: 'https://a.com' } };
		const b: Mark = { type: 'link' };
		expect(marksEqual(a, b)).toBe(false);
	});

	it('considers marks unequal when attrs have different keys', () => {
		const a: Mark = { type: 'custom', attrs: { a: 1 } };
		const b: Mark = { type: 'custom', attrs: { b: 1 } };
		expect(marksEqual(a, b)).toBe(false);
	});

	it('markSetsEqual works with attrs', () => {
		const setA: Mark[] = [
			{ type: 'bold' },
			{ type: 'link', attrs: { href: 'https://example.com' } },
		];
		const setB: Mark[] = [
			{ type: 'link', attrs: { href: 'https://example.com' } },
			{ type: 'bold' },
		];
		expect(markSetsEqual(setA, setB)).toBe(true);
	});

	it('markSetsEqual detects attr differences', () => {
		const setA: Mark[] = [{ type: 'link', attrs: { href: 'https://a.com' } }];
		const setB: Mark[] = [{ type: 'link', attrs: { href: 'https://b.com' } }];
		expect(markSetsEqual(setA, setB)).toBe(false);
	});
});
