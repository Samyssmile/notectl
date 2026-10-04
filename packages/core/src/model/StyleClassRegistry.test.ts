import { describe, expect, it } from 'vitest';
import type { StyleClass } from './StyleClass.js';
import { validateStyleClass } from './StyleClassRegistry.js';

describe('validateStyleClass', () => {
	it('returns a frozen copy with the declaration in property: value form', () => {
		const styleClass: StyleClass = validateStyleClass({
			className: 'text-red',
			declaration: 'COLOR:#e03131;',
		});

		expect(styleClass).toEqual({ className: 'text-red', declaration: 'color: #e03131' });
		expect(Object.isFrozen(styleClass)).toBe(true);
	});

	it.each(['text-red', '_x', '-is-end', 'j2-x_y'])('accepts the class name %s', (className) => {
		expect(validateStyleClass({ className, declaration: 'color: red' }).className).toBe(className);
	});

	it.each(['text red', '2col', 'md:text-red', '', 'a.b'])(
		'rejects the class name %j with an explanation',
		(className: string) => {
			expect(() => validateStyleClass({ className, declaration: 'color: red' })).toThrow(
				new TypeError(
					`Invalid class name ${JSON.stringify(className)} for "color: red": use one CSS class name of letters, digits, "-" and "_", not starting with a digit.`,
				),
			);
		},
	);

	it("reserves the prefix of notectl's own class names", () => {
		expect(() =>
			validateStyleClass({ className: 'notectl-red', declaration: 'color: red' }),
		).toThrow(
			new TypeError('Class "notectl-red" for "color: red" uses the reserved prefix "notectl-".'),
		);
	});

	it('rejects a declaration that is not exactly one safe declaration', () => {
		expect(() =>
			validateStyleClass({ className: 'red', declaration: 'color: red; font-size: 1px' }),
		).toThrow(
			new TypeError(
				'Invalid declaration "color: red; font-size: 1px": use one CSS declaration such as "color: #e03131".',
			),
		);
	});

	it('rejects values that are not strings', () => {
		const invalid = { className: 3, declaration: null } as unknown as StyleClass;

		expect(() => validateStyleClass(invalid)).toThrow(TypeError);
	});
});
