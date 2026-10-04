/**
 * Class-based HTML export of every style-producing plugin, exercised with the
 * real plugin schema. The baseline pins today's generated class names and
 * inline styles so application style classes (#269) cannot change the output
 * of editors that configure none.
 */

import { describe, expect, it } from 'vitest';
import {
	type BlockNode,
	type Document,
	type Mark,
	createBlockNode,
	createDocument,
	createTextNode,
} from '../../model/Document.js';
import type { SchemaRegistry } from '../../model/SchemaRegistry.js';
import { blockId, markType, nodeType } from '../../model/TypeBrands.js';
import type { ContentCSSResult } from '../../serialization/ContentHTMLTypes.js';
import { parseHTMLToDocument } from '../../serialization/DocumentParser.js';
import {
	serializeDocumentToCSS,
	serializeDocumentToHTML,
} from '../../serialization/DocumentSerializer.js';
import { pluginHarness } from '../../test/TestUtils.js';
import { AlignmentPlugin } from '../alignment/AlignmentPlugin.js';
import { CodeBlockPlugin } from '../code-block/CodeBlockPlugin.js';
import { FontSizePlugin } from '../font-size/FontSizePlugin.js';
import { FontPlugin } from '../font/FontPlugin.js';
import { HighlightPlugin } from '../highlight/HighlightPlugin.js';
import { TablePlugin } from '../table/TablePlugin.js';
import { TextColorPlugin } from '../text-color/TextColorPlugin.js';
import { TextFormattingPlugin } from '../text-formatting/TextFormattingPlugin.js';

const NO_IDS = { includeBlockIds: false } as const;

const FIRA_CODE_FAMILY = "'Fira Code', monospace";

// --- Helpers ---

async function createRegistry(): Promise<SchemaRegistry> {
	const plugins = [
		new TextFormattingPlugin(),
		new TextColorPlugin(),
		new HighlightPlugin(),
		new FontSizePlugin(),
		new FontPlugin({ fonts: [{ name: 'Fira Code', family: FIRA_CODE_FAMILY }] }),
		new AlignmentPlugin(),
		new TablePlugin(),
		new CodeBlockPlugin(),
	];
	const h = await pluginHarness(plugins, undefined, { builtinSpecs: true });
	return h.pm.schemaRegistry;
}

function mark(type: string, attrs?: Record<string, string>): Mark {
	return attrs ? { type: markType(type), attrs } : { type: markType(type) };
}

function paragraph(
	id: string,
	text: string,
	marks: readonly Mark[] = [],
	align?: string,
): BlockNode {
	return createBlockNode(
		nodeType('paragraph'),
		[createTextNode(text, marks)],
		blockId(id),
		align ? { align } : undefined,
	);
}

function oneCellTable(): BlockNode {
	const cell: BlockNode = createBlockNode(
		nodeType('table_cell'),
		[paragraph('tp', 'cell')],
		blockId('tc'),
	);
	const row: BlockNode = createBlockNode(nodeType('table_row'), [cell], blockId('tr'));
	return createBlockNode(nodeType('table'), [row], blockId('t'));
}

function codeBlock(backgroundColor: string): BlockNode {
	return createBlockNode(nodeType('code_block'), [createTextNode('let x;')], blockId('cb'), {
		language: '',
		backgroundColor,
	});
}

/** One block per style source: merged marks, each style mark alone, alignment. */
function styledDocument(): Document {
	return createDocument([
		paragraph('p1', 'Merged', [
			mark('bold'),
			mark('textColor', { color: '#e03131' }),
			mark('fontSize', { size: '18px' }),
		]),
		paragraph('p2', 'Color', [mark('textColor', { color: '#e03131' })]),
		paragraph('p3', 'Size', [mark('fontSize', { size: '18px' })]),
		paragraph('p4', 'Highlight', [mark('highlight', { color: '#fff176' })]),
		paragraph('p5', 'Font', [mark('font', { family: FIRA_CODE_FAMILY })]),
		paragraph('p6', 'Centered', [], 'center'),
	]);
}

// --- Tests ---

