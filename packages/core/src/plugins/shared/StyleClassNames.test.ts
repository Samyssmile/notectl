import { describe, expect, it, vi } from 'vitest';
import type { StyleClass } from '../../model/StyleClass.js';
import { mockPluginContext } from '../../test/TestUtils.js';
import type { PluginContext } from '../Plugin.js';
import { registerStyleClassNames } from './StyleClassNames.js';

const declarationFor = (key: string): string => `color: ${key}`;

describe('registerStyleClassNames', () => {
	it('registers one style class per entry and skips unset entries', () => {
		const context: PluginContext = mockPluginContext();

		registerStyleClassNames(
			context,
			'TestPlugin',
			{ '#e03131': 'text-red', '#1971c2': undefined, '#2f9e44': 'text-green' },
			declarationFor,
		);

		expect(vi.mocked(context.registerStyleClass).mock.calls).toEqual([
			[{ className: 'text-red', declaration: 'color: #e03131' }],
			[{ className: 'text-green', declaration: 'color: #2f9e44' }],
		]);
	});

	it('registers nothing without the option', () => {
		const context: PluginContext = mockPluginContext();

		registerStyleClassNames(context, 'TestPlugin', undefined, declarationFor);

		expect(context.registerStyleClass).not.toHaveBeenCalled();
	});

	it('names the plugin in the errors of invalid keys and classes', () => {
		const context: PluginContext = mockPluginContext({
			registerStyleClass: (styleClass: StyleClass): void => {
				throw new TypeError(`Invalid class name "${styleClass.className}".`);
			},
		});

		expect(() =>
			registerStyleClassNames(context, 'TestPlugin', { bad: 'x' }, () => {
				throw new TypeError('"bad" is not a color.');
			}),
		).toThrow(new TypeError('TestPlugin styleClasses: "bad" is not a color.'));
		expect(() =>
			registerStyleClassNames(context, 'TestPlugin', { red: 'a b' }, declarationFor),
		).toThrow(new TypeError('TestPlugin styleClasses: Invalid class name "a b".'));
	});

	it('passes other errors on unchanged', () => {
		const failure = new Error('registry closed');
		const context: PluginContext = mockPluginContext({
			registerStyleClass: (): void => {
				throw failure;
			},
		});

		expect(() =>
			registerStyleClassNames(context, 'TestPlugin', { red: 'text-red' }, declarationFor),
		).toThrow(failure);
	});
});
