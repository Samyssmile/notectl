import { expect, test } from './fixtures/editor-page';
import {
	deleteFirstCol,
	deleteFirstRow,
	getTableColCount,
	getTableRowCount,
	hasTableBlock,
	insertTable,
} from './fixtures/table-utils';

test.describe('Table Editing — Row & Column Controls', () => {
	test('add row button appends a row', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		const initialRows = await getTableRowCount(page);
		expect(initialRows).toBe(3);

		const tableContainer = page.locator('notectl-editor .ntbl-container').first();
		await tableContainer.hover();

		const addRowBtn = page.locator('notectl-editor .ntbl-add-row').first();
		await addRowBtn.click();

		const newRows = await getTableRowCount(page);
		expect(newRows).toBe(4);
	});

	test('add column button appends a column', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		const initialCols = await getTableColCount(page);
		expect(initialCols).toBe(3);

		const tableContainer = page.locator('notectl-editor .ntbl-container').first();
		await tableContainer.hover();

		const addColBtn = page.locator('notectl-editor .ntbl-add-col').first();
		await addColBtn.click();

		const newCols = await getTableColCount(page);
		expect(newCols).toBe(4);
	});

	test('delete row via row handle', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);
		expect(await getTableRowCount(page)).toBe(3);

		await deleteFirstRow(page);

		expect(await getTableRowCount(page)).toBe(2);
	});

	test('delete column via col handle', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);
		expect(await getTableColCount(page)).toBe(3);

		await deleteFirstCol(page);

		expect(await getTableColCount(page)).toBe(2);
	});

	test('deleting last row removes entire table', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		for (let i = 0; i < 3; i++) {
			if (!(await hasTableBlock(page))) break;
			await deleteFirstRow(page);
			await page.waitForTimeout(100);
		}

		expect(await hasTableBlock(page)).toBe(false);
	});

	test('deleting last column removes entire table', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		for (let i = 0; i < 3; i++) {
			if (!(await hasTableBlock(page))) break;
			await deleteFirstCol(page);
			await page.waitForTimeout(100);
		}

		expect(await hasTableBlock(page)).toBe(false);
	});
});
