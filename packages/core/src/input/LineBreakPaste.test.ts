import { describe, expect, it } from 'vitest';
import type { BlockNode } from '../model/Document.js';
import {
	getBlockChildren,
	getBlockText,
	getInlineChildren,
	isInlineNode,
} from '../model/Document.js';
import { BlockquotePlugin } from '../plugins/blockquote/BlockquotePlugin.js';
import { CodeBlockPlugin } from '../plugins/code-block/CodeBlockPlugin.js';
import { HardBreakPlugin } from '../plugins/hard-break/HardBreakPlugin.js';
import { HeadingPlugin } from '../plugins/heading/HeadingPlugin.js';
import { InlineCodePlugin } from '../plugins/inline-code/InlineCodePlugin.js';
import { ListPlugin } from '../plugins/list/ListPlugin.js';
import { TextFormattingPlugin } from '../plugins/text-formatting/TextFormattingPlugin.js';
import { parseHTMLToDocument } from '../serialization/DocumentParser.js';
import { serializeDocumentToHTML } from '../serialization/DocumentSerializer.js';
import { type PluginHarnessResult, pluginHarness, stateBuilder } from '../test/TestUtils.js';
import { PasteHTMLHandler } from './PasteHTMLHandler.js';

async function harness(
	options: { code?: boolean; hardBreak?: boolean } = {},
): Promise<PluginHarnessResult> {
	return pluginHarness(
		[
			new HeadingPlugin(),
			new ListPlugin(),
			new BlockquotePlugin(),
			new TextFormattingPlugin(),
			new InlineCodePlugin(),
			...(options.code === false ? [] : [new CodeBlockPlugin()]),
			...(options.hardBreak === false ? [] : [new HardBreakPlugin()]),
		],
		stateBuilder()
			.paragraph('', 'p')
			.cursor('p', 0)
			.schema(['paragraph', 'heading', 'list_item', 'blockquote', 'code_block'], ['bold', 'code'])
			.build(),
		{ builtinSpecs: true },
	);
}

function paste(h: PluginHarnessResult, html: string): readonly BlockNode[] {
	const handler = new PasteHTMLHandler(h.getState, h.dispatch, h.pm.schemaRegistry, () => false);
	expect(handler.pasteHTMLString(html)).toBe(true);
	return h.getState().doc.children;
}

/** Check semantic HTML stability, including breaks, marks, block types and attributes. */
function roundTrip(h: PluginHarnessResult): string {
	const registry = h.pm.schemaRegistry;
	const html: string = serializeDocumentToHTML(h.getState().doc, registry, {
		includeBlockIds: false,
	});
	const imported = parseHTMLToDocument(html, registry);
	expect(serializeDocumentToHTML(imported, registry, { includeBlockIds: false })).toBe(html);
	return html;
}