describe('style export without application style classes', () => {
	it('keeps the generated class names of class-based export', async () => {
		const registry: SchemaRegistry = await createRegistry();

		const result: ContentCSSResult = serializeDocumentToCSS(styledDocument(), registry, NO_IDS);

		expect(result.html).toBe(
			[
				'<p><strong><span class="notectl-s-12b7a99">Merged</span></strong></p>',
				'<p><span class="notectl-s-pgq4em">Color</span></p>',
				'<p><span class="notectl-s-8ly2md">Size</span></p>',
				'<p><span class="notectl-s-11fb9s6">Highlight</span></p>',
				'<p><span class="notectl-s-15xxq5z">Font</span></p>',
				'<p class="notectl-align-center">Centered</p>',
			].join(''),
		);
		expect([...result.styleMap]).toEqual([
			['notectl-s-12b7a99', 'color: #e03131; font-size: 18px'],
			['notectl-s-pgq4em', 'color: #e03131'],
			['notectl-s-8ly2md', 'font-size: 18px'],
			['notectl-s-11fb9s6', 'background-color: #fff176'],
			['notectl-s-15xxq5z', `font-family: ${FIRA_CODE_FAMILY}`],
			['notectl-align-center', 'text-align: center'],
		]);
		expect(result.css).toBe(
			[...result.styleMap]
				.map(([name, declarations]) => `.${name} { ${declarations}; }`)
				.join('\n'),
		);
	});

	it('keeps the generated class names of table cells and code block backgrounds', async () => {
		const registry: SchemaRegistry = await createRegistry();
		const doc: Document = createDocument([oneCellTable(), codeBlock('#1e1e1e')]);

		const { html, styleMap }: ContentCSSResult = serializeDocumentToCSS(doc, registry, NO_IDS);

		expect(html).toContain('<td class="notectl-s-fqll0d">');
		expect(html).toContain('<pre dir="ltr" class="notectl-s-1q92kbc">');
		expect(styleMap.get('notectl-s-fqll0d')).toBe(
			'border: 1px solid var(--ntbl-bc, #d0d0d0); padding: 8px 12px; vertical-align: top',
		);
		expect(styleMap.get('notectl-s-1q92kbc')).toBe('background-color: #1e1e1e');
	});

	it('keeps the inline styles of inline export', async () => {
		const registry: SchemaRegistry = await createRegistry();

		const html: string = serializeDocumentToHTML(styledDocument(), registry, NO_IDS);

		expect(html).toBe(
			[
				'<p><strong><span style="font-size: 18px; color: #e03131">Merged</span></strong></p>',
				'<p><span style="color: #e03131">Color</span></p>',
				'<p><span style="font-size: 18px">Size</span></p>',
				'<p><span style="background-color: #fff176">Highlight</span></p>',
				`<p><span style="font-family: ${FIRA_CODE_FAMILY}">Font</span></p>`,
				'<p style="text-align: center">Centered</p>',
			].join(''),
		);
	});
});

describe('style export of values with double quotes', () => {
	const QUOTED_FAMILY = '"Inter", sans-serif';

	it('writes raw CSS into the css and styleMap of class-based export', async () => {
		const registry: SchemaRegistry = await createRegistry();
		const doc: Document = createDocument([
			paragraph('p', 'Inter', [mark('font', { family: QUOTED_FAMILY })]),
		]);

		const { css, styleMap }: ContentCSSResult = serializeDocumentToCSS(doc, registry, NO_IDS);

		expect([...styleMap.values()]).toEqual([`font-family: ${QUOTED_FAMILY}`]);
		expect(css).toContain(`{ font-family: ${QUOTED_FAMILY}; }`);
	});

	it('restores the font from class-based HTML through its styleMap', async () => {
		const registry: SchemaRegistry = await createRegistry();
		const doc: Document = createDocument([
			paragraph('p', 'Inter', [mark('font', { family: QUOTED_FAMILY })]),
		]);
		const { html, styleMap }: ContentCSSResult = serializeDocumentToCSS(doc, registry, NO_IDS);

		const imported: Document = parseHTMLToDocument(html, registry, { styleMap });

		const text = imported.children[0]?.children[0];
		expect(text && 'marks' in text ? text.marks : []).toEqual([
			{ type: 'font', attrs: { family: expect.stringMatching(/^'?Inter'?, sans-serif$/) } },
		]);
	});

	it('escapes the quotes only in the style attribute of inline export', async () => {
		const registry: SchemaRegistry = await createRegistry();
		const doc: Document = createDocument([
			paragraph('p', 'Inter', [mark('font', { family: QUOTED_FAMILY })]),
		]);

		const html: string = serializeDocumentToHTML(doc, registry, NO_IDS);

		expect(html).toBe(
			'<p><span style="font-family: &quot;Inter&quot;, sans-serif">Inter</span></p>',
		);
	});
});
