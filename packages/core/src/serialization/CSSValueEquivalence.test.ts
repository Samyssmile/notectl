import { describe, expect, it } from 'vitest';
import {
	type CSSValueCanonicalizer,
	type KnownValueLookup,
	createCSSValueCanonicalizer,
	createKnownValueLookup,
} from './CSSValueEquivalence.js';

/** Reads colors back the way browsers do: `#e03131` becomes `rgb(224, 49, 49)`. */
const browserLikeCanonicalizer: CSSValueCanonicalizer = (_property: string, value: string) =>
	value.toLowerCase() === '#e03131' ? 'rgb(224, 49, 49)' : value;

describe('createCSSValueCanonicalizer', () => {
	it("reads values in the CSS engine's own form", () => {
		const canonicalize: CSSValueCanonicalizer = createCSSValueCanonicalizer();

		expect(canonicalize('color', 'rgb(224,49,49)')).toBe('rgb(224, 49, 49)');
		expect(canonicalize('font-family', "'Inter', sans-serif")).toBe(
			canonicalize('font-family', '"Inter", sans-serif'),
		);
	});

	it('returns a value the engine rejects as written', () => {
		const canonicalize: CSSValueCanonicalizer = createCSSValueCanonicalizer();

		expect(canonicalize('color', 'not-a-color')).toBe('not-a-color');
	});
});

describe('createKnownValueLookup', () => {
	it('finds the known spelling of a value the engine reads the same', () => {
		const lookup: KnownValueLookup = createKnownValueLookup(
			'color',
			['#1971c2', '#e03131'],
			browserLikeCanonicalizer,
		);

		expect(lookup('rgb(224, 49, 49)')).toBe('#e03131');
		expect(lookup('#E03131')).toBe('#e03131');
	});

	it('finds nothing for a value without a known equivalent', () => {
		const lookup: KnownValueLookup = createKnownValueLookup(
			'color',
			['#e03131'],
			browserLikeCanonicalizer,
		);

		expect(lookup('rgb(18, 52, 86)')).toBeUndefined();
	});

	it('lets the first equivalent known value win', () => {
		const lookup: KnownValueLookup = createKnownValueLookup(
			'color',
			['#E03131', '#e03131'],
			browserLikeCanonicalizer,
		);

		expect(lookup('rgb(224, 49, 49)')).toBe('#E03131');
	});

	it('canonicalizes the known values once, at the first lookup', () => {
		const calls: string[] = [];
		const lookup: KnownValueLookup = createKnownValueLookup(
			'color',
			['#e03131', '#1971c2'],
			(_property: string, value: string) => {
				calls.push(value);
				return value;
			},
		);
		expect(calls).toEqual([]);

		lookup('#e03131');
		lookup('#1971c2');

		expect(calls).toEqual(['#e03131', '#1971c2', '#e03131', '#1971c2']);
	});

	it('finds nothing without known values', () => {
		const lookup: KnownValueLookup = createKnownValueLookup('color', [], () => {
			throw new Error('canonicalized without known values');
		});

		expect(lookup('#e03131')).toBeUndefined();
	});
});
