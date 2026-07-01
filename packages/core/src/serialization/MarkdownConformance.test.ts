import { describe, expect, it } from 'vitest';
import { documentStructure } from '../test/MarkdownConformanceUtils.js';
import { parseMarkdownToDocument } from './MarkdownParser.js';

/**
 * CommonMark + GFM conformance gate (D1, in-scope correctness).
 *
 * SCOPE: this is a **curated** fixture set covering notectl's supported
 * construct matrix, compared via a normalized structural AST. The official
 * CommonMark `spec.json` gate lives in `MarkdownSpecConformance.test.ts`; this
 * set stays as a fast, readable construct matrix and carries the GFM extension
 * coverage (tables, strikethrough, task lists, autolinks) that the CommonMark
 * spec file does not contain. Known not-yet-supported constructs are
 * intentionally excluded: multi-block list items (D9, #194) and the deviations
 * pinned in the spec gate. Two-space hard breaks (#193), indented code blocks (#195),
 * and GFM bare-URL / www / email autolinks (#199) are covered. A link wrapping
 * an inline image (`[![alt](src)](url)`) keeps its link mark (#197). Emphasis
 * (bold/italic) composed with links or images is covered too (#198): the delimiter
 * run and the link scanner compose, with no duplicated text and no dropped mark.
 *
 * The gate is a ratchet: every curated in-scope fixture must pass (100% of the
 * supported set). Add fixtures as coverage grows; never lower the bar.
 */

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
	// --- Expanded coverage (50 added fixtures) ---
	// Headings (more levels, the no-space and leading-space rules)
	{ name: 'atx h3', md: '### H3', want: 'heading<level=3>{H3}' },
	{ name: 'atx h4', md: '#### H4', want: 'heading<level=4>{H4}' },
	{ name: 'atx no space is not a heading', md: '#notheading', want: 'paragraph{#notheading}' },
	{ name: 'atx up to 3 leading spaces', md: '   # Indented', want: 'heading<level=1>{Indented}' },
	{ name: 'setext h1 long rule', md: 'Title\n======', want: 'heading<level=1>{Title}' },
	{ name: 'atx 7 hashes is not a heading', md: '####### Seven', want: 'paragraph{####### Seven}' },
	// Emphasis (underscore forms, intraword rules, mixing)
	{ name: 'underscore strong', md: '__x__', want: 'paragraph{x[bold]}' },
	{ name: 'underscore emphasis', md: '_x_', want: 'paragraph{x[italic]}' },
	{
		name: 'emphasis then strong',
		md: '_em_ and **strong**',
		want: 'paragraph{em[italic] and strong[bold]}',
	},
	{ name: 'intraword underscore is literal', md: 'foo_bar_baz', want: 'paragraph{foo_bar_baz}' },
	{
		name: 'intraword asterisk emphasizes',
		md: 'foo*bar*baz',
		want: 'paragraph{foobar[italic]baz}',
	},
	{ name: 'strong in the middle', md: 'a **b** c', want: 'paragraph{a b[bold] c}' },
	// Code spans
	{ name: 'code span strips one space', md: '` x `', want: 'paragraph{x[code]}' },
	{ name: 'code span keeps asterisks literal', md: '`*not*`', want: 'paragraph{*not*[code]}' },
	{ name: 'double-backtick code span', md: '`` a`b ``', want: 'paragraph{a`b[code]}' },
	// Links (reference, collapsed, shortcut, titles, email autolink)
	{
		name: 'reference link',
		md: '[t][ref]\n\n[ref]: /url',
		want: 'paragraph{t[link(<href=/url>)]}',
	},
	{
		name: 'collapsed reference link',
		md: '[ref][]\n\n[ref]: /url',
		want: 'paragraph{ref[link(<href=/url>)]}',
	},
	{
		name: 'shortcut reference link',
		md: '[ref]\n\n[ref]: /url',
		want: 'paragraph{ref[link(<href=/url>)]}',
	},
	{
		name: 'reference link with title',
		md: '[t][r]\n\n[r]: /url "T"',
		want: 'paragraph{t[link(<href=/url,title=T>)]}',
	},
	{
		name: 'link with single-quoted title',
		md: "[t](/u 'T')",
		want: 'paragraph{t[link(<href=/u,title=T>)]}',
	},
	{
		name: 'email autolink',
		md: '<a@b.com>',
		want: 'paragraph{a@b.com[link(<href=mailto:a@b.com>)]}',
	},
	// Images (inline title, standalone block promotion)
	{
		name: 'inline image with title',
		md: 'a ![alt](p.png "T") b',
		want: 'paragraph{a <image_inline:<alt=alt,src=p.png,title=T>> b}',
	},
	{
		name: 'standalone image becomes a block',
		md: '![alt](p.png)',
		want: 'image<align=center,alt=alt,src=p.png>{}',
	},
	{
		name: 'standalone image with title becomes a block',
		md: '![alt](p.png "T")',
		want: 'image<align=center,alt=alt,src=p.png,title=T>{}',
	},
	{
		// A linked inline image keeps its link (#197): the image stays inline inside
		// a paragraph carrying a `link` mark, instead of being promoted to a block.
		name: 'linked inline image keeps its link',
		md: '[![alt](p.png)](/u)',
		want: 'paragraph{<image_inline:<alt=alt,src=p.png>>[link(<href=/u>)]}',
	},
	// Lists (marker variants, ordered paren, task, deeper nesting, mixed)
	{
		name: 'star bullet list',
		md: '* a\n* b',
		want: 'list_item<checked=false,indent=0,listType=bullet>{a}\nlist_item<checked=false,indent=0,listType=bullet>{b}',
	},
	{
		name: 'ordered list with paren',
		md: '1) a',
		want: 'list_item<checked=false,indent=0,listType=ordered>{a}',
	},
	{
		name: 'unchecked task item',
		md: '- [ ] todo',
		want: 'list_item<checked=false,indent=0,listType=checklist>{todo}',
	},
	{
		name: 'list nested three levels',
		md: '- a\n  - b\n    - c',
		want: 'list_item<checked=false,indent=0,listType=bullet>{a}\nlist_item<checked=false,indent=1,listType=bullet>{b}\nlist_item<checked=false,indent=2,listType=bullet>{c}',
	},
	{
		name: 'ordered nested under bullet',
		md: '- a\n  1. b',
		want: 'list_item<checked=false,indent=0,listType=bullet>{a}\nlist_item<checked=false,indent=1,listType=ordered>{b}',
	},
	// Blockquote (containing other blocks, deeper nesting)
	{ name: 'blockquote with heading', md: '> # H', want: 'blockquote[heading<level=1>{H}]' },
	{
		name: 'blockquote with bullet',
		md: '> - a',
		want: 'blockquote[list_item<checked=false,indent=0,listType=bullet>{a}]',
	},
	{
		name: 'blockquote nested three deep',
		md: '> > > deep',
		want: 'blockquote[blockquote[blockquote[paragraph{deep}]]]',
	},
	// Code blocks (tilde fences, info string, preserved blanks, literal markup)
	{ name: 'tilde fence', md: '~~~\nx\n~~~', want: 'code_block<language=>{x}' },
	{ name: 'tilde fence with language', md: '~~~py\nx\n~~~', want: 'code_block<language=py>{x}' },
	{
		name: 'fence info string keeps first word',
		md: '```js extra\nx\n```',
		want: 'code_block<language=js>{x}',
	},
	{
		name: 'fence keeps interior blank lines',
		md: '```\na\n\nb\n```',
		want: 'code_block<language=>{a\n\nb}',
	},
	{
		name: 'fence keeps markup literal',
		md: '```\n# not a heading\n```',
		want: 'code_block<language=>{# not a heading}',
	},
	// Thematic breaks (marker variants)
	{ name: 'thematic break stars', md: '***', want: 'horizontal_rule{}' },
	{ name: 'thematic break underscores', md: '___', want: 'horizontal_rule{}' },
	{ name: 'thematic break with spaces', md: '- - -', want: 'horizontal_rule{}' },
	// Escapes and entities
	{ name: 'escaped backtick', md: '\\`', want: 'paragraph{`}' },
	{ name: 'escaped brackets', md: '\\[not a link\\]', want: 'paragraph{[not a link]}' },
	{ name: 'numeric character reference', md: '&#35;', want: 'paragraph{#}' },
	// Hard breaks (backslash + two-trailing-spaces forms, #193)
	{ name: 'backslash hard break', md: 'a\\\nb', want: 'paragraph{a<hard_break:>b}' },
	{ name: 'two-space hard break', md: 'a  \nb', want: 'paragraph{a<hard_break:>b}' },
	{ name: 'single trailing space is a soft break', md: 'a \nb', want: 'paragraph{a b}' },
	// Indented code blocks (#195)
	{
		name: 'indented code block',
		md: '    code here',
		want: 'code_block<language=>{code here}',
	},
	{
		name: 'indented code keeps interior blank lines',
		md: '    a\n\n    b',
		want: 'code_block<language=>{a\n\nb}',
	},
	{
		name: 'indented line continues a paragraph (lazy continuation)',
		md: 'para\n    lazy',
		want: 'paragraph{para lazy}',
	},
	// GFM extended autolinks (#199)
	{
		name: 'bare http autolink',
		md: 'see http://commonmark.org now',
		want: 'paragraph{see http://commonmark.org[link(<href=http://commonmark.org>)] now}',
	},
	{
		name: 'www autolink gains an http scheme',
		md: 'at www.example.com end',
		want: 'paragraph{at www.example.com[link(<href=http://www.example.com>)] end}',
	},
	{
		name: 'autolink trims trailing punctuation',
		md: 'visit www.example.com.',
		want: 'paragraph{visit www.example.com[link(<href=http://www.example.com>)].}',
	},
	{
		name: 'bare email autolink',
		md: 'mail foo@bar.example now',
		want: 'paragraph{mail foo@bar.example[link(<href=mailto:foo@bar.example>)] now}',
	},
	// GFM tables (alignment, multi-column, inline formatting in cells)
	{
		name: 'gfm table with alignment',
		md: '| L | C | R |\n| :-- | :-: | --: |\n| a | b | c |',
		want: 'table[table_row[table_cell[paragraph<align=start>{L}],table_cell[paragraph<align=center>{C}],table_cell[paragraph<align=end>{R}]],table_row[table_cell[paragraph<align=start>{a}],table_cell[paragraph<align=center>{b}],table_cell[paragraph<align=end>{c}]]]',
	},
	{
		name: 'gfm table two columns',
		md: '| A | B |\n| --- | --- |\n| 1 | 2 |',
		want: 'table[table_row[table_cell[paragraph{A}],table_cell[paragraph{B}]],table_row[table_cell[paragraph{1}],table_cell[paragraph{2}]]]',
	},
	{
		name: 'gfm table cell with inline formatting',
		md: '| H |\n| --- |\n| **b** |',
		want: 'table[table_row[table_cell[paragraph{H}]],table_row[table_cell[paragraph{b[bold]}]]]',
	},
	// Strikethrough (nested emphasis, combined with strong)
	{
		name: 'strikethrough with emphasis inside',
		md: '~~a *b* c~~',
		want: 'paragraph{a [strikethrough]b[italic+strikethrough] c[strikethrough]}',
	},
	{
		name: 'strikethrough and strong',
		md: '~~a~~ and **b**',
		want: 'paragraph{a[strikethrough] and b[bold]}',
	},
	// Mixed inline
	{ name: 'code span inside link', md: '[`c`](/u)', want: 'paragraph{c[code+link(<href=/u>)]}' },
	// Emphasis composed with links/images (#198): the delimiter run and the link
	// scanner must compose, with no duplicated text and no dropped mark.
	{ name: 'link inside emphasis', md: '**[t](/u)**', want: 'paragraph{t[bold+link(<href=/u>)]}' },
	{ name: 'emphasis inside link', md: '[**t**](/u)', want: 'paragraph{t[bold+link(<href=/u>)]}' },
	{
		name: 'emphasis spanning a link',
		md: '*a [b](/u) c*',
		want: 'paragraph{a [italic]b[italic+link(<href=/u>)] c[italic]}',
	},
	{
		name: 'emphasis inside image alt collapses to plain alt',
		md: 'a ![**b**](p.png) c',
		want: 'paragraph{a <image_inline:<alt=b,src=p.png>> c}',
	},
];

describe('Markdown conformance (curated in-scope set, ratcheted)', () => {
	for (const fx of FIXTURES) {
		it(`parses: ${fx.name}`, () => {
			expect(documentStructure(parseMarkdownToDocument(fx.md))).toBe(fx.want);
		});
	}

	it('the curated in-scope set passes at 100% (ratchet floor)', () => {
		let passed = 0;
		for (const fx of FIXTURES) {
			if (documentStructure(parseMarkdownToDocument(fx.md)) === fx.want) passed++;
		}
		// Ratchet: the supported set is 100%. Never lower this; only add fixtures.
		expect(passed).toBe(FIXTURES.length);
	});
});
