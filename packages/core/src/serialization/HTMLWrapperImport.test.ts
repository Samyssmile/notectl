import { beforeAll, describe, expect, it } from 'vitest';
import { registerBuiltinSpecs } from '../editor/BuiltinSpecs.js';
import { PasteHTMLHandler } from '../input/PasteHTMLHandler.js';
import {
	type BlockNode,
	getBlockChildren,
	getBlockText,
	getInlineChildren,
} from '../model/Document.js';
import { schemaFromRegistry } from '../model/Schema.js';
import { SchemaRegistry } from '../model/SchemaRegistry.js';
import { AlignmentPlugin } from '../plugins/alignment/AlignmentPlugin.js';
import { BlockquotePlugin } from '../plugins/blockquote/BlockquotePlugin.js';
import { HeadingPlugin } from '../plugins/heading/HeadingPlugin.js';
import { LinkPlugin } from '../plugins/link/LinkPlugin.js';
import { ListPlugin } from '../plugins/list/ListPlugin.js';
import { TablePlugin } from '../plugins/table/TablePlugin.js';
import { TextDirectionPlugin } from '../plugins/text-direction/TextDirectionPlugin.js';
import { TextFormattingPlugin } from '../plugins/text-formatting/TextFormattingPlugin.js';
import { EditorState } from '../state/EditorState.js';
import { assertDefined, pluginHarness } from '../test/TestUtils.js';
import { parseHTMLToDocument } from './DocumentParser.js';
import { parseMarkdownToDocument } from './MarkdownParser.js';

/** Use the editor's actual specs, including plugin-owned marks and attributes. */
let registry: SchemaRegistry;
beforeAll(async () => {
	const h = await pluginHarness(
		[
			new HeadingPlugin(),
			new BlockquotePlugin(),
			new ListPlugin(),
			new TablePlugin(),
			new LinkPlugin(),
			new TextFormattingPlugin(),
			new AlignmentPlugin(),
			new TextDirectionPlugin(),
		],
		undefined,
		{ builtinSpecs: true },
	);
	registry = h.pm.schemaRegistry;
});

function outline(blocks: readonly BlockNode[]): string[] {
	return blocks.map((block) => `${block.type}:${getBlockText(block)}`);
}

function paste(html: string): ReturnType<typeof parseHTMLToDocument> {
	let state = EditorState.create({ schema: schemaFromRegistry(registry) });
	const handler = new PasteHTMLHandler(
		() => state,
		(tr) => {
			state = state.apply(tr);
		},
		registry,
		() => false,
	);
	expect(handler.pasteHTMLString(html)).toBe(true);
	return state.doc;
}

describe('nested HTML wrappers (#223)', () => {
	const nested = '<div><b style="font-weight:normal"><h1>Title</h1><p>a</p><p>b</p></b></div>';

	it.each([
		['HTML import', (html: string) => parseHTMLToDocument(html, registry)],
		['HTML paste', paste],
		['Markdown HTML block', (html: string) => parseMarkdownToDocument(html)],
	] as const)('preserves blocks behind intermediate wrappers in %s', (_name, parse) => {
		expect(outline(parse(nested).children)).toEqual([
			'heading:Title',
			'paragraph:a',
			'paragraph:b',
		]);
	});

	it('preserves a wrapped block sequence between direct blocks and inline runs', () => {
		const doc = parseHTMLToDocument(
			'<div>intro <b>bold</b><p>first</p><span><p>a</p><p></p><p>b</p></span>tail</div>',
			registry,
		);
		expect(outline(doc.children)).toEqual([
			'paragraph:intro bold',
			'paragraph:first',
			'paragraph:a',
			'paragraph:',
			'paragraph:b',
			'paragraph:tail',
		]);
	});

	it('pastes a table behind an intermediate span as a table with its cells', () => {
		const doc = paste('<div><span><table><tr><td>x</td><td>y</td></tr></table></span></div>');
		expect(doc.children.map((block) => block.type)).toEqual(['table']);
		const table = doc.children[0];
		assertDefined(table);
		const row = getBlockChildren(table)[0];
		assertDefined(row);
		expect(getBlockChildren(row).map((cell) => outline(getBlockChildren(cell)))).toEqual([
			['paragraph:x'],
			['paragraph:y'],
		]);
	});

	it('routes wrapped multi-paragraph list items through the document paste parser', () => {
		const doc = paste('<ul><li><div><span><p>a</p><p>b</p></span></div></li></ul>');
		expect(doc.children.map((block) => block.type)).toEqual(['list_item']);
		const item = doc.children[0];
		assertDefined(item);
		expect(outline(getBlockChildren(item))).toEqual(['paragraph:a', 'paragraph:b']);
	});

	it('treats a registered inline node as atomic even when its markup contains blocks', () => {
		const atomicRegistry = new SchemaRegistry();
		registerBuiltinSpecs(atomicRegistry);
		atomicRegistry.registerInlineNodeSpec({
			type: 'badge',
			toDOM: () => document.createElement('span'),
			parseHTML: [{ tag: 'span', getAttrs: (el) => ({ label: el.textContent ?? '' }) }],
		});
		const doc = parseHTMLToDocument('<span><p>layout</p></span>', atomicRegistry);
		const block = doc.children[0];
		assertDefined(block);
		expect(getInlineChildren(block)).toEqual([
			expect.objectContaining({ type: 'inline', inlineType: 'badge', attrs: { label: 'layout' } }),
		]);
	});
});

describe('formatting on transparent HTML wrappers (#223)', () => {
	it('preserves wrapper links on leading text, paragraphs and nested table cells', () => {
		const doc = parseHTMLToDocument(
			'<a href="/guide">intro<p>a</p><table><tr><td>b</td></tr></table></a>',
			registry,
		);
		expect(doc.children.map((block) => block.type)).toEqual(['paragraph', 'paragraph', 'table']);
		const paragraphs: BlockNode[] = [];
		const collect = (block: BlockNode): void => {
			if (block.type === 'paragraph') paragraphs.push(block);
			for (const child of getBlockChildren(block)) collect(child);
		};
		for (const block of doc.children) collect(block);
		expect(outline(paragraphs)).toEqual(['paragraph:intro', 'paragraph:a', 'paragraph:b']);
		for (const paragraph of paragraphs) {
			expect(getInlineChildren(paragraph).map((node) => node.marks)).toEqual([
				[{ type: 'link', attrs: { href: '/guide' } }],
			]);
		}
	});

	it('inherits wrapper marks without duplicating child marks or formatting following blocks', () => {
		const doc = parseHTMLToDocument(
			'<span style="font-weight:bold"><p><b>a</b></p><p><i>b</i></p></span><p>plain</p>',
			registry,
		);
		expect(outline(doc.children)).toEqual(['paragraph:a', 'paragraph:b', 'paragraph:plain']);
		expect(
			doc.children.map((block) =>
				getInlineChildren(block).map((node) => node.marks.map((mark) => mark.type)),
			),
		).toEqual([[['bold']], [['bold', 'italic']], [[]]]);
	});

	it('preserves wrapper links when HTML is imported through Markdown', () => {
		const doc = parseMarkdownToDocument('<div><a href="/guide"><p>a</p><p>b</p></a></div>');
		expect(outline(doc.children)).toEqual(['paragraph:a', 'paragraph:b']);
		for (const block of doc.children) {
			expect(getInlineChildren(block)[0]?.marks).toEqual([
				{ type: 'link', attrs: { href: '/guide' } },
			]);
		}
	});
});
