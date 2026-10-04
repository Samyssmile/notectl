import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/editor-page';
import { openStrictCSPPage } from './fixtures/strict-csp-page';

/**
 * Inline styles under a strict CSP (#272). Chromium blocks `style` attributes
 * under `style-src-attr 'none'`, even in the parser's inert template, but keeps
 * their text; import and paste apply that text through the CSSOM, which a CSP
 * does not restrict. Firefox does not block styles in template content, so the
 * same expectations hold there without the fix.
 */

const START_EDITOR = `(async () => {
	const editor = await NotectlCore.createEditor({
		locale: 'en',
		toolbar: [[
			new NotectlCore.TextFormattingPlugin(),
			new NotectlCore.TextColorPlugin({ colors: ['#e03131', '#1971c2'] }),
			new NotectlCore.AlignmentPlugin(),
			new NotectlCore.TablePlugin(),
			new NotectlCore.BlockquotePlugin(),
		]],
	});
	document.body.appendChild(editor);
	window.notectlEditor = editor;
})();`;

interface JsonMark {
	readonly type: string;
	readonly attrs?: Record<string, unknown>;
}

interface JsonNode {
	readonly type?: string;
	readonly text?: string;
	readonly attrs?: Record<string, unknown>;
	readonly marks?: readonly JsonMark[];
	readonly children?: readonly JsonNode[];
}

/** The editor element as the page scripts see it. */
interface StrictCSPEditor extends HTMLElement {
	setContentHTML(html: string): Promise<void>;
	getContentHTML(): Promise<string>;
	getJSON(): JsonNode;
}

/** Opens the strict-CSP page with an editor; returns the CSP violations the page reports. */
async function openEditor(page: Page): Promise<string[]> {
	const violations: string[] = await openStrictCSPPage(page, START_EDITOR);
	await page.waitForFunction(() => 'notectlEditor' in window);
	return violations;
}

/** Imports `html` with `setContentHTML()` and returns the document JSON. */
async function importHTML(page: Page, html: string): Promise<JsonNode> {
	return page.evaluate(async (content: string) => {
		const editor = (window as unknown as { notectlEditor: StrictCSPEditor }).notectlEditor;
		await editor.setContentHTML(content);
		return editor.getJSON();
	}, html);
}

/** Pastes `html` the way the system clipboard delivers it and returns the document JSON. */
async function pasteHTML(page: Page, html: string): Promise<JsonNode> {
	return page.evaluate((content: string) => {
		const editor = (window as unknown as { notectlEditor: StrictCSPEditor }).notectlEditor;
		const data = new DataTransfer();
		data.setData('text/html', content);
		data.setData('text/plain', '');
		const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
		Object.defineProperty(paste, 'clipboardData', { value: data });
		editor.shadowRoot?.querySelector('.notectl-content')?.dispatchEvent(paste);
		return editor.getJSON();
	}, html);
}

/** All text nodes of a document JSON, in document order. */
function textNodes(node: JsonNode): JsonNode[] {
	if (node.text !== undefined) return [node];
	return (node.children ?? []).flatMap(textNodes);
}

/** The marks of the text node that holds exactly `text`. */
function marksOf(doc: JsonNode, text: string): readonly JsonMark[] {
	const node: JsonNode | undefined = textNodes(doc).find((n: JsonNode) => n.text === text);
	if (!node) throw new Error(`No text node "${text}" in ${JSON.stringify(doc)}`);
	return node.marks ?? [];
}

function swatches(page: Page): Locator {
	return page.locator('notectl-editor .notectl-color-picker__swatch');
}

