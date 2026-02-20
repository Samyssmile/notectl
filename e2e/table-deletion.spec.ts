import { expect, test } from './fixtures/editor-page';
import { hasTableBlock, insertTable } from './fixtures/table-utils';

test.describe('Table Deletion', () => {
	test('Backspace twice removes a table (select then delete)', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);
		expect(await hasTableBlock(page)).toBe(true);

		await page.keyboard.press('Backspace');
		expect(await hasTableBlock(page)).toBe(true);
		await page.keyboard.press('Backspace');

		expect(await hasTableBlock(page)).toBe(false);
	});

	test('Delete twice removes a table from the last cell boundary', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);
		expect(await hasTableBlock(page)).toBe(true);

		for (let i = 0; i < 8; i++) {
			await page.keyboard.press('Tab');
		}

		await page.keyboard.press('Delete');
		expect(await hasTableBlock(page)).toBe(true);
		await page.keyboard.press('Delete');

		expect(await hasTableBlock(page)).toBe(false);
	});

	test('Delete table button removes table via controls UI', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);
		expect(await hasTableBlock(page)).toBe(true);

		const tableContainer = page.locator('notectl-editor .ntbl-container').first();
		await tableContainer.hover();

		const deleteButton = page.locator('notectl-editor .ntbl-delete-table-btn').first();
		await deleteButton.click();

		expect(await hasTableBlock(page)).toBe(false);
	});
});
