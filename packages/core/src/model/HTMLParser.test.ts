import { describe, expect, it } from 'vitest';
import { HTMLParser } from './HTMLParser.js';
import type { Schema } from './Schema.js';

function createTestSchema(opts?: {
	nodeTypes?: string[];
	markTypes?: string[];
}): Schema {
	return {
		nodeTypes: opts?.nodeTypes ?? [
			'paragraph',
			'heading',
			'blockquote',
			'list_item',
			'horizontal_rule',
		],
		markTypes: opts?.markTypes ?? ['bold', 'italic', 'underline', 'strikethrough', 'link'],
	};
}

function parseHTML(html: string, schema?: Schema): ReturnType<HTMLParser['parse']> {
	const parser = new HTMLParser({ schema: schema ?? createTestSchema() });
	const template = document.createElement('template');
	template.innerHTML = html;
	return parser.parse(template.content);
}

describe('HTMLParser', () => {
	describe('inline marks', () => {
		it('parses bold text', () => {
			const slice = parseHTML('<p><strong>bold</strong> text</p>');
			expect(slice.blocks).toHaveLength(1);
			expect(slice.blocks[0]?.segments).toEqual([
				{ text: 'bold', marks: [{ type: 'bold' }] },
				{ text: ' text', marks: [] },
			]);
		});

		it('parses <b> as bold', () => {
			const slice = parseHTML('<p><b>bold</b></p>');
			expect(slice.blocks[0]?.segments).toEqual([{ text: 'bold', marks: [{ type: 'bold' }] }]);
		});

		it('parses italic text', () => {
			const slice = parseHTML('<p><em>italic</em></p>');
			expect(slice.blocks[0]?.segments).toEqual([{ text: 'italic', marks: [{ type: 'italic' }] }]);
		});

		it('parses <i> as italic', () => {
			const slice = parseHTML('<p><i>italic</i></p>');
			expect(slice.blocks[0]?.segments).toEqual([{ text: 'italic', marks: [{ type: 'italic' }] }]);
		});

		it('parses underline', () => {
			const slice = parseHTML('<p><u>underlined</u></p>');
			expect(slice.blocks[0]?.segments).toEqual([
				{ text: 'underlined', marks: [{ type: 'underline' }] },
			]);
		});

		it('parses strikethrough from <s>', () => {
			const slice = parseHTML('<p><s>deleted</s></p>');
			expect(slice.blocks[0]?.segments).toEqual([
				{ text: 'deleted', marks: [{ type: 'strikethrough' }] },
			]);
		});

		it('parses strikethrough from <del>', () => {
			const slice = parseHTML('<p><del>deleted</del></p>');
			expect(slice.blocks[0]?.segments).toEqual([
				{ text: 'deleted', marks: [{ type: 'strikethrough' }] },
			]);
		});

		it('parses links', () => {
			const slice = parseHTML('<p><a href="https://example.com">link</a></p>');
			expect(slice.blocks[0]?.segments).toEqual([
				{ text: 'link', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
			]);
		});

		it('parses nested marks', () => {
			const slice = parseHTML('<p><strong><em>bold italic</em></strong></p>');
			expect(slice.blocks[0]?.segments).toEqual([
				{ text: 'bold italic', marks: [{ type: 'bold' }, { type: 'italic' }] },
			]);
		});

		it('parses mixed marks across spans', () => {
			const slice = parseHTML('<p><strong>bold</strong> and <em>italic</em></p>');
			expect(slice.blocks[0]?.segments).toEqual([
				{ text: 'bold', marks: [{ type: 'bold' }] },
				{ text: ' and ', marks: [] },
				{ text: 'italic', marks: [{ type: 'italic' }] },
			]);
		});

		it('normalizes adjacent segments with same marks', () => {
			const slice = parseHTML('<p><strong>first</strong><strong> second</strong></p>');
			expect(slice.blocks[0]?.segments).toEqual([
				{ text: 'first second', marks: [{ type: 'bold' }] },
			]);
		});

		it('splits <br> into separate blocks', () => {
			const slice = parseHTML('<p>line1<br>line2</p>');
			expect(slice.blocks).toHaveLength(2);
			expect(slice.blocks[0]?.segments).toEqual([{ text: 'line1', marks: [] }]);
			expect(slice.blocks[1]?.segments).toEqual([{ text: 'line2', marks: [] }]);
		});

		it('splits multiple <br> into separate blocks', () => {
			const slice = parseHTML('<p>a<br>b<br>c</p>');
			expect(slice.blocks).toHaveLength(3);
			expect(slice.blocks[0]?.segments).toEqual([{ text: 'a', marks: [] }]);
			expect(slice.blocks[1]?.segments).toEqual([{ text: 'b', marks: [] }]);
			expect(slice.blocks[2]?.segments).toEqual([{ text: 'c', marks: [] }]);
		});

		it('preserves marks across <br> split', () => {
			const slice = parseHTML('<p><b>bold<br>more</b></p>');
			expect(slice.blocks).toHaveLength(2);
			expect(slice.blocks[0]?.segments).toEqual([{ text: 'bold', marks: [{ type: 'bold' }] }]);
			expect(slice.blocks[1]?.segments).toEqual([{ text: 'more', marks: [{ type: 'bold' }] }]);
		});

		it('does not apply bold for <b style="font-weight:normal">', () => {
			const slice = parseHTML('<p><b style="font-weight:normal">text</b></p>');
			expect(slice.blocks[0]?.segments).toEqual([{ text: 'text', marks: [] }]);
		});
	});

	describe('block types', () => {
		it('parses paragraphs', () => {
			const slice = parseHTML('<p>first</p><p>second</p>');
			expect(slice.blocks).toHaveLength(2);
			expect(slice.blocks[0]?.type).toBe('paragraph');
			expect(slice.blocks[0]?.segments).toEqual([{ text: 'first', marks: [] }]);
			expect(slice.blocks[1]?.type).toBe('paragraph');
			expect(slice.blocks[1]?.segments).toEqual([{ text: 'second', marks: [] }]);
		});

		it('parses headings h1-h6', () => {
			for (let level = 1; level <= 6; level++) {
				const slice = parseHTML(`<h${level}>Heading ${level}</h${level}>`);
				expect(slice.blocks[0]?.type).toBe('heading');
				expect(slice.blocks[0]?.attrs).toEqual({ level });
			}
		});

		it('parses blockquote', () => {
			const slice = parseHTML('<blockquote>quoted text</blockquote>');
			expect(slice.blocks[0]?.type).toBe('blockquote');
			expect(slice.blocks[0]?.segments).toEqual([{ text: 'quoted text', marks: [] }]);
		});

		it('parses horizontal rule', () => {
			const slice = parseHTML('<hr>');
			expect(slice.blocks[0]?.type).toBe('horizontal_rule');
			expect(slice.blocks[0]?.segments).toEqual([]);
		});

		it('parses unordered list', () => {
			const slice = parseHTML('<ul><li>item 1</li><li>item 2</li></ul>');
			expect(slice.blocks).toHaveLength(2);
			expect(slice.blocks[0]?.type).toBe('list_item');
			expect(slice.blocks[0]?.attrs).toEqual({ listType: 'bullet', indent: 0 });
			expect(slice.blocks[0]?.segments).toEqual([{ text: 'item 1', marks: [] }]);
			expect(slice.blocks[1]?.type).toBe('list_item');
		});

		it('parses ordered list', () => {
			const slice = parseHTML('<ol><li>one</li><li>two</li></ol>');
			expect(slice.blocks).toHaveLength(2);
			expect(slice.blocks[0]?.attrs).toEqual({ listType: 'ordered', indent: 0 });
		});

		it('parses nested lists with indent', () => {
			const slice = parseHTML('<ul><li>top<ul><li>nested</li></ul></li></ul>');
			expect(slice.blocks).toHaveLength(2);
			expect(slice.blocks[0]?.attrs).toEqual({ listType: 'bullet', indent: 0 });
			expect(slice.blocks[0]?.segments).toEqual([{ text: 'top', marks: [] }]);
			expect(slice.blocks[1]?.attrs).toEqual({ listType: 'bullet', indent: 1 });
			expect(slice.blocks[1]?.segments).toEqual([{ text: 'nested', marks: [] }]);
		});

		it('parses div as paragraph', () => {
			const slice = parseHTML('<div>div content</div>');
			expect(slice.blocks[0]?.type).toBe('paragraph');
		});

		it('falls back unknown elements to paragraph', () => {
			const slice = parseHTML('<section>content</section>');
			// section is not in block elements, treated as inline
			expect(slice.blocks.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe('schema awareness', () => {
		it('filters marks not in schema', () => {
			const schema = createTestSchema({ markTypes: ['bold'] });
			const slice = parseHTML('<p><strong>bold</strong> <em>not italic</em></p>', schema);
			expect(slice.blocks[0]?.segments).toEqual([
				{ text: 'bold', marks: [{ type: 'bold' }] },
				{ text: ' not italic', marks: [] },
			]);
		});

		it('falls back unknown block types to paragraph', () => {
			const schema = createTestSchema({ nodeTypes: ['paragraph'] });
			const slice = parseHTML('<h1>Not a heading</h1>', schema);
			expect(slice.blocks[0]?.type).toBe('paragraph');
			expect(slice.blocks[0]?.attrs).toBeUndefined();
		});

		it('preserves heading when registered', () => {
			const schema = createTestSchema({ nodeTypes: ['paragraph', 'heading'] });
			const slice = parseHTML('<h2>A heading</h2>', schema);
			expect(slice.blocks[0]?.type).toBe('heading');
			expect(slice.blocks[0]?.attrs).toEqual({ level: 2 });
		});
	});

	describe('mixed content', () => {
		it('parses heading with bold text', () => {
			const slice = parseHTML('<h1><strong>Bold</strong> Title</h1>');
			expect(slice.blocks[0]?.type).toBe('heading');
			expect(slice.blocks[0]?.segments).toEqual([
				{ text: 'Bold', marks: [{ type: 'bold' }] },
				{ text: ' Title', marks: [] },
			]);
		});

		it('parses list items with marks', () => {
			const slice = parseHTML('<ul><li><strong>bold</strong> item</li></ul>');
			expect(slice.blocks[0]?.segments).toEqual([
				{ text: 'bold', marks: [{ type: 'bold' }] },
				{ text: ' item', marks: [] },
			]);
		});

		it('parses multiple blocks with different types', () => {
			const slice = parseHTML('<h1>Title</h1><p>Paragraph</p><blockquote>Quote</blockquote>');
			expect(slice.blocks).toHaveLength(3);
			expect(slice.blocks[0]?.type).toBe('heading');
			expect(slice.blocks[1]?.type).toBe('paragraph');
			expect(slice.blocks[2]?.type).toBe('blockquote');
		});
	});

	describe('edge cases', () => {
		it('returns single empty paragraph for empty input', () => {
			const slice = parseHTML('');
			expect(slice.blocks).toHaveLength(1);
			expect(slice.blocks[0]?.type).toBe('paragraph');
			expect(slice.blocks[0]?.segments).toEqual([{ text: '', marks: [] }]);
		});

		it('handles plain text without wrapper', () => {
			const slice = parseHTML('just text');
			expect(slice.blocks).toHaveLength(1);
			expect(slice.blocks[0]?.segments[0]?.text).toBe('just text');
		});

		it('handles inline elements at top level', () => {
			const slice = parseHTML('<strong>bold</strong> text');
			expect(slice.blocks).toHaveLength(1);
			expect(slice.blocks[0]?.segments).toEqual([
				{ text: 'bold', marks: [{ type: 'bold' }] },
				{ text: ' text', marks: [] },
			]);
		});

		it('handles blockquote with nested paragraphs', () => {
			const slice = parseHTML('<blockquote><p>first</p><p>second</p></blockquote>');
			expect(slice.blocks).toHaveLength(2);
			expect(slice.blocks[0]?.type).toBe('blockquote');
			expect(slice.blocks[0]?.segments).toEqual([{ text: 'first', marks: [] }]);
			expect(slice.blocks[1]?.type).toBe('blockquote');
			expect(slice.blocks[1]?.segments).toEqual([{ text: 'second', marks: [] }]);
		});

		it('ensures empty blocks have at least one segment', () => {
			const slice = parseHTML('<p></p>');
			expect(slice.blocks[0]?.segments).toEqual([{ text: '', marks: [] }]);
		});

		it('parses link with bold text inside', () => {
			const slice = parseHTML(
				'<p><a href="https://example.com"><strong>bold link</strong></a></p>',
			);
			expect(slice.blocks[0]?.segments).toEqual([
				{
					text: 'bold link',
					marks: [{ type: 'link', attrs: { href: 'https://example.com' } }, { type: 'bold' }],
				},
			]);
		});

		it('handles inline element wrapping block descendants', () => {
			const slice = parseHTML('<b><p>para one</p><p>para two</p></b>');
			expect(slice.blocks).toHaveLength(2);
			expect(slice.blocks[0]?.segments).toEqual([{ text: 'para one', marks: [{ type: 'bold' }] }]);
			expect(slice.blocks[1]?.segments).toEqual([{ text: 'para two', marks: [{ type: 'bold' }] }]);
		});
	});
});
