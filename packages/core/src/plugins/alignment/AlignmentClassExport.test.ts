/**
 * HTML export and import of block alignment with application-defined CSS
 * classes (#270), exercised with the real plugin schema.
 */

import { afterEach, describe, expect, it } from 'vitest';
import '../../register.js';
import { NotectlEditor } from '../../editor/NotectlEditor.js';
import { Locale } from '../../i18n/Locale.js';
import type { BlockAlignment } from '../../model/BlockAlignment.js';
import {
	type BlockNode,
	type Document,
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockChildren,
} from '../../model/Document.js';
import type { SchemaRegistry } from '../../model/SchemaRegistry.js';
import type { StyleClassNames } from '../../model/StyleClass.js';
import { blockId, nodeType } from '../../model/TypeBrands.js';
import type { ContentCSSResult } from '../../serialization/ContentHTMLTypes.js';
import { parseHTMLToDocument } from '../../serialization/DocumentParser.js';
import {
	serializeDocumentToCSS,
	serializeDocumentToHTML,
} from '../../serialization/DocumentSerializer.js';
import { assertDefined, pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { HeadingPlugin } from '../heading/HeadingPlugin.js';
import { ImagePlugin } from '../image/ImagePlugin.js';
import { ListPlugin } from '../list/ListPlugin.js';
import { TablePlugin } from '../table/TablePlugin.js';
import { TextDirectionPlugin } from '../text-direction/TextDirectionPlugin.js';
import { VideoPlugin } from '../video/VideoPlugin.js';
import { AlignmentPlugin } from './AlignmentPlugin.js';

const STYLE_CLASSES: StyleClassNames<BlockAlignment> = {
	center: 'align-center',
	end: 'align-end',
	justify: 'align-justify',
};

const WITH_START: StyleClassNames<BlockAlignment> = { ...STYLE_CLASSES, start: 'align-start' };

const NO_IDS = { includeBlockIds: false } as const;

// --- Helpers ---

async function registryWith(
	styleClasses?: StyleClassNames<BlockAlignment>,
): Promise<SchemaRegistry> {
	const plugins = [
		new HeadingPlugin(),
		new ImagePlugin(),
		new TablePlugin(),
		new ListPlugin(),
		new TextDirectionPlugin(),
		new VideoPlugin(),
		new AlignmentPlugin({ styleClasses }),
	];
	const h = await pluginHarness(plugins, undefined, { builtinSpecs: true });
	return h.pm.schemaRegistry;
}

function paragraph(id: string, text: string, align?: string): BlockNode {
	return createBlockNode(
		nodeType('paragraph'),
		[createTextNode(text)],
		blockId(id),
		align ? { align } : undefined,
	);
}

function heading(id: string, text: string, align?: string): BlockNode {
	return createBlockNode(nodeType('heading'), [createTextNode(text)], blockId(id), {
		level: 2,
		...(align ? { align } : {}),
	});
}

function image(id: string, align?: string): BlockNode {
	return createBlockNode(nodeType('image'), [], blockId(id), {
		src: 'photo.png',
		alt: 'Photo',
		...(align ? { align } : {}),
	});
}

function video(id: string, align?: string): BlockNode {
	return createBlockNode(nodeType('video'), [], blockId(id), {
		provider: 'youtube',
		videoId: 'dQw4w9WgXcQ',
		...(align ? { align } : {}),
	});
}

/** A one-cell table; the cell holds `content` and is aligned when `cellAlign` is given. */
function table(
	cellAlign?: string,
	content: readonly BlockNode[] = [paragraph('tp', 'cell')],
): BlockNode {
	const cell: BlockNode = createBlockNode(
		nodeType('table_cell'),
		content,
		blockId('tc'),
		cellAlign ? { align: cellAlign } : undefined,
	);
	const row: BlockNode = createBlockNode(nodeType('table_row'), [cell], blockId('tr'));
	return createBlockNode(nodeType('table'), [row], blockId('t'));
}

function listItem(id: string, text: string): BlockNode {
	return createBlockNode(nodeType('list_item'), [createTextNode(text)], blockId(id), {
		listType: 'bullet',
		indent: 0,
		checked: false,
	});
}

function query(html: string, selector: string): Element {
	const template: HTMLTemplateElement = document.createElement('template');
	template.innerHTML = html;
	const el: Element | null = template.content.querySelector(selector);
	if (!el) throw new Error(`No ${selector} in ${html}`);
	return el;
}

function classesOf(html: string, selector: string): string[] {
	return Array.from(query(html, selector).classList);
}

/** Alignment per block, in document order, including blocks nested in containers. */
function alignments(doc: Document): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	const visit = (block: BlockNode): void => {
		result[block.type] ??= block.attrs?.align;
		for (const child of getBlockChildren(block)) visit(child);
	};
	for (const block of doc.children) visit(block);
	return result;
}

