import { describe, expect, it } from 'vitest';
import { type AlignmentClassNames, validateAlignmentClassNames } from './AlignmentClassNames.js';

describe('validateAlignmentClassNames', () => {
	it('returns a frozen copy of valid class names', () => {
		const input: AlignmentClassNames = { start: 'align-start', center: 'align-center' };

		const result: AlignmentClassNames = validateAlignmentClassNames(input);

		expect(result).toEqual(input);
		expect(result).not.toBe(input);
		expect(Object.isFrozen(result)).toBe(true);
	});

	it('accepts all four logical alignments', () => {
		const result: AlignmentClassNames = validateAlignmentClassNames({
			start: 'text-start',
			center: 'text-center',
			end: 'text-end',
			justify: 'text-justify',
		});

		expect(Object.keys(result)).toEqual(['start', 'center', 'end', 'justify']);
	});

	it('accepts identifiers with underscores, digits and a leading hyphen', () => {
		expect(() =>
			validateAlignmentClassNames({ center: '_c', end: '-is-end', justify: 'j2-x_y' }),
		).not.toThrow();
	});

	it('drops alignments set to undefined', () => {
		expect(validateAlignmentClassNames({ center: 'c', end: undefined })).toEqual({ center: 'c' });
	});

	it('explains logical alignments when given a physical one', () => {
		const classNames = { left: 'align-left' } as unknown as AlignmentClassNames;

		expect(() => validateAlignmentClassNames(classNames)).toThrow(
			'Unknown alignment "left"; use start, center, end, justify. ' +
				'Alignment is logical: "start" is left in left-to-right text.',
		);
	});

	it('rejects unknown alignments, including inherited property names', () => {
		const classNames = { constructor: 'c' } as unknown as AlignmentClassNames;

		expect(() => validateAlignmentClassNames(classNames)).toThrow(
			'Unknown alignment "constructor"; use start, center, end, justify.',
		);
	});

	it.each([
		['contains whitespace', 'align center'],
		['is empty', ''],
		['starts with a digit', '1st'],
		['needs CSS escaping', 'md:text-center'],
		['could break out of the attribute', 'x" onclick="y'],
	])('rejects a class name that %s', (_case: string, className: string) => {
		expect(() => validateAlignmentClassNames({ center: className })).toThrow(TypeError);
		expect(() => validateAlignmentClassNames({ center: className })).toThrow(
			`Invalid class name ${JSON.stringify(className)} for "center": use one CSS class name`,
		);
	});

	it('rejects a class name that is not a string', () => {
		const classNames = { center: 42 } as unknown as AlignmentClassNames;

		expect(() => validateAlignmentClassNames(classNames)).toThrow(
			'Invalid class name 42 for "center":',
		);
	});

	it('reserves the notectl- prefix for generated classes', () => {
		expect(() => validateAlignmentClassNames({ center: 'notectl-align-end' })).toThrow(
			'Class "notectl-align-end" for "center" uses the reserved prefix "notectl-".',
		);
	});

	it('requires a distinct class per alignment', () => {
		expect(() => validateAlignmentClassNames({ center: 'aligned', end: 'aligned' })).toThrow(
			'Class "aligned" is mapped to both "center" and "end"; use one class each.',
		);
	});

	it.each([null, 'align-center', ['align-center']])('rejects %j instead of an object', (value) => {
		expect(() => validateAlignmentClassNames(value as unknown as AlignmentClassNames)).toThrow(
			"Alignment class names must be an object, e.g. { center: 'align-center' }.",
		);
	});
});
