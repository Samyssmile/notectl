import { describe, expect, it } from 'vitest';
import { type MarkdownSyntaxExtension, MarkdownSyntaxRegistry } from './MarkdownSyntaxRegistry.js';

describe('MarkdownSyntaxRegistry', () => {
	it('removes only the requested extension instance', () => {
		const registry = new MarkdownSyntaxRegistry();
		const first: MarkdownSyntaxExtension = { id: 'first' };
		const second: MarkdownSyntaxExtension = { id: 'second' };
		registry.register(first);
		registry.register(second);

		registry.remove(first);

		expect(registry.getExtensions()).toEqual([second]);
	});
});
