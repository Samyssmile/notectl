import { describe, expect, it } from 'vitest';
import { type ContentSlice, sliceHasContent } from './ContentSlice.js';
import { createInlineNode, inlineSegment, textSegment } from './Document.js';
import { inlineType, nodeType } from './TypeBrands.js';

describe('sliceHasContent (#216)', () => {
	it('reports false for an empty block list', () => {
		const slice: ContentSlice = { blocks: [] };

		expect(sliceHasContent(slice)).toBe(false);
	});

	it('reports false for the single-empty-paragraph parse sentinel', () => {
		const slice: ContentSlice = { blocks: [{ type: nodeType('paragraph'), segments: [] }] };

		expect(sliceHasContent(slice)).toBe(false);
	});

	it('reports false for multiple empty paragraphs (metadata-only markup)', () => {
		// Design-tool clipboards ship structural divs that parse into several
		// empty paragraphs; none of them materializes visible content.
		const slice: ContentSlice = {
			blocks: [
				{ type: nodeType('paragraph'), segments: [] },
				{ type: nodeType('paragraph'), segments: [] },
			],
		};

		expect(sliceHasContent(slice)).toBe(false);
	});

	it('reports false for zero-width-only text', () => {
		const slice: ContentSlice = {
			blocks: [{ type: nodeType('paragraph'), segments: [textSegment('\u200B\u200D\u2060')] }],
		};

		expect(sliceHasContent(slice)).toBe(false);
	});

	it('reports true for visible text', () => {
		const slice: ContentSlice = {
			blocks: [
				{ type: nodeType('paragraph'), segments: [] },
				{ type: nodeType('paragraph'), segments: [textSegment('x')] },
			],
		};

		expect(sliceHasContent(slice)).toBe(true);
	});

	it('reports true for whitespace text (a <br> parses to a newline segment)', () => {
		const slice: ContentSlice = {
			blocks: [{ type: nodeType('paragraph'), segments: [textSegment('\n')] }],
		};

		expect(sliceHasContent(slice)).toBe(true);
	});

	it('reports true for an atomic inline node without any text', () => {
		const slice: ContentSlice = {
			blocks: [
				{
					type: nodeType('paragraph'),
					segments: [inlineSegment(createInlineNode(inlineType('math_inline'), {}))],
				},
			],
		};

		expect(sliceHasContent(slice)).toBe(true);
	});

	it('reports true for an empty non-paragraph block (still a visible box)', () => {
		const slice: ContentSlice = { blocks: [{ type: nodeType('code_block'), segments: [] }] };

		expect(sliceHasContent(slice)).toBe(true);
	});
});
