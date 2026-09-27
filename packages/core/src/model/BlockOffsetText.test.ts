import { describe, expect, it } from 'vitest';
import { getBlockOffsetText } from './BlockOffsetText.js';
import { createBlockNode, createInlineNode, createTextNode } from './Document.js';
import { INLINE_NODE_PLACEHOLDER } from './InputRule.js';
import { inlineType, markType } from './TypeBrands.js';

describe('getBlockOffsetText', () => {
	it('renders inline nodes as one placeholder so indices are model offsets', () => {
		const block = createBlockNode(
			'paragraph',
			[
				createTextNode('a'),
				createInlineNode(inlineType('hard_break')),
				createTextNode('bc', [{ type: markType('bold') }]),
			],
			'b1',
		);

		expect(getBlockOffsetText(block)).toBe(`a${INLINE_NODE_PLACEHOLDER}bc`);
	});
});
