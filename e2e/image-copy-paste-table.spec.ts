import { expect, test } from './fixtures/editor-page';

test.describe('Image copy & paste into table cells', () => {
	test.beforeEach(async ({ context }) => {
		try {
			await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		} catch {
			// Best-effort: some browsers do not expose clipboard permissions via Playwright.
		}
	});

	test('copy image and paste into all three cells of a 1x3 table', async ({
		editor,
		page,
		browserName,
	}) => {
		await editor.focus();

		type JsonChild = {
			type: string;
			children?: JsonChild[];
			attrs?: Record<string, unknown>;
		};

		// --- Step 1: Insert an image via toolbar file upload ---
		const imageBtn = editor.markButton('image');
		await imageBtn.click();

		const uploadBtn = page.locator(
			'notectl-editor button[aria-label="Upload image from computer"]',
		);
		const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), uploadBtn.click()]);
		await fileChooser.setFiles('e2e/fixtures/mage.png');

		const imageLocator = page.locator('notectl-editor .notectl-image__img');
		await imageLocator.waitFor({ state: 'visible', timeout: 5000 });

		// Click on the image to select it (NodeSelection)
		await imageLocator.click();
		await page.waitForTimeout(200);

		// --- Step 2: Move cursor below the image and insert a 1-column, 3-row table ---
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('End');

		const tableBtn = editor.markButton('table');
		await tableBtn.click();

		// Select a 1-column x 3-row grid cell
		const gridCell = page.locator('.notectl-grid-picker__cell[data-row="3"][data-col="1"]');
		await gridCell.click();

		// Verify table was inserted with correct dimensions
		const jsonAfterTable: { children: JsonChild[] } = await editor.getJSON();
		const tableCheck = jsonAfterTable.children.find((c) => c.type === 'table');
		expect(tableCheck).toBeDefined();

		const rowsCheck = (tableCheck?.children ?? []).filter((c) => c.type === 'table_row');
		expect(rowsCheck).toHaveLength(3);

		for (const row of rowsCheck) {
			const cells = (row.children ?? []).filter((c) => c.type === 'table_cell');
			expect(cells).toHaveLength(1);
		}

		// --- Step 3: Copy the image (select it, Ctrl+C) ---
		// Click the image to get NodeSelection on it
		await imageLocator.first().click();
		await page.waitForTimeout(200);
		await page.keyboard.press('Control+c');

		// --- Step 4: Paste the image into cell 1 (row 1) ---
		// Click into the first table cell
		const tableCells = page.locator('notectl-editor td');
		await tableCells.nth(0).click();
		await page.waitForTimeout(100);
		await page.keyboard.press('Control+v');
		await expect(imageLocator).toHaveCount(2, { timeout: 5000 });

		// --- Step 5: Paste the image into cell 2 (row 2) ---
		await tableCells.nth(1).click();
		await page.waitForTimeout(100);
		await page.keyboard.press('Control+v');
		await expect(imageLocator).toHaveCount(3, { timeout: 5000 });

		// --- Step 6: Paste the image into cell 3 (row 3) ---
		await tableCells.nth(2).click();
		await page.waitForTimeout(100);
		await page.keyboard.press('Control+v');
		await expect(imageLocator).toHaveCount(4, { timeout: 5000 });

		// --- Final verification ---
		const jsonFinal: { children: JsonChild[] } = await editor.getJSON();

		// Verify the original image is still at the top
		const topImage = jsonFinal.children.find((c) => c.type === 'image');
		expect(topImage).toBeDefined();
		expect(topImage?.attrs?.src).toBeTruthy();

		// Verify the table structure: 1 column, 3 rows
		const tableFinal = jsonFinal.children.find((c) => c.type === 'table');
		expect(tableFinal).toBeDefined();

		const rowsFinal = (tableFinal?.children ?? []).filter((c) => c.type === 'table_row');
		expect(rowsFinal).toHaveLength(3);

		// Verify each cell contains an image
		for (let i = 0; i < 3; i++) {
			const row = rowsFinal[i];
			const cells = (row?.children ?? []).filter((c) => c.type === 'table_cell');
			expect(cells).toHaveLength(1);

			const cellImage = (cells[0]?.children ?? []).find((c) => c.type === 'image');
			expect(cellImage).toBeDefined();
			// Firefox may strip blob URL payloads on clipboard image roundtrip.
			// We still assert structural correctness (image nodes in all cells).
			if (browserName !== 'firefox') {
				expect(cellImage?.attrs?.src).toBeTruthy();
			}
		}

		// Verify total image count: 1 (top) + 3 (in table) = 4
		await expect(imageLocator).toHaveCount(4);
	});
});
