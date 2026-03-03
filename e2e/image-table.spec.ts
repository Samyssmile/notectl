import { expect, test } from './fixtures/editor-page';
import { type JsonChild, getCellContents, insertTable } from './fixtures/table-utils';

/** 1x1 transparent PNG as a data URI (avoids external network requests). */
const DATA_URI_PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test.describe('Image inside table cell', () => {
	test('pasting an image into a table cell places it inside the cell', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		// Click the second cell to place the cursor there
		const secondCell = page.locator('notectl-editor td').nth(1);
		await secondCell.click();
		await page.waitForTimeout(100);

		// Paste an image via synthetic HTML paste
		await editor.pasteHTML(`<img src="${DATA_URI_PNG}" alt="test image">`);

		// Verify: the table's second cell contains an image block
		await expect(async () => {
			const json: { children: JsonChild[] } = await editor.getJSON();
			const table: JsonChild | undefined = json.children.find((c) => c.type === 'table');
			expect(table).toBeDefined();
			if (!table) return;

			const cellContents: JsonChild[][] = getCellContents(table);
			// Second cell (index 1) should contain an image
			const secondCellChildren: JsonChild[] = cellContents[1] ?? [];
			const imageChild: JsonChild | undefined = secondCellChildren.find((c) => c.type === 'image');
			expect(imageChild).toBeDefined();
		}).toPass({ timeout: 5000 });

		// Verify the image is visible in the DOM
		const img = page.locator('notectl-editor .notectl-image__img');
		await expect(img).toBeVisible({ timeout: 3000 });
	});
});
