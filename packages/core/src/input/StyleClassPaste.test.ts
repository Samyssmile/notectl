/**
 * Pasting HTML with application style classes (#269): both paste routes, the
 * slice parser and the document parser, read registered classes as the
 * declarations they stand for.
 */

import { describe, expect, it } from 'vitest';
import type { BlockNode, Mark } from '../model/Document.js';
import { getBlockChildren } from '../model/Document.js';
import type { StyleClass } from '../model/StyleClass.js';
import type { Plugin, PluginContext } from '../plugins/Plugin.js';
import { BlockquotePlugin } from '../plugins/blockquote/BlockquotePlugin.js';
import { TextColorPlugin } from '../plugins/text-color/TextColorPlugin.js';
import { serializeDocumentToCSS } from '../serialization/DocumentSerializer.js';
import { type PluginHarnessResult, pluginHarness, stateBuilder } from '../test/TestUtils.js';
import { PasteHTMLHandler } from './PasteHTMLHandler.js';

const TEXT_RED: StyleClass = { className: 'text-red', declaration: 'color: #e03131' };

function appStyleClasses(...styleClasses: readonly StyleClass[]): Plugin {
	return {
		id: 'app-style-classes',
		name: 'App style classes',
		init(context: PluginContext): void {
			for (const styleClass of styleClasses) context.registerStyleClass(styleClass);
		},
	};
}

async function harness(...styleClasses: readonly StyleClass[]): Promise<PluginHarnessResult> {
	return pluginHarness(
		[new TextColorPlugin(), new BlockquotePlugin(), appStyleClasses(...styleClasses)],
		stateBuilder()
			.paragraph('', 'p')
			.cursor('p', 0)
			.schema(['paragraph', 'blockquote'], ['textColor'])
			.build(),
		{ builtinSpecs: true },
	);
}

function paste(h: PluginHarnessResult, html: string): void {
	const handler = new PasteHTMLHandler(h.getState, h.dispatch, h.pm.schemaRegistry, () => false);
	expect(handler.pasteHTMLString(html)).toBe(true);
}

/** Marks of every text node in the document, depth first. */
function textMarks(blocks: readonly BlockNode[]): readonly (readonly Mark[])[] {
	return blocks.flatMap((block: BlockNode) => [
		...block.children.flatMap((child) => ('marks' in child && child.text ? [child.marks] : [])),
		...textMarks(getBlockChildren(block)),
	]);
}

describe('style classes in HTML paste', () => {
	it('reads a registered class when pasting into a paragraph', async () => {
		const h: PluginHarnessResult = await harness(TEXT_RED);

		paste(h, '<p>Hi <span class="text-red">red</span></p>');

		expect(textMarks(h.getState().doc.children)).toContainEqual([
			{ type: 'textColor', attrs: { color: '#e03131' } },
		]);
		expect(
			serializeDocumentToCSS(h.getState().doc, h.pm.schemaRegistry, { includeBlockIds: false })
				.html,
		).toBe('<p>Hi <span class="text-red">red</span></p>');
	});

	it('reads a registered class in content that needs the document parser', async () => {
		const h: PluginHarnessResult = await harness(TEXT_RED);

		paste(h, '<blockquote><p><span class="text-red">quoted</span></p></blockquote>');

		expect(textMarks(h.getState().doc.children)).toContainEqual([
			{ type: 'textColor', attrs: { color: '#e03131' } },
		]);
	});

	it('lets an inline style win over a class on paste', async () => {
		const h: PluginHarnessResult = await harness(TEXT_RED);

		paste(h, '<p><span class="text-red" style="color: blue">blue</span></p>');

		expect(textMarks(h.getState().doc.children)).toContainEqual([
			{ type: 'textColor', attrs: { color: 'blue' } },
		]);
	});

	it('ignores the classes in an editor without them', async () => {
		const h: PluginHarnessResult = await harness();

		paste(h, '<p><span class="text-red">plain</span></p>');

		expect(textMarks(h.getState().doc.children).flat()).toEqual([]);
	});
});
