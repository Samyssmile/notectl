import { describe, expect, it } from 'vitest';
import { findTextChange } from './TextChange.js';

describe('findTextChange', () => {
	it('returns null for equal texts', () => {
		expect(findTextChange('hello', 'hello', { preferredFrom: 5 })).toBeNull();
	});

	it('finds an insertion', () => {
		expect(findTextChange('hello', 'hellowo', { preferredFrom: 5 })).toEqual({
			from: 5,
			to: 5,
			text: 'wo',
		});
	});

	it('finds a deletion', () => {
		expect(findTextChange('hello', 'hell', { preferredFrom: 5 })).toEqual({
			from: 4,
			to: 5,
			text: '',
		});
	});

	it('finds a replacement', () => {
		expect(findTextChange('wrold', 'world', { preferredFrom: 5 })).toEqual({
			from: 1,
			to: 3,
			text: 'or',
		});
	});

	it('finds a change that empties the text', () => {
		expect(findTextChange('hello', '', { preferredFrom: 5 })).toEqual({
			from: 0,
			to: 5,
			text: '',
		});
	});

	it('places an insertion into a repeated run at the preferred offset', () => {
		expect(findTextChange('hello', 'helllo', { preferredFrom: 3 })).toEqual({
			from: 3,
			to: 3,
			text: 'l',
		});
		expect(findTextChange('hello', 'helllo', { preferredFrom: 2 })).toEqual({
			from: 2,
			to: 2,
			text: 'l',
		});
	});

	it('keeps an insertion at the latest valid offset when the preferred one is out of range', () => {
		expect(findTextChange('hello', 'helllo', { preferredFrom: 5 })).toEqual({
			from: 4,
			to: 4,
			text: 'l',
		});
	});

	it('places a deletion from a repeated run at the preferred offset', () => {
		expect(findTextChange('aaaa', 'aa', { preferredFrom: 1 })).toEqual({
			from: 1,
			to: 3,
			text: '',
		});
	});

	it('ends a deletion from a repeated run at the preferred deletion end', () => {
		// A backspace at `ab|bc` removes the b in front of the caret.
		expect(findTextChange('abbc', 'abc', { preferredFrom: 2, preferredDeletionEnd: 2 })).toEqual({
			from: 1,
			to: 2,
			text: '',
		});
	});

	it('falls back to the preferred start when the deletion cannot end at the preferred end', () => {
		// `x|aay` lost an a after the caret: no candidate range ends at offset 1.
		expect(findTextChange('xaay', 'xay', { preferredFrom: 1, preferredDeletionEnd: 1 })).toEqual({
			from: 1,
			to: 2,
			text: '',
		});
	});

	it('compares characters with the given equality', () => {
		const spaceIsNbsp =
			(before: string, after: string) =>
			(i: number, j: number): boolean =>
				before.charAt(i) === after.charAt(j) ||
				(before.charAt(i) === ' ' && after.charAt(j) === '\u00a0');

		expect(
			findTextChange('a b', 'a\u00a0b', {
				preferredFrom: 3,
				equals: spaceIsNbsp('a b', 'a\u00a0b'),
			}),
		).toBeNull();
		expect(
			findTextChange('a b', 'a\u00a0bc', {
				preferredFrom: 3,
				equals: spaceIsNbsp('a b', 'a\u00a0bc'),
			}),
		).toEqual({ from: 3, to: 3, text: 'c' });
	});

	it('tells repeated units apart by position when the equality knows their identity', () => {
		// `x A B z` renders as `x B z`: the unit at after[1] is before[2], so A was removed.
		const before = 'x##z';
		const after = 'x#z';
		const origins: ReadonlyMap<number, number> = new Map([[1, 2]]);
		const sameUnit = (i: number, j: number): boolean =>
			before.charAt(i) === '#' ? origins.get(j) === i : before.charAt(i) === after.charAt(j);

		expect(findTextChange(before, after, { preferredFrom: 2, equals: sameUnit })).toEqual({
			from: 1,
			to: 2,
			text: '',
		});
	});
});
