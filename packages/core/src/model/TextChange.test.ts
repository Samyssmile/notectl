import { describe, expect, it } from 'vitest';
import { findTextChange } from './TextChange.js';

describe('findTextChange', () => {
	it('returns null for equal texts', () => {
		expect(findTextChange('hello', 'hello', 5)).toBeNull();
	});

	it('finds an insertion', () => {
		expect(findTextChange('hello', 'hellowo', 5)).toEqual({ from: 5, to: 5, text: 'wo' });
	});

	it('finds a deletion', () => {
		expect(findTextChange('hello', 'hell', 5)).toEqual({ from: 4, to: 5, text: '' });
	});

	it('finds a replacement', () => {
		expect(findTextChange('wrold', 'world', 5)).toEqual({ from: 1, to: 3, text: 'or' });
	});

	it('finds a change that empties the text', () => {
		expect(findTextChange('hello', '', 5)).toEqual({ from: 0, to: 5, text: '' });
	});

	it('places an insertion into a repeated run at the preferred offset', () => {
		expect(findTextChange('hello', 'helllo', 3)).toEqual({ from: 3, to: 3, text: 'l' });
		expect(findTextChange('hello', 'helllo', 2)).toEqual({ from: 2, to: 2, text: 'l' });
	});

	it('keeps an insertion at the latest valid offset when the preferred one is out of range', () => {
		expect(findTextChange('hello', 'helllo', 5)).toEqual({ from: 4, to: 4, text: 'l' });
	});

	it('places a deletion from a repeated run at the preferred offset', () => {
		expect(findTextChange('aaaa', 'aa', 1)).toEqual({ from: 1, to: 3, text: '' });
	});

	it('compares characters with the given equality', () => {
		const spaceIsNbsp = (a: string, b: string): boolean => a === b || (a === ' ' && b === ' ');

		expect(findTextChange('a b', 'a b', 3, spaceIsNbsp)).toBeNull();
		expect(findTextChange('a b', 'a bc', 3, spaceIsNbsp)).toEqual({
			from: 3,
			to: 3,
			text: 'c',
		});
	});
});
