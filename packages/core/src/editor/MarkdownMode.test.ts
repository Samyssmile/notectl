import { describe, expect, it } from 'vitest';
import { type MarkdownConfig, resolveMarkdownMode } from './MarkdownMode.js';

describe('resolveMarkdownMode', () => {
	// The truth table from the design: booleans set both axes, the object form
	// resolves each axis independently from its default (shorthand on, paste auto).
	const cases: ReadonlyArray<{
		readonly name: string;
		readonly input: boolean | MarkdownConfig | undefined;
		readonly shorthand: boolean;
		readonly paste: 'auto' | 'never';
	}> = [
		{ name: 'undefined -> both on', input: undefined, shorthand: true, paste: 'auto' },
		{ name: 'true -> both on', input: true, shorthand: true, paste: 'auto' },
		{ name: 'false -> both off', input: false, shorthand: false, paste: 'never' },
		{ name: 'empty object -> both default on', input: {}, shorthand: true, paste: 'auto' },
		{
			name: '{ shorthand: false } -> typing off, paste stays auto',
			input: { shorthand: false },
			shorthand: false,
			paste: 'auto',
		},
		{
			name: '{ paste: "never" } -> paste off, typing stays on',
			input: { paste: 'never' },
			shorthand: true,
			paste: 'never',
		},
		{
			name: '{ shorthand: false, paste: "never" } -> both off',
			input: { shorthand: false, paste: 'never' },
			shorthand: false,
			paste: 'never',
		},
		{
			name: '{ shorthand: true, paste: "auto" } -> explicit both on',
			input: { shorthand: true, paste: 'auto' },
			shorthand: true,
			paste: 'auto',
		},
	];

	for (const c of cases) {
		it(c.name, () => {
			const resolved = resolveMarkdownMode(c.input);
			expect(resolved.shorthand).toBe(c.shorthand);
			expect(resolved.paste).toBe(c.paste);
		});
	}
});
