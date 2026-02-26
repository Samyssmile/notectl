import { expect, test } from './fixtures/editor-page';

type JsonChild = {
	type: string;
	text?: string;
	marks?: { type: string }[];
	children?: JsonChild[];
};

test.describe('Superscript/Subscript copy & paste', () => {
	test.beforeEach(async ({ context, browserName }) => {
		if (browserName !== 'firefox') {
			await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		}
	});

	test('paste HTML with <sup> preserves superscript mark', async ({ editor }) => {
		await editor.focus();
		await editor.pasteHTML('<p>x<sup>2</sup></p>');

		const html: string = await editor.getHTML();
		expect(html).toContain('<sup>');
		expect(html).toContain('2');
	});

	test('paste HTML with <sub> preserves subscript mark', async ({ editor }) => {
		await editor.focus();
		await editor.pasteHTML('<p>H<sub>2</sub>O</p>');

		const html: string = await editor.getHTML();
		expect(html).toContain('<sub>');
		expect(html).toContain('2');
	});

	test('type + superscript + copy + paste preserves mark', async ({
		editor,
		page,
		browserName,
	}) => {
		test.skip(browserName === 'firefox', 'Firefox does not support clipboard permissions');

		await editor.focus();
		await page.keyboard.type('x', { delay: 10 });
		await page.keyboard.press('Control+.');
		await page.keyboard.type('2', { delay: 10 });
		await page.keyboard.press('Control+.');

		// Select all and copy
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+c');

		// Move to end, press Enter for new paragraph, paste
		await page.keyboard.press('End');
		await page.keyboard.press('Enter');
		await page.keyboard.press('Control+v');

		const html: string = await editor.getHTML();
		// Should have <sup> in both the original and pasted content
		const supCount: number = (html.match(/<sup>/g) ?? []).length;
		expect(supCount).toBeGreaterThanOrEqual(2);
	});

	test('type + subscript + copy + paste preserves mark', async ({ editor, page, browserName }) => {
		test.skip(browserName === 'firefox', 'Firefox does not support clipboard permissions');

		await editor.focus();
		await page.keyboard.type('H', { delay: 10 });
		await page.keyboard.press('Control+,');
		await page.keyboard.type('2', { delay: 10 });
		await page.keyboard.press('Control+,');
		await page.keyboard.type('O', { delay: 10 });

		// Select all and copy
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+c');

		// Move to end, press Enter for new paragraph, paste
		await page.keyboard.press('End');
		await page.keyboard.press('Enter');
		await page.keyboard.press('Control+v');

		const html: string = await editor.getHTML();
		const subCount: number = (html.match(/<sub>/g) ?? []).length;
		expect(subCount).toBeGreaterThanOrEqual(2);
	});

	test('paste HTML with <sup> into table cell preserves superscript mark', async ({
		editor,
		page,
	}) => {
		await editor.focus();

		// Insert a table
		const tableBtn = editor.markButton('table');
		await tableBtn.click();
		const gridCell = page.locator('.notectl-grid-picker__cell[data-row="1"][data-col="1"]');
		await gridCell.click();

		// Click into first cell and paste HTML with superscript
		const tableCells = page.locator('notectl-editor td');
		await tableCells.first().click();
		await page.waitForTimeout(100);
		await editor.pasteHTML('<p>x<sup>2</sup></p>');

		// Check DOM directly since getHTML() doesn't include table cell content
		const supInCell = page.locator('notectl-editor td sup');
		await expect(supInCell).toHaveCount(1);
		await expect(supInCell).toHaveText('2');
	});

	test('paste HTML with <sub> into table cell preserves subscript mark', async ({
		editor,
		page,
	}) => {
		await editor.focus();

		// Insert a table
		const tableBtn = editor.markButton('table');
		await tableBtn.click();
		const gridCell = page.locator('.notectl-grid-picker__cell[data-row="1"][data-col="1"]');
		await gridCell.click();

		// Click into first cell and paste HTML with subscript
		const tableCells = page.locator('notectl-editor td');
		await tableCells.first().click();
		await page.waitForTimeout(100);
		await editor.pasteHTML('<p>H<sub>2</sub>O</p>');

		// Check DOM directly since getHTML() doesn't include table cell content
		const subInCell = page.locator('notectl-editor td sub');
		await expect(subInCell).toHaveCount(1);
		await expect(subInCell).toHaveText('2');
	});
});
