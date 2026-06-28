import { describe, expect, it } from 'vitest';
import {
	type BlockNode,
	type Document,
	type InlineNode,
	type TextNode,
	getBlockChildren,
	getInlineChildren,
	isLeafBlock,
} from '../model/Document.js';
import { parseMarkdownToDocument } from './MarkdownParser.js';

/**
 * CommonMark + GFM conformance gate (D1, in-scope correctness).
 *
 * HONEST SCOPE: this is a **curated** fixture set covering notectl's supported
 * construct matrix, compared via a normalized structural AST (not byte-exact
 * HTML, and not the full ~650-example `spec.json`). notectl's parser is a
 * pragmatic, linear-time scanner, not a complete CommonMark implementation: it
 * does not implement lazy continuation, indented code blocks, or multi-block
 * list items (D9). Those examples are intentionally excluded from this set.
 *
 * The gate is a ratchet: every curated in-scope fixture must pass (100% of the
 * supported set). Add fixtures as coverage grows; never lower the bar.
 */

/** A compact structural rendering of a block, for normalized comparison. */
function renderBlock(block: BlockNode): string {
	const attrs: string = block.attrs ? renderAttrs(block.attrs) : '';
	if (isLeafBlock(block)) {
		return `${block.type}${attrs}{${renderInline(getInlineChildren(block))}}`;
	}
	return `${block.type}${attrs}[${getBlockChildren(block).map(renderBlock).join(',')}]`;
}

function renderAttrs(attrs: Record<string, unknown>): string {
	const keys: string[] = Object.keys(attrs).sort();
	if (keys.length === 0) return '';
	return `<${keys.map((k) => `${k}=${String(attrs[k])}`).join(',')}>`;
}

function renderInline(children: readonly (TextNode | InlineNode)[]): string {
	return children
		.map((child) => {
			if ('text' in child) {
				const marks: string = child.marks
					.map((m) => (m.attrs ? `${m.type}(${renderAttrs(m.attrs)})` : m.type))
					.sort()
					.join('+');
				return marks ? `${child.text}[${marks}]` : child.text;
			}
			return `<${child.inlineType}:${renderAttrs(child.attrs)}>`;
		})
		.join('');
}

function normalize(doc: Document): string {
	return doc.children.map(renderBlock).join('\n');
}

interface Fixture {
	readonly name: string;
	readonly md: string;
	readonly want: string;
}

const FIXTURES: readonly Fixture[] = [
	// Headings
	{ name: 'atx h1', md: '# Hi', want: 'heading<level=1>{Hi}' },
	{ name: 'atx h6', md: '###### Deep', want: 'heading<level=6>{Deep}' },
	{ name: 'atx trailing hashes', md: '## Mid ##', want: 'heading<level=2>{Mid}' },
	{ name: 'setext h1', md: 'Title\n===', want: 'heading<level=1>{Title}' },
	{ name: 'setext h2', md: 'Sub\n---', want: 'heading<level=2>{Sub}' },
	// Paragraphs + soft breaks
	{ name: 'paragraph', md: 'hello world', want: 'paragraph{hello world}' },
	{ name: 'soft break', md: 'a\nb', want: 'paragraph{a b}' },
	// Emphasis
	{ name: 'strong', md: '**x**', want: 'paragraph{x[bold]}' },
	{ name: 'emphasis', md: '*x*', want: 'paragraph{x[italic]}' },
	{ name: 'strong+em', md: '***x***', want: 'paragraph{x[bold+italic]}' },
	{ name: 'emphasis mid', md: 'a *b* c', want: 'paragraph{a b[italic] c}' },
	// Rule-of-three + openers_bottom bucketing: bold spans the whole run while a
	// nested single-delimiter emphasis applies in the middle. Char-only bucketing
	// of openers_bottom drops all of these.
	{
		name: 'bold around italic middle',
		md: '**a*b*c**',
		want: 'paragraph{a[bold]b[bold+italic]c[bold]}',
	},
	{
		name: 'italic around bold middle',
		md: '*a**b**c*',
		want: 'paragraph{a[italic]b[bold+italic]c[italic]}',
	},
	{ name: 'inline code', md: '`code`', want: 'paragraph{code[code]}' },
	{ name: 'gfm strike', md: '~~gone~~', want: 'paragraph{gone[strikethrough]}' },
	// Links + images
	{
		name: 'inline link',
		md: '[t](http://x.io)',
		want: 'paragraph{t[link(<href=http://x.io>)]}',
	},
	{
		name: 'link with title',
		md: '[t](http://x.io "T")',
		want: 'paragraph{t[link(<href=http://x.io,title=T>)]}',
	},
	{
		name: 'autolink',
		md: '<http://x.io>',
		want: 'paragraph{http://x.io[link(<href=http://x.io>)]}',
	},
	{
		name: 'inline image',
		md: 'a ![alt](p.png) b',
		want: 'paragraph{a <image_inline:<alt=alt,src=p.png>> b}',
	},
	// Lists
	{
		name: 'bullet list',
		md: '- a\n- b',
		want: 'list_item<checked=false,indent=0,listType=bullet>{a}\nlist_item<checked=false,indent=0,listType=bullet>{b}',
	},
	{
		name: 'ordered list',
		md: '1. a\n2. b',
		want: 'list_item<checked=false,indent=0,listType=ordered>{a}\nlist_item<checked=false,indent=0,listType=ordered>{b}',
	},
	{
		name: 'task list',
		md: '- [x] done',
		want: 'list_item<checked=true,indent=0,listType=checklist>{done}',
	},
	{
		name: 'nested list',
		md: '- a\n  - b',
		want: 'list_item<checked=false,indent=0,listType=bullet>{a}\nlist_item<checked=false,indent=1,listType=bullet>{b}',
	},
	// Blockquote
	{ name: 'blockquote', md: '> quote', want: 'blockquote[paragraph{quote}]' },
	{ name: 'nested blockquote', md: '> > deep', want: 'blockquote[blockquote[paragraph{deep}]]' },
	// Code block
	{ name: 'fenced code', md: '```js\nx()\n```', want: 'code_block<language=js>{x()}' },
	{ name: 'fenced no lang', md: '```\nx\n```', want: 'code_block<language=>{x}' },
	// Thematic break
	{ name: 'hr', md: '---', want: 'horizontal_rule{}' },
	// Escapes / entities
	{ name: 'escape', md: '\\*literal\\*', want: 'paragraph{*literal*}' },
	{ name: 'entity', md: 'a &amp; b', want: 'paragraph{a & b}' },
	// GFM table
	{
		name: 'gfm table',
		md: '| H |\n| --- |\n| c |',
		want: 'table[table_row[table_cell[paragraph{H}]],table_row[table_cell[paragraph{c}]]]',
	},
];

describe('Markdown conformance (curated in-scope set, ratcheted)', () => {
	for (const fx of FIXTURES) {
		it(`parses: ${fx.name}`, () => {
			expect(normalize(parseMarkdownToDocument(fx.md))).toBe(fx.want);
		});
	}

	it('the curated in-scope set passes at 100% (ratchet floor)', () => {
		let passed = 0;
		for (const fx of FIXTURES) {
			if (normalize(parseMarkdownToDocument(fx.md)) === fx.want) passed++;
		}
		// Ratchet: the supported set is 100%. Never lower this; only add fixtures.
		expect(passed).toBe(FIXTURES.length);
	});
});