// --- Tests ---

describe('AlignmentPlugin styleClasses in HTML', () => {
	describe('class-based export', () => {
		it('writes the configured classes on paragraphs, headings, figures and table cells', async () => {
			const registry: SchemaRegistry = await registryWith(STYLE_CLASSES);
			const doc: Document = createDocument([
				paragraph('p', 'Centered', 'center'),
				heading('h', 'End', 'end'),
				image('i', 'end'),
				table('justify'),
			]);

			const { html } = serializeDocumentToCSS(doc, registry, NO_IDS);

			expect(classesOf(html, 'p')).toEqual(['align-center']);
			expect(classesOf(html, 'h2')).toEqual(['align-end']);
			expect(classesOf(html, 'figure')).toEqual(['align-end']);
			expect(classesOf(html, 'td')).toContain('align-justify');
			expect(html).not.toContain('style=');
			expect(html).not.toContain('notectl-align-');
		});

		it('returns css and a styleMap describing exactly the classes in html', async () => {
			const registry: SchemaRegistry = await registryWith(STYLE_CLASSES);
			const doc: Document = createDocument([
				paragraph('a', 'a', 'center'),
				paragraph('b', 'b', 'end'),
				paragraph('c', 'c', 'center'),
			]);

			const result: ContentCSSResult = serializeDocumentToCSS(doc, registry, NO_IDS);

			expect(result.html).toBe(
				'<p class="align-center">a</p><p class="align-end">b</p><p class="align-center">c</p>',
			);
			expect(result.css).toBe(
				'.align-center { text-align: center; }\n.align-end { text-align: end; }',
			);
			expect([...result.styleMap]).toEqual([
				['align-center', 'text-align: center'],
				['align-end', 'text-align: end'],
			]);
		});

		it('keeps notectl class names for alignments without a configured class', async () => {
			const registry: SchemaRegistry = await registryWith({ center: 'align-center' });
			const doc: Document = createDocument([paragraph('p', 'End', 'end')]);

			const result: ContentCSSResult = serializeDocumentToCSS(doc, registry, NO_IDS);

			expect(result.html).toBe('<p class="notectl-align-end">End</p>');
			expect(result.css).toBe('.notectl-align-end { text-align: end; }');
		});

		it('omits start alignment when start has no class', async () => {
			const registry: SchemaRegistry = await registryWith(STYLE_CLASSES);
			const doc: Document = createDocument([paragraph('a', 'a', 'start'), paragraph('b', 'b')]);

			const result: ContentCSSResult = serializeDocumentToCSS(doc, registry, NO_IDS);

			expect(result.html).toBe('<p>a</p><p>b</p>');
			expect(result.css).toBe('');
		});

		it('marks every top-level start-aligned alignable block once start has a class', async () => {
			const registry: SchemaRegistry = await registryWith(WITH_START);
			const doc: Document = createDocument([
				paragraph('a', 'explicit', 'start'),
				paragraph('b', 'implicit'),
				heading('h', 'implicit heading'),
				listItem('l', 'list items are not alignable'),
			]);

			const { html } = serializeDocumentToCSS(doc, registry, NO_IDS);

			expect(html).toBe(
				'<p class="align-start">explicit</p><p class="align-start">implicit</p>' +
					'<h2 class="align-start">implicit heading</h2>' +
					'<ul><li>list items are not alignable</li></ul>',
			);
		});

		it('lets implicit defaults inherit a table cell while explicit start overrides it', async () => {
			const registry: SchemaRegistry = await registryWith(WITH_START);
			const doc: Document = createDocument([
				table('center', [
					paragraph('a', 'unaligned'),
					paragraph('b', 'set back to start', 'start'),
					heading('h', 'heading'),
					paragraph('c', 'own alignment', 'end'),
					image('i', 'start'),
				]),
				paragraph('p', 'outside'),
			]);

			const { html } = serializeDocumentToCSS(doc, registry, NO_IDS);

			expect(classesOf(html, 'td')).toContain('align-center');
			expect(query(html, 'td').innerHTML).toBe(
				'<p>unaligned</p><p class="align-start">set back to start</p><h2>heading</h2>' +
					'<p class="align-end">own alignment</p>' +
					'<figure class="align-start"><img src="photo.png" alt="Photo"></figure>',
			);
			expect(classesOf(html, 'table + p')).toEqual(['align-start']);
		});

		it('gives an unaligned table cell the start class, which its blocks inherit', async () => {
			const registry: SchemaRegistry = await registryWith(WITH_START);
			const doc: Document = createDocument([table()]);

			const { html } = serializeDocumentToCSS(doc, registry, NO_IDS);

			expect(classesOf(html, 'td')).toContain('align-start');
			expect(query(html, 'td').innerHTML).toBe('<p>cell</p>');
		});

		it('writes the configured class on the figure of a video and reads it back', async () => {
			const registry: SchemaRegistry = await registryWith(STYLE_CLASSES);
			const doc: Document = createDocument([video('v', 'end')]);

			const { html } = serializeDocumentToCSS(doc, registry, NO_IDS);

			expect(classesOf(html, 'figure')).toEqual(['align-end']);
			expect(parseHTMLToDocument(html, registry).children[0]?.attrs?.align).toBe('end');
		});

		it('replaces the class when a block is set back to start', async () => {
			const state = stateBuilder()
				.paragraph('Centered', 'p', { attrs: { align: 'center' } })
				.cursor('p', 0)
				.schema(['paragraph'], [])
				.build();
			const h = await pluginHarness(new AlignmentPlugin({ styleClasses: WITH_START }), state, {
				builtinSpecs: true,
			});

			h.executeCommand('alignStart');
			const { html, css } = serializeDocumentToCSS(h.getState().doc, h.pm.schemaRegistry, NO_IDS);

			expect(html).toBe('<p class="align-start">Centered</p>');
			expect(css).toBe('.align-start { text-align: start; }');
		});

		it('leaves the default inline-style export unchanged', async () => {
			const registry: SchemaRegistry = await registryWith(STYLE_CLASSES);
			const doc: Document = createDocument([paragraph('p', 'Centered', 'center')]);

			const html: string = serializeDocumentToHTML(doc, registry, NO_IDS);

			expect(html).toBe('<p style="text-align: center">Centered</p>');
		});
	});

	describe('import', () => {
		it('reads the configured classes without a styleMap', async () => {
			const registry: SchemaRegistry = await registryWith(STYLE_CLASSES);
			const html: string =
				'<p class="align-center">a</p><h2 class="align-end">b</h2>' +
				'<figure class="align-end"><img src="photo.png" alt=""></figure>' +
				'<table><tr><td class="align-justify"><p>c</p></td></tr></table>';

			const doc: Document = parseHTMLToDocument(html, registry);

			expect(alignments(doc)).toEqual({
				paragraph: 'center',
				heading: 'end',
				image: 'end',
				table: undefined,
				table_row: undefined,
				table_cell: 'justify',
			});
		});

		it('passes ancestor wrapper classes on to the wrapped blocks', async () => {
			const registry: SchemaRegistry = await registryWith(STYLE_CLASSES);

			const doc: Document = parseHTMLToDocument(
				'<div class="align-center"><p>a</p><h2>b</h2></div>',
				registry,
			);

			expect(doc.children.map((block) => block.attrs?.align)).toEqual(['center', 'center']);
		});

		it('reads a class on a bare image, where other editors put it', async () => {
			const registry: SchemaRegistry = await registryWith(STYLE_CLASSES);

			const doc: Document = parseHTMLToDocument(
				'<img class="align-end" src="photo.png" alt="">',
				registry,
			);

			expect(alignments(doc)).toEqual({ image: 'end' });
		});

		it('keeps an image inside a paragraph inline, so its class aligns nothing', async () => {
			const registry: SchemaRegistry = await registryWith(STYLE_CLASSES);

			const doc: Document = parseHTMLToDocument(
				'<p><img class="align-end" src="photo.png" alt=""></p>',
				registry,
			);

			expect(alignments(doc)).toEqual({ paragraph: undefined });
		});

		it('ignores the configured classes in an editor without them', async () => {
			const registry: SchemaRegistry = await registryWith();

			const doc: Document = parseHTMLToDocument('<p class="align-center">a</p>', registry);

			expect(doc.children[0]?.attrs?.align).toBeUndefined();
		});

		it('reads existing notectl classes and re-exports them with the configured names', async () => {
			const registry: SchemaRegistry = await registryWith(STYLE_CLASSES);

			const doc: Document = parseHTMLToDocument('<p class="notectl-align-center">a</p>', registry);
			const { html } = serializeDocumentToCSS(doc, registry, NO_IDS);

			expect(html).toBe('<p class="align-center">a</p>');
		});

		it('keeps logical alignment and direction of right-to-left blocks', async () => {
			const registry: SchemaRegistry = await registryWith(WITH_START);
			const source: string =
				'<p class="align-start" dir="rtl">مرحبا</p><p class="align-end" dir="rtl">عالم</p>';

			const doc: Document = parseHTMLToDocument(source, registry);
			const { html } = serializeDocumentToCSS(doc, registry, NO_IDS);

			expect(doc.children.map((block) => [block.attrs?.align, block.attrs?.dir])).toEqual([
				['start', 'rtl'],
				['end', 'rtl'],
			]);
			expect(html).toBe(source);
		});
	});

	describe('round trip', () => {
		it.each([WITH_START, undefined])(
			'preserves explicit start and implicit inheritance inside an aligned cell (%j)',
			async (styleClasses: StyleClassNames<BlockAlignment> | undefined) => {
				const registry: SchemaRegistry = await registryWith(styleClasses);
				const doc: Document = createDocument([
					table('center', [paragraph('a', 'inherited'), paragraph('b', 'explicit', 'start')]),
				]);

				const inline: string = serializeDocumentToHTML(doc, registry);
				const classes: ContentCSSResult = serializeDocumentToCSS(doc, registry);

				for (const html of [inline, classes.html]) {
					const imported: Document = parseHTMLToDocument(html, registry);
					const tableBlock: BlockNode | undefined = imported.children[0];
					assertDefined(tableBlock);
					const row: BlockNode | undefined = getBlockChildren(tableBlock)[0];
					assertDefined(row);
					const cell: BlockNode | undefined = getBlockChildren(row)[0];
					assertDefined(cell);
					expect(getBlockChildren(cell).map((block) => block.attrs?.align)).toEqual([
						undefined,
						'start',
					]);
				}
			},
		);

		it('reproduces the class-based HTML through import and export', async () => {
			const registry: SchemaRegistry = await registryWith(WITH_START);
			const doc: Document = createDocument([
				paragraph('p', 'Centered', 'center'),
				heading('h', 'Start'),
				image('i', 'start'),
				table('end'),
			]);
			const first: ContentCSSResult = serializeDocumentToCSS(doc, registry);

			const imported: Document = parseHTMLToDocument(first.html, registry);
			const second: ContentCSSResult = serializeDocumentToCSS(imported, registry);

			expect(second).toEqual(first);
		});

		it('imports class-based HTML into an editor without the classes through its styleMap', async () => {
			const exporting: SchemaRegistry = await registryWith(STYLE_CLASSES);
			const importing: SchemaRegistry = await registryWith();
			const doc: Document = createDocument([
				paragraph('p', 'Centered', 'center'),
				image('i', 'end'),
			]);
			const { html, styleMap } = serializeDocumentToCSS(doc, exporting);

			const imported: Document = parseHTMLToDocument(html, importing, { styleMap });

			expect(imported.children.map((block) => block.attrs?.align)).toEqual(['center', 'end']);
		});
	});

	describe('without configured classes', () => {
		it('keeps a start-aligned image start-aligned in both export modes', async () => {
			const registry: SchemaRegistry = await registryWith();
			const doc: Document = createDocument([image('i', 'start')]);

			const inline: string = serializeDocumentToHTML(doc, registry, NO_IDS);
			const classes: ContentCSSResult = serializeDocumentToCSS(doc, registry, NO_IDS);

			expect(query(inline, 'figure').getAttribute('style')).toBe('text-align: start');
			expect(classesOf(classes.html, 'figure')).toEqual(['notectl-align-start']);
			expect(parseHTMLToDocument(inline, registry).children[0]?.attrs?.align).toBe('start');
			expect(parseHTMLToDocument(classes.html, registry).children[0]?.attrs?.align).toBe('start');
		});

		it('keeps a start-aligned video start-aligned in both export modes', async () => {
			const registry: SchemaRegistry = await registryWith();
			const doc: Document = createDocument([video('v', 'start')]);

			const inline: string = serializeDocumentToHTML(doc, registry, NO_IDS);
			const classes: ContentCSSResult = serializeDocumentToCSS(doc, registry, NO_IDS);

			expect(parseHTMLToDocument(inline, registry).children[0]?.attrs?.align).toBe('start');
			expect(parseHTMLToDocument(classes.html, registry).children[0]?.attrs?.align).toBe('start');
		});

		it('exports an image without an align attribute centered, as the editor shows it', async () => {
			const registry: SchemaRegistry = await registryWith();
			const doc: Document = createDocument([image('i')]);

			const html: string = serializeDocumentToHTML(doc, registry, NO_IDS);

			expect(query(html, 'figure').getAttribute('style')).toBe('text-align: center');
		});

		it('restores table cell alignment on import in both export modes', async () => {
			const registry: SchemaRegistry = await registryWith();
			const doc: Document = createDocument([table('center')]);

			const inline: string = serializeDocumentToHTML(doc, registry);
			const classes: ContentCSSResult = serializeDocumentToCSS(doc, registry);

			expect(alignments(parseHTMLToDocument(inline, registry)).table_cell).toBe('center');
			const fromClasses: Document = parseHTMLToDocument(classes.html, registry, {
				styleMap: classes.styleMap,
			});
			expect(alignments(fromClasses).table_cell).toBe('center');
		});
	});

	describe('through the editor API', () => {
		afterEach(() => {
			document.body.innerHTML = '';
		});

		async function createEditor(
			styleClasses: StyleClassNames<BlockAlignment>,
		): Promise<NotectlEditor> {
			const editor = new NotectlEditor();
			document.body.appendChild(editor);
			await editor.init({
				locale: Locale.EN,
				plugins: [new HeadingPlugin(), new ImagePlugin(), new AlignmentPlugin({ styleClasses })],
			});
			await editor.whenReady();
			return editor;
		}

		it('round-trips class-based HTML without passing a styleMap', async () => {
			const editor: NotectlEditor = await createEditor(STYLE_CLASSES);
			const source: string =
				'<h2 class="align-center">Title</h2><p class="align-justify">Body</p>' +
				'<figure class="align-end"><img src="photo.png" alt="Photo"></figure>';

			await editor.setContentHTML(source);
			const result: ContentCSSResult = await editor.getContentHTML({
				cssMode: 'classes',
				includeBlockIds: false,
			});

			expect(editor.getJSON().children.map((block) => block.attrs?.align)).toEqual([
				'center',
				'justify',
				'end',
			]);
			expect(result.html).toBe(source);
			expect(result.css.split('\n')).toEqual([
				'.align-center { text-align: center; }',
				'.align-justify { text-align: justify; }',
				'.align-end { text-align: end; }',
			]);
		});

		it('keeps the alignment classes of each editor separate', async () => {
			const first: NotectlEditor = await createEditor({ center: 'first-center' });
			const second: NotectlEditor = await createEditor({ center: 'second-center' });
			const content = { children: [paragraph('p', 'Centered', 'center')] };
			first.setJSON(content);
			second.setJSON(content);

			const [a, b] = await Promise.all([
				first.getContentHTML({ cssMode: 'classes', includeBlockIds: false }),
				second.getContentHTML({ cssMode: 'classes', includeBlockIds: false }),
			]);

			expect([a.html, b.html]).toEqual([
				'<p class="first-center">Centered</p>',
				'<p class="second-center">Centered</p>',
			]);
		});
	});
});

