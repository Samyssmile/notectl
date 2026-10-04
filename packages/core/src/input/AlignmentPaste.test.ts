import { describe, expect, it } from 'vitest';
import type { BlockAlignment } from '../model/BlockAlignment.js';
import type { ContentSlice } from '../model/ContentSlice.js';
import { schemaFromRegistry } from '../model/Schema.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { StyleClassNames } from '../model/StyleClass.js';
import { AlignmentPlugin } from '../plugins/alignment/AlignmentPlugin.js';
import { HeadingPlugin } from '../plugins/heading/HeadingPlugin.js';
import { serializeDocumentToCSS } from '../serialization/DocumentSerializer.js';
import type { PluginHarnessResult } from '../test/TestUtils.js';
import { pluginHarness, stateBuilder } from '../test/TestUtils.js';
import { HTMLParser } from './HTMLParser.js';
import { PasteHTMLHandler } from './PasteHTMLHandler.js';

const STYLE_CLASSES: StyleClassNames<BlockAlignment> = {
	start: 'align-start',
	center: 'align-center',
	end: 'align-end',
	justify: 'align-justify',
};

async function harness(
	styleClasses?: StyleClassNames<BlockAlignment>,
): Promise<PluginHarnessResult> {
	return pluginHarness(
		[new HeadingPlugin(), new AlignmentPlugin({ styleClasses })],
		stateBuilder().paragraph('', 'p').cursor('p', 0).schema(['paragraph', 'heading'], []).build(),
		{ builtinSpecs: true, useMiddleware: true },
	);
}

function parse(html: string, registry: SchemaRegistry): ContentSlice {
	const parser = new HTMLParser({ schema: schemaFromRegistry(registry), schemaRegistry: registry });
	const template: HTMLTemplateElement = document.createElement('template');
	template.innerHTML = html;
	return parser.parse(template.content);
}

describe('alignment in HTML paste (#270)', () => {
	it('reads configured classes on headings and every paragraph split by a line break', async () => {
		const h: PluginHarnessResult = await harness(STYLE_CLASSES);

		const slice: ContentSlice = parse(
			'<h2 class="align-end">Title</h2><p class="align-center">One<br>Two</p>',
			h.pm.schemaRegistry,
		);

		expect(slice.blocks.map((block) => block.attrs)).toEqual([
			{ level: 2, align: 'end' },
			{ align: 'center' },
			{ align: 'center' },
		]);
	});

	it('inherits wrapper alignment while preserving child classes and inline styles', async () => {
		const h: PluginHarnessResult = await harness(STYLE_CLASSES);

		const slice: ContentSlice = parse(
			'<div class="align-center"><span><p>Inherited</p>' +
				'<p class="align-start">Own</p>' +
				'<h2 class="align-center" style="text-align: end">Styled</h2></span></div>',
			h.pm.schemaRegistry,
		);

		expect(slice.blocks.map((block) => block.attrs?.align)).toEqual(['center', 'start', 'end']);
	});

	it('recognizes default classes and legacy inline alignment without a custom mapping', async () => {
		const h: PluginHarnessResult = await harness();

		const slice: ContentSlice = parse(
			'<p class="notectl-align-center">Default</p><p style="text-align: right">Legacy</p>' +
				'<p class="align-end">Unknown</p>',
			h.pm.schemaRegistry,
		);

		expect(slice.blocks.map((block) => block.attrs?.align)).toEqual(['center', 'end', undefined]);
	});

	it('does not add alignment to a block whose spec does not declare it', async () => {
		const h: PluginHarnessResult = await pluginHarness(
			[
				new HeadingPlugin(),
				new AlignmentPlugin({ styleClasses: STYLE_CLASSES, alignableTypes: ['heading'] }),
			],
			undefined,
			{ builtinSpecs: true },
		);

		const slice: ContentSlice = parse(
			'<p class="align-center">Plain</p><h2 class="align-end">Aligned</h2>',
			h.pm.schemaRegistry,
		);

		expect(slice.blocks.map((block) => block.attrs?.align)).toEqual([undefined, 'end']);
	});

	it.each([
		'<p class="align-center">Single</p>',
		'<h2 class="align-end">Title</h2><p class="align-center">Last</p>',
		'<p class="align-center">First</p><p class="align-justify">Middle</p>' +
			'<p class="align-end">Last</p>',
	])('preserves the classes through the full paste/export pipeline: %s', async (html: string) => {
		const h: PluginHarnessResult = await harness(STYLE_CLASSES);
		const handler = new PasteHTMLHandler(h.getState, h.dispatch, h.pm.schemaRegistry, () => false);

		expect(handler.pasteHTMLString(html)).toBe(true);
		const result = serializeDocumentToCSS(h.getState().doc, h.pm.schemaRegistry, {
			includeBlockIds: false,
		});

		expect(result.html).toBe(html);
		expect(result.html).not.toContain('style=');
	});

	it('lets an explicitly pasted alignment override the destination through middleware', async () => {
		const state = stateBuilder()
			.paragraph('', 'p', { attrs: { align: 'center' } })
			.cursor('p', 0)
			.schema(['paragraph', 'heading'], [])
			.build();
		const h: PluginHarnessResult = await pluginHarness(
			[new HeadingPlugin(), new AlignmentPlugin({ styleClasses: STYLE_CLASSES })],
			state,
			{ builtinSpecs: true, useMiddleware: true },
		);
		const handler = new PasteHTMLHandler(h.getState, h.dispatch, h.pm.schemaRegistry, () => false);

		handler.pasteHTMLString('<h2 class="align-start">Start</h2>');

		expect(h.getState().doc.children[0]?.attrs).toEqual({ level: 2, align: 'start' });
	});
});
