import type { Locator } from '@playwright/test';
import { type EditorPage, expect, test } from './fixtures/editor-page';

/**
 * Picker state after HTML import (#273). Browsers read imported values back in
 * their own spelling: `#e03131` as `rgb(224, 49, 49)`, and font families with
 * other quotes (Firefox) or none (Chromium). Import stores the plugin's own
 * spelling of a configured value, so the pickers mark it as selected and the
 * JSON of an HTML round trip stays stable. Runs in Chromium and Firefox.
 */

const TEXT_COLORS: readonly string[] = ['#e03131', '#1971c2'];
const HIGHLIGHTS: readonly string[] = ['#fff3bf', '#d3f9d8'];
const FONTS = [
	{ name: 'Georgia', family: 'Georgia, serif' },
	{ name: 'Inter', family: "'Inter', sans-serif" },
];

interface JsonMark {
	readonly type: string;
	readonly attrs?: Record<string, unknown>;
}

interface JsonNode {
	readonly text?: string;
	readonly marks?: readonly JsonMark[];
	readonly children?: readonly JsonNode[];
}

/** The marks of the first text node of the document, keyed by mark type. */
async function firstTextMarks(editor: EditorPage): Promise<Record<string, unknown>> {
	const doc: JsonNode = await editor.getJSON();
	let node: JsonNode | undefined = doc;
	while (node && node.text === undefined) node = node.children?.[0];
	return Object.fromEntries((node?.marks ?? []).map((m: JsonMark) => [m.type, m.attrs]));
}

/** Selects all content and opens the popup of the toolbar item `item`. */
async function openPicker(editor: EditorPage, item: string): Promise<void> {
	await editor.focus();
	await editor.page.keyboard.press('ControlOrMeta+a');
	await editor.markButton(item).click();
}

function selectedSwatches(editor: EditorPage): Locator {
	return editor.root.locator('.notectl-color-picker__swatch[aria-selected="true"]');
}

test.describe('Picker state after HTML import (#273)', () => {
	test.beforeEach(async ({ editor }) => {
		await editor.recreateWithPlugins({
			toolbar: [
				[
					{
						name: 'TextColorPlugin',
						config: { colors: TEXT_COLORS, styleClasses: { '#5f3dc4': 'text-brand' } },
					},
					{ name: 'HighlightPlugin', config: { colors: HIGHLIGHTS } },
					{ name: 'FontPlugin', config: { fonts: FONTS } },
				],
			],
		});
	});

	test('stores imported palette colors and fonts as configured', async ({ editor }) => {
		await editor.setContentHTML(
			'<p><span style="color: #e03131; background-color: #D3F9D8; ' +
				`font-family: 'Inter', sans-serif">Imported</span></p>`,
		);

		expect(await firstTextMarks(editor)).toEqual({
			textColor: { color: '#e03131' },
			highlight: { color: '#d3f9d8' },
			font: { family: "'Inter', sans-serif" },
		});
	});

	test('marks the imported text color as selected', async ({ editor }) => {
		await editor.setContentHTML('<p><span style="color: #1971c2">Imported</span></p>');

		await openPicker(editor, 'textColor');

		await expect(selectedSwatches(editor)).toHaveCount(1);
		await expect(selectedSwatches(editor)).toHaveAttribute('title', '#1971c2');
	});

	test('marks the imported highlight as selected', async ({ editor }) => {
		await editor.setContentHTML('<p><span style="background-color: #fff3bf">Imported</span></p>');

		await openPicker(editor, 'highlight');

		await expect(selectedSwatches(editor)).toHaveCount(1);
		await expect(selectedSwatches(editor)).toHaveAttribute('title', '#fff3bf');
	});

	test('marks an imported quoted font family as selected', async ({ editor }) => {
		await editor.setContentHTML(
			`<p><span style='font-family: "Inter", sans-serif'>Imported</span></p>`,
		);

		await openPicker(editor, 'font');

		const selected: Locator = editor.root.locator(
			'.notectl-font-picker__item[aria-selected="true"]',
		);
		await expect(selected).toHaveCount(1);
		await expect(selected).toContainText('Inter');
		await expect(editor.markButton('font')).toContainText('Inter');
	});

	test('selects no swatch for a color outside the palette', async ({ editor }) => {
		await editor.setContentHTML('<p><span style="color: #123456">Imported</span></p>');

		await openPicker(editor, 'textColor');

		await expect(editor.root.locator('.notectl-color-picker__swatch').first()).toBeVisible();
		await expect(selectedSwatches(editor)).toHaveCount(0);
		expect(await firstTextMarks(editor)).toEqual({ textColor: { color: 'rgb(18, 52, 86)' } });
	});

	test('stores the color of an application class as configured', async ({ editor }) => {
		await editor.setContentHTML('<p><span class="text-brand">Branded</span></p>');

		expect(await firstTextMarks(editor)).toEqual({ textColor: { color: '#5f3dc4' } });
	});

	test('keeps configured values unchanged through an HTML round trip', async ({ editor }) => {
		const marks: readonly JsonMark[] = [
			{ type: 'textColor', attrs: { color: '#e03131' } },
			{ type: 'highlight', attrs: { color: '#fff3bf' } },
			{ type: 'font', attrs: { family: "'Inter', sans-serif" } },
		];
		await editor.setJSON({
			children: [
				{ id: 'stable', type: 'paragraph', children: [{ type: 'text', text: 'Stable', marks }] },
			],
		});

		await editor.setContentHTML(await editor.getContentHTML());

		expect(await firstTextMarks(editor)).toEqual({
			textColor: { color: '#e03131' },
			highlight: { color: '#fff3bf' },
			font: { family: "'Inter', sans-serif" },
		});
	});
});