describe('notectl alignment classes in an editor whose other plugins allow no classes (#275)', () => {
	it('round-trips class-based HTML without a styleMap', async () => {
		const h = await pluginHarness(new AlignmentPlugin(), undefined, { builtinSpecs: true });
		const registry: SchemaRegistry = h.pm.schemaRegistry;
		const doc: Document = createDocument([
			paragraph('p', 'Centered', 'center'),
			paragraph('q', 'End', 'end'),
		]);

		const { html } = serializeDocumentToCSS(doc, registry, NO_IDS);
		const imported: Document = parseHTMLToDocument(html, registry);

		expect(html).toContain('class="notectl-align-center"');
		expect(imported.children.map((block: BlockNode) => block.attrs?.align)).toEqual([
			'center',
			'end',
		]);
	});
});

describe('TinyMCE alignment classes on a standalone image', () => {
	const TINYMCE: StyleClassNames<BlockAlignment> = { center: 'align-center', end: 'align-right' };
	const LEFT_IMAGE: string = '<img class="align-left" src="https://example.com/a.png" alt="">';

	it('aligns the image to start when start has the left class', async () => {
		const registry: SchemaRegistry = await registryWith({ ...TINYMCE, start: 'align-left' });

		const doc: Document = parseHTMLToDocument(LEFT_IMAGE, registry);

		expect(doc.children[0]?.type).toBe('image');
		expect(doc.children[0]?.attrs?.align).toBe('start');
	});

	it('leaves the image centered, its default, when start has no class', async () => {
		const registry: SchemaRegistry = await registryWith(TINYMCE);

		const doc: Document = parseHTMLToDocument(LEFT_IMAGE, registry);
		const image: BlockNode | undefined = doc.children[0];

		expect(image?.type).toBe('image');
		expect(image?.attrs?.align ?? registry.getNodeSpec('image')?.attrs?.align?.default).toBe(
			'center',
		);
	});
});