test.describe('Inline styles under a strict CSP (#272)', () => {
	test('imports colors and alignment written as inline styles', async ({ page }) => {
		await openEditor(page);

		const doc: JsonNode = await importHTML(
			page,
			'<p style="text-align: center"><span style="color: #e03131">Inline</span></p>',
		);

		expect(doc.children?.[0]?.attrs?.align).toBe('center');
		expect(marksOf(doc, 'Inline')).toEqual([{ type: 'textColor', attrs: { color: '#e03131' } }]);
	});

	test('keeps inline formatting through an HTML round trip', async ({ page }) => {
		await openEditor(page);
		const imported: JsonNode = await importHTML(
			page,
			'<p style="text-align: end"><span style="color: #1971c2">Round</span> trip</p>',
		);

		const roundTripped: JsonNode = await page.evaluate(async () => {
			const editor = (window as unknown as { notectlEditor: StrictCSPEditor }).notectlEditor;
			await editor.setContentHTML(await editor.getContentHTML());
			return editor.getJSON();
		});

		expect(roundTripped).toEqual(imported);
		expect(marksOf(roundTripped, 'Round')).toEqual([
			{ type: 'textColor', attrs: { color: '#1971c2' } },
		]);
	});

	test('pastes colors written as inline styles', async ({ page }) => {
		await openEditor(page);

		const doc: JsonNode = await pasteHTML(
			page,
			'<p><span style="color: #1971c2">Pasted</span> text</p>',
		);

		expect(marksOf(doc, 'Pasted')).toEqual([{ type: 'textColor', attrs: { color: '#1971c2' } }]);
		expect(marksOf(doc, ' text')).toEqual([]);
	});

	test('pastes inline styles inside a quote, which the document parser reads', async ({ page }) => {
		await openEditor(page);

		const doc: JsonNode = await pasteHTML(
			page,
			'<blockquote><p style="text-align: center"><span style="color: #e03131">Quoted</span></p>' +
				'</blockquote>',
		);

		const quote: JsonNode | undefined = doc.children?.find(
			(block: JsonNode) => block.type === 'blockquote',
		);
		expect(quote?.children?.[0]?.attrs?.align).toBe('center');
		expect(marksOf(doc, 'Quoted')).toEqual([{ type: 'textColor', attrs: { color: '#e03131' } }]);
	});

	test('pastes the color of a legacy font element', async ({ page }) => {
		await openEditor(page);

		const doc: JsonNode = await pasteHTML(page, '<p><font color="#1971c2">Legacy</font> text</p>');

		expect(marksOf(doc, 'Legacy')).toEqual([{ type: 'textColor', attrs: { color: '#1971c2' } }]);
	});

	test('pastes Google Docs HTML with only its bold text bold', async ({ page }) => {
		await openEditor(page);

		const doc: JsonNode = await pasteHTML(
			page,
			'<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1f2e3d4c">' +
				'<p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">' +
				'<span style="font-size:11pt;font-weight:700;">Bold</span>' +
				'<span style="font-size:11pt;font-weight:400;"> plain</span></p></b>',
		);

		expect(marksOf(doc, 'Bold')).toEqual([{ type: 'bold' }]);
		expect(marksOf(doc, ' plain')).toEqual([]);
	});

	test('imports table border colors and column widths', async ({ page }) => {
		await openEditor(page);

		const doc: JsonNode = await importHTML(
			page,
			'<table style="border-collapse: collapse; --ntbl-bc: #e03131">' +
				'<colgroup><col style="width: 120px">' +
				'<col style="width: 80px"></colgroup><tr><td>a</td><td>b</td></tr></table>',
		);

		expect(doc.children?.[0]?.attrs).toMatchObject({
			borderColor: '#e03131',
			columnWidthsPx: [120, 80],
		});
	});

	test('reads comments in a style attribute as the browser does', async ({ page }) => {
		await openEditor(page);

		const doc: JsonNode = await importHTML(
			page,
			'<p><span style="/* brand */ color: #e03131">Commented</span></p>',
		);

		expect(marksOf(doc, 'Commented')).toEqual([{ type: 'textColor', attrs: { color: '#e03131' } }]);
	});

	test('keeps an important declaration over a later shorthand, as the browser does', async ({
		page,
	}) => {
		await openEditor(page);

		const doc: JsonNode = await pasteHTML(
			page,
			'<p><span style="font-weight: 700 !important; font: 400 16px serif">Bold</span> text</p>',
		);

		expect(marksOf(doc, 'Bold')).toEqual([{ type: 'bold' }]);
	});

	test('imports and pastes an element with thousands of declarations without freezing (#274)', async ({
		page,
	}) => {
		await openEditor(page);
		const flood: string = Array.from({ length: 40_000 }, (_, i: number) => `--x${i}: 1`).join('; ');
		const html: string = `<p><span style="${flood}">Flood</span> <span style="color: #e03131">Red</span></p>`;

		const started: number = Date.now();
		const imported: JsonNode = await importHTML(page, html);
		await pasteHTML(page, html);
		const elapsedMs: number = Date.now() - started;

		expect(marksOf(imported, 'Red')).toEqual([{ type: 'textColor', attrs: { color: '#e03131' } }]);
		expect(elapsedMs).toBeLessThan(2_000);
	});

	test('marks an imported palette color as selected in the picker (#273)', async ({ page }) => {
		await openEditor(page);
		await importHTML(page, '<p><span style="color: #1971c2">Picked</span></p>');

		await page.locator('notectl-editor .notectl-content').click();
		await page.keyboard.press('ControlOrMeta+a');
		await page.locator('notectl-editor button[data-toolbar-item="textColor"]').click();

		await expect(swatches(page).first()).toBeVisible();
		await expect(swatches(page).and(page.locator('[aria-selected="true"]'))).toHaveAttribute(
			'title',
			'#1971c2',
		);
	});
});