describe('pasted line breaks survive HTML save/reload (#268)', () => {
	it.each([
		['heading', '<h2>a<br>b</h2>', 'heading'],
		['wrapped heading', '<div><h2>a<br>b</h2><p>c</p></div>', 'heading'],
		['list item', '<ul><li>a<br>b</li></ul>', 'list_item'],
		['ordered list item', '<ol><li>a<br>b</li></ol>', 'list_item'],
		['top-level inline run', 'a<strong><br>b</strong>', 'paragraph'],
		['inline wrapper around blocks', '<span>a<br>b<h2>c</h2></span>', 'paragraph'],
	])('preserves a break in a %s', async (_name, html, type) => {
		const h: PluginHarnessResult = await harness();
		const blocks: readonly BlockNode[] = paste(h, html);
		expect(blocks[0]?.type).toBe(type);
		expect(blocks[0]?.children).toEqual([
			expect.objectContaining({ type: 'text', text: 'a' }),
			expect.objectContaining({ type: 'inline', inlineType: 'hard_break' }),
			expect.objectContaining({ type: 'text', text: 'b' }),
		]);
		expect(roundTrip(h)).toContain('<br>');
	});

	it('keeps a top-level run consisting only of consecutive breaks', async () => {
		const h: PluginHarnessResult = await harness();
		const blocks: readonly BlockNode[] = paste(h, '<br><br>');
		expect(blocks[0]?.children.filter(isInlineNode)).toEqual([
			expect.objectContaining({ inlineType: 'hard_break' }),
			expect.objectContaining({ inlineType: 'hard_break' }),
		]);
		expect(roundTrip(h)).toBe('<p><br><br></p>');
	});

	it.each(['<h2><br></h2>', '<ul><li><br></li></ul>', '<br>'])(
		'treats a lone break as an empty placeholder, as HTML import does: %s',
		async (html) => {
			const h: PluginHarnessResult = await harness();
			const blocks: readonly BlockNode[] = paste(h, html);
			expect(blocks.map(getBlockText)).toEqual(['']);
			expect(blocks[0]?.children.filter(isInlineNode)).toHaveLength(0);
			roundTrip(h);
		},
	);

	it('keeps preformatted blank lines without a code plugin', async () => {
		const h: PluginHarnessResult = await harness({ code: false });
		const blocks: readonly BlockNode[] = paste(h, '<pre><code>\n\n</code></pre>');
		expect(blocks.map(getBlockText)).toEqual(['', '', '']);
		expect(roundTrip(h)).toBe('<p><br></p><p><br></p><p><br></p>');
	});

	it('preserves leading, consecutive and trailing breaks with their surrounding marks', async () => {
		const h: PluginHarnessResult = await harness();
		const blocks: readonly BlockNode[] = paste(h, '<h3><strong><br>a<br><br>b<br></strong></h3>');
		expect(blocks[0]?.children).toEqual([
			expect.objectContaining({ inlineType: 'hard_break', marks: [{ type: 'bold' }] }),
			{ type: 'text', text: 'a', marks: [{ type: 'bold' }] },
			expect.objectContaining({ inlineType: 'hard_break', marks: [{ type: 'bold' }] }),
			expect.objectContaining({ inlineType: 'hard_break', marks: [{ type: 'bold' }] }),
			{ type: 'text', text: 'b', marks: [{ type: 'bold' }] },
			expect.objectContaining({ inlineType: 'hard_break', marks: [{ type: 'bold' }] }),
		]);
		expect(roundTrip(h).match(/<br>/g)).toHaveLength(4);
	});

	it('splits breaks without a hard-break plugin, retaining heading attributes and marks', async () => {
		const h: PluginHarnessResult = await harness({ hardBreak: false });
		const blocks: readonly BlockNode[] = paste(h, '<h3><strong>a<br><br>b</strong></h3>');
		expect(blocks.map((block) => block.type)).toEqual(['heading', 'heading', 'heading']);
		expect(blocks.map((block) => block.attrs?.level)).toEqual([3, 3, 3]);
		expect(blocks.map(getBlockText)).toEqual(['a', '', 'b']);
		expect(roundTrip(h)).toBe(
			'<h3><strong>a</strong></h3><h3><br></h3><h3><strong>b</strong></h3>',
		);
	});

	it.each(['<pre>CONTENT</pre>', '<div><pre>CONTENT</pre><p>after</p></div>'])(
		'imports preformatted text as a code block: %s',
		async (wrapper) => {
			const h: PluginHarnessResult = await harness();
			const code: string = '  const a = 1;\n\n\tconsole.log(a);\n';
			const blocks: readonly BlockNode[] = paste(h, wrapper.replace('CONTENT', code));
			expect(blocks[0]?.type).toBe('code_block');
			expect(blocks[0] && getBlockText(blocks[0])).toBe(code);
			expect(roundTrip(h)).toContain(`<code>${code}</code>`);
		},
	);

	it('preserves code language and br lines without importing syntax-highlighting marks', async () => {
		const h: PluginHarnessResult = await harness();
		const blocks: readonly BlockNode[] = paste(
			h,
			'<strong><div><pre><code class="language-js"><b>let</b> a = 1;<br>a++;</code></pre></div></strong>',
		);
		expect(blocks[0]?.type).toBe('code_block');
		expect(blocks[0]?.attrs?.language).toBe('js');
		expect(blocks[0]?.children).toEqual([{ type: 'text', text: 'let a = 1;\na++;', marks: [] }]);
		expect(roundTrip(h)).toContain('<code class="language-js">let a = 1;\na++;</code>');
	});

	it.each([true, false])(
		'falls back to separate pre lines without code (hardBreak=%s)',
		async (hardBreak) => {
			const h: PluginHarnessResult = await harness({ code: false, hardBreak });
			const blocks: readonly BlockNode[] = paste(h, '<div><pre>a\n\nb<br>c\n</pre></div>');
			expect(blocks.map((block) => block.type)).toEqual(Array(5).fill('paragraph'));
			expect(blocks.map(getBlockText)).toEqual(['a', '', 'b', 'c', '']);
			expect(roundTrip(h)).toBe('<p>a</p><p><br></p><p>b</p><p>c</p><p><br></p>');
		},
	);

	it.each([true, false])(
		'preserves pre lines through the container paste route (code=%s)',
		async (code) => {
			const h: PluginHarnessResult = await harness({ code });
			const roots: readonly BlockNode[] = paste(h, '<blockquote><pre>a\nb<br>c</pre></blockquote>');
			const quote: BlockNode | undefined = roots.find((block) => block.type === 'blockquote');
			expect(quote).toBeDefined();
			const blocks: readonly BlockNode[] = quote ? getBlockChildren(quote) : [];
			expect(blocks.map((block) => block.type)).toEqual(
				code ? ['code_block'] : Array(3).fill('paragraph'),
			);
			expect(blocks.map(getBlockText)).toEqual(code ? ['a\nb\nc'] : ['a', 'b', 'c']);
			if (code && blocks[0]) expect(getInlineChildren(blocks[0])).toHaveLength(1);
			roundTrip(h);
		},
	);

	it('preserves import identities when unsupported pre content becomes paragraphs', async () => {
		const h: PluginHarnessResult = await harness({ code: false });
		const registry = h.pm.schemaRegistry;
		const doc = parseHTMLToDocument(
			'<div><pre id="snippet" data-block-id="pre1">a\n\nb</pre></div>',
			registry,
		);
		expect(doc.children.map(getBlockText)).toEqual(['a', '', 'b']);
		expect(doc.children[0]?.id).toBe('pre1');
		expect(new Set(doc.children.map((block) => block.id)).size).toBe(3);
		expect(doc.children.map((block) => block.htmlId)).toEqual(['snippet', undefined, undefined]);
		const html: string = serializeDocumentToHTML(doc, registry);
		expect(parseHTMLToDocument(html, registry)).toEqual(doc);
	});
});
