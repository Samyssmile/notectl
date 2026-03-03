import { expect, test } from './fixtures/editor-page';

test.beforeEach(async ({ context }) => {
	try {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	} catch {
		// Best-effort: some browsers do not expose clipboard permissions via Playwright.
	}
});

type JsonChild = {
	type: string;
	children?: JsonChild[];
	attrs?: Record<string, unknown>;
	text?: string;
	marks?: { type: string }[];
};

test.describe('Cut and paste preserves block types', () => {
	test('cut & paste bullet list items preserves list type', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('Item A', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Item B', { delay: 10 });

		const beforeJson: { children: JsonChild[] } = await editor.getJSON();
		const listsBefore: JsonChild[] = beforeJson.children.filter((c) => c.type === 'list_item');
		expect(listsBefore.length).toBeGreaterThanOrEqual(2);

		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+x');
		await page.waitForTimeout(100);
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(200);

		const json: { children: JsonChild[] } = await editor.getJSON();
		const listItems: JsonChild[] = json.children.filter((c) => c.type === 'list_item');
		expect(listItems.length).toBeGreaterThanOrEqual(2);
		expect(listItems[0]?.attrs?.listType).toBe('bullet');
		expect(listItems[1]?.attrs?.listType).toBe('bullet');
	});

	test('cut & paste ordered list items preserves list type', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('1. ', { delay: 10 });
		await page.keyboard.type('First', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Second', { delay: 10 });

		const beforeJson: { children: JsonChild[] } = await editor.getJSON();
		const listsBefore: JsonChild[] = beforeJson.children.filter(
			(c) => c.type === 'list_item' && c.attrs?.listType === 'ordered',
		);
		expect(listsBefore.length).toBeGreaterThanOrEqual(2);

		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+x');
		await page.waitForTimeout(100);
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(200);

		const json: { children: JsonChild[] } = await editor.getJSON();
		const listItems: JsonChild[] = json.children.filter(
			(c) => c.type === 'list_item' && c.attrs?.listType === 'ordered',
		);
		expect(listItems.length).toBeGreaterThanOrEqual(2);
	});

	test('cut & paste heading preserves heading type and level', async ({ editor, page }) => {
		await editor.focus();
		// Use input rule # for heading level 1
		await page.keyboard.type('# ', { delay: 10 });
		await page.keyboard.type('My Heading', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Normal paragraph', { delay: 10 });

		const beforeJson: { children: JsonChild[] } = await editor.getJSON();
		const headingBefore: JsonChild | undefined = beforeJson.children.find(
			(c) => c.type === 'heading',
		);
		expect(headingBefore).toBeDefined();

		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+x');
		await page.waitForTimeout(100);
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(200);

		const json: { children: JsonChild[] } = await editor.getJSON();
		const heading: JsonChild | undefined = json.children.find((c) => c.type === 'heading');
		expect(heading).toBeDefined();
		expect(heading?.attrs?.level).toBe(1);
	});

	test('cut & paste blockquote preserves block type', async ({ editor, page }) => {
		await editor.focus();
		// Use input rule > for blockquote
		await page.keyboard.type('> ', { delay: 10 });
		await page.keyboard.type('A famous quote', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter'); // exit blockquote
		await page.keyboard.type('After quote', { delay: 10 });

		const beforeJson: { children: JsonChild[] } = await editor.getJSON();
		const bqBefore: JsonChild | undefined = beforeJson.children.find(
			(c) => c.type === 'blockquote',
		);
		expect(bqBefore).toBeDefined();

		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+x');
		await page.waitForTimeout(100);
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(200);

		const json: { children: JsonChild[] } = await editor.getJSON();
		const bq: JsonChild | undefined = json.children.find((c) => c.type === 'blockquote');
		expect(bq).toBeDefined();
		const bqText: string = (bq?.children ?? []).map((c) => c.text ?? '').join('');
		expect(bqText).toContain('A famous quote');
	});

	test('cut & paste mixed content preserves all block types', async ({ editor, page }) => {
		await editor.focus();

		// Create a heading
		await page.keyboard.type('# ', { delay: 10 });
		await page.keyboard.type('Title', { delay: 10 });
		await page.keyboard.press('Enter');

		// Create a bullet list
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('List item', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter'); // exit list

		// Create a normal paragraph
		await page.keyboard.type('Normal text', { delay: 10 });

		const beforeJson: { children: JsonChild[] } = await editor.getJSON();
		expect(beforeJson.children.find((c) => c.type === 'heading')).toBeDefined();
		expect(beforeJson.children.find((c) => c.type === 'list_item')).toBeDefined();
		expect(beforeJson.children.find((c) => c.type === 'paragraph')).toBeDefined();

		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+x');
		await page.waitForTimeout(100);
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(200);

		const json: { children: JsonChild[] } = await editor.getJSON();
		expect(json.children.find((c) => c.type === 'heading')).toBeDefined();
		expect(json.children.find((c) => c.type === 'list_item')).toBeDefined();
		expect(json.children.find((c) => c.type === 'paragraph')).toBeDefined();
	});
});

test.describe('Mark preservation on paste', () => {
	test('paste HTML with <sup> preserves superscript mark', async ({ editor }) => {
		await editor.focus();
		await editor.pasteHTML('<p>x<sup>2</sup></p>');

		const html: string = await editor.getContentHTML();
		expect(html).toContain('<sup>');
		expect(html).toContain('2');
	});

	test('paste HTML with <sub> preserves subscript mark', async ({ editor }) => {
		await editor.focus();
		await editor.pasteHTML('<p>H<sub>2</sub>O</p>');

		const html: string = await editor.getContentHTML();
		expect(html).toContain('<sub>');
		expect(html).toContain('2');
	});

	test('type + superscript + copy + paste preserves mark', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('x', { delay: 10 });
		await page.keyboard.press('Control+.');
		await page.keyboard.type('2', { delay: 10 });
		await page.keyboard.press('Control+.');

		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+c');
		await page.keyboard.press('End');
		await page.keyboard.press('Enter');
		await page.keyboard.press('Control+v');

		const html: string = await editor.getContentHTML();
		const supCount: number = (html.match(/<sup>/g) ?? []).length;
		expect(supCount).toBeGreaterThanOrEqual(2);
	});

	test('type + subscript + copy + paste preserves mark', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('H', { delay: 10 });
		await page.keyboard.press('Control+,');
		await page.keyboard.type('2', { delay: 10 });
		await page.keyboard.press('Control+,');
		await page.keyboard.type('O', { delay: 10 });

		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+c');
		await page.keyboard.press('End');
		await page.keyboard.press('Enter');
		await page.keyboard.press('Control+v');

		const html: string = await editor.getContentHTML();
		const subCount: number = (html.match(/<sub>/g) ?? []).length;
		expect(subCount).toBeGreaterThanOrEqual(2);
	});

	test('paste HTML with <sup> into table cell preserves superscript', async ({ editor, page }) => {
		await editor.focus();
		const tableBtn = editor.markButton('table');
		await tableBtn.click();
		const gridCell = page.locator('.notectl-grid-picker__cell[data-row="1"][data-col="1"]');
		await gridCell.click();

		const tableCells = page.locator('notectl-editor td');
		await tableCells.first().click();
		await page.waitForTimeout(100);
		await editor.pasteHTML('<p>x<sup>2</sup></p>');

		const supInCell = page.locator('notectl-editor td sup');
		await expect(supInCell).toHaveCount(1);
		await expect(supInCell).toHaveText('2');
	});

	test('paste HTML with <sub> into table cell preserves subscript', async ({ editor, page }) => {
		await editor.focus();
		const tableBtn = editor.markButton('table');
		await tableBtn.click();
		const gridCell = page.locator('.notectl-grid-picker__cell[data-row="1"][data-col="1"]');
		await gridCell.click();

		const tableCells = page.locator('notectl-editor td');
		await tableCells.first().click();
		await page.waitForTimeout(100);
		await editor.pasteHTML('<p>H<sub>2</sub>O</p>');

		const subInCell = page.locator('notectl-editor td sub');
		await expect(subInCell).toHaveCount(1);
		await expect(subInCell).toHaveText('2');
	});
});

test.describe('Copy and external paste', () => {
	test('copy two paragraphs and paste preserves line breaks', async ({ editor, page }) => {
		// Arrange: create two paragraphs
		await editor.typeText('Line A');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Line B', { delay: 10 });

		// Act: select all, copy (not cut), move to end, paste
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+c');
		await page.keyboard.press('End');
		await page.keyboard.press('Enter');
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(200);

		// Assert: should have original + pasted paragraphs
		const json: { children: JsonChild[] } = await editor.getJSON();
		const paragraphs: JsonChild[] = json.children.filter((c) => c.type === 'paragraph');
		const texts: string[] = paragraphs.map((p) =>
			(p.children ?? []).map((c) => c.text ?? '').join(''),
		);
		expect(texts.filter((t) => t === 'Line A').length).toBeGreaterThanOrEqual(2);
		expect(texts.filter((t) => t === 'Line B').length).toBeGreaterThanOrEqual(2);
	});

	test('paste multi-line plain text creates multiple blocks', async ({ editor }) => {
		// Arrange: focus editor
		await editor.focus();

		// Act: paste plain text with newlines (simulates external paste)
		await editor.pasteText('Alpha\nBeta\nGamma');
		await editor.page.waitForTimeout(200);

		// Assert: should create separate paragraphs
		const json: { children: JsonChild[] } = await editor.getJSON();
		const paragraphs: JsonChild[] = json.children.filter((c) => c.type === 'paragraph');
		expect(paragraphs.length).toBeGreaterThanOrEqual(3);

		const texts: string[] = paragraphs.map((p) =>
			(p.children ?? []).map((c) => c.text ?? '').join(''),
		);
		expect(texts).toContain('Alpha');
		expect(texts).toContain('Beta');
		expect(texts).toContain('Gamma');
	});

	test('paste HTML with multiple paragraphs creates multiple blocks', async ({ editor }) => {
		// Arrange: focus editor
		await editor.focus();

		// Act: paste HTML with <p> tags
		await editor.pasteHTML('<p>Para One</p><p>Para Two</p>');
		await editor.page.waitForTimeout(200);

		// Assert: should create two paragraphs
		const json: { children: JsonChild[] } = await editor.getJSON();
		const paragraphs: JsonChild[] = json.children.filter((c) => c.type === 'paragraph');
		expect(paragraphs.length).toBeGreaterThanOrEqual(2);

		const texts: string[] = paragraphs.map((p) =>
			(p.children ?? []).map((c) => c.text ?? '').join(''),
		);
		expect(texts).toContain('Para One');
		expect(texts).toContain('Para Two');
	});
});
