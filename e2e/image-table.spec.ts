import { expect, test } from './fixtures/editor-page';

test.use({
	permissions: ['clipboard-read', 'clipboard-write'],
});

test.describe('Image cut & paste into table', () => {
	test('cut image and paste into second table cell', async ({ editor, page }) => {
		await editor.focus();

		// --- Step 1: Insert an image via toolbar file upload ---
		const imageBtn = editor.markButton('image');
		await imageBtn.click();

		const fileInput = page.locator('notectl-editor input[type="file"]');
		await fileInput.setInputFiles('e2e/fixtures/mage.png');

		// Wait for the image to appear and fully load
		const imageLocator = page.locator('notectl-editor .notectl-image__img');
		await imageLocator.waitFor({ state: 'visible', timeout: 5000 });

		// The image is auto-selected (NodeSelection) after insertion.
		// Click the figure element to close the popup and re-confirm selection.
		const figureLocator = page.locator('notectl-editor figure.notectl-image');
		await figureLocator.click({ force: true });
		await page.waitForTimeout(200);

		// --- Step 2: Cut the image with Ctrl+X ---
		await page.keyboard.press('Control+x');

		// Verify the image was removed from the editor
		await expect(imageLocator).toHaveCount(0);

		// --- Step 3: Insert a 1-row, 2-column table via toolbar grid picker ---
		await editor.focus();

		const tableBtn = editor.markButton('table');
		await tableBtn.click();

		const gridCell = page.locator('.notectl-grid-picker__cell[data-row="1"][data-col="2"]');
		await gridCell.click();

		// Verify table was inserted
		type JsonChild = {
			type: string;
			children?: JsonChild[];
			attrs?: Record<string, unknown>;
		};
		const json: { children: JsonChild[] } = await editor.getJSON();
		const table = json.children.find((c) => c.type === 'table');
		expect(table).toBeDefined();

		// --- Step 4: Navigate to the second cell with Tab ---
		await page.keyboard.press('Tab');

		// --- Step 5: Paste the image with Ctrl+V ---
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(500);

		// --- Verification 1: Image block exists in second cell ---
		const jsonAfter: { children: JsonChild[] } = await editor.getJSON();
		const tableAfter = jsonAfter.children.find((c) => c.type === 'table');
		expect(tableAfter).toBeDefined();

		const rows = (tableAfter?.children ?? []).filter((c) => c.type === 'table_row');
		expect(rows).toHaveLength(1);

		const cells = (rows[0]?.children ?? []).filter((c) => c.type === 'table_cell');
		expect(cells).toHaveLength(2);

		const secondCell = cells[1];
		const imageChild = (secondCell?.children ?? []).find((c) => c.type === 'image');
		expect(imageChild).toBeDefined();

		// --- Verification 2: The image is actually visible (loaded, non-zero dimensions) ---
		await expect(imageLocator).toBeVisible({ timeout: 3000 });

		const imgState = await page.evaluate(() => {
			const el = document.querySelector('notectl-editor');
			const img = el?.shadowRoot?.querySelector('.notectl-image__img') as HTMLImageElement | null;
			if (!img) return { found: false, naturalWidth: 0, naturalHeight: 0 };
			return {
				found: true,
				naturalWidth: img.naturalWidth,
				naturalHeight: img.naturalHeight,
			};
		});

		// The image must have actually loaded (non-zero natural dimensions).
		// A broken/revoked blob URL results in naturalWidth === 0.
		expect(imgState.found).toBe(true);
		expect(imgState.naturalWidth).toBeGreaterThan(0);
		expect(imgState.naturalHeight).toBeGreaterThan(0);
	});
});
