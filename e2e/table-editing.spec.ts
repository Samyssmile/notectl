import { expect, test } from './fixtures/editor-page';

type JsonChild = {
	type: string;
	children?: JsonChild[];
	attrs?: Record<string, unknown>;
};

async function insertTableViaCommand(page: import('@playwright/test').Page): Promise<void> {
	const inserted = await page.evaluate(() => {
		type EditorEl = HTMLElement & {
			executeCommand(name: string): boolean;
		};

		const editor = document.querySelector('notectl-editor') as EditorEl | null;
		if (!editor) return false;
		return editor.executeCommand('insertTable');
	});

	expect(inserted).toBe(true);
}

async function getTableRowCount(page: import('@playwright/test').Page): Promise<number> {
	return page.evaluate(() => {
		type EditorEl = HTMLElement & {
			getJSON(): { children?: { type?: string; children?: { type?: string }[] }[] };
		};

		const editor = document.querySelector('notectl-editor') as EditorEl | null;
		const children = editor?.getJSON()?.children ?? [];
		const table = children.find((c) => c?.type === 'table');
		if (!table?.children) return 0;
		return table.children.filter((c) => c?.type === 'table_row').length;
	});
}

async function getTableColCount(page: import('@playwright/test').Page): Promise<number> {
	return page.evaluate(() => {
		type EditorEl = HTMLElement & {
			getJSON(): {
				children?: {
					type?: string;
					children?: { type?: string; children?: { type?: string }[] }[];
				}[];
			};
		};

		const editor = document.querySelector('notectl-editor') as EditorEl | null;
		const children = editor?.getJSON()?.children ?? [];
		const table = children.find((c) => c?.type === 'table');
		if (!table?.children) return 0;
		const firstRow = table.children.find((c) => c?.type === 'table_row');
		if (!firstRow?.children) return 0;
		return firstRow.children.filter((c) => c?.type === 'table_cell').length;
	});
}

async function hasTableBlock(page: import('@playwright/test').Page): Promise<boolean> {
	return page.evaluate(() => {
		type EditorEl = HTMLElement & {
			getJSON(): { children?: { type?: string }[] };
		};

		const editor = document.querySelector('notectl-editor') as EditorEl | null;
		const children = editor?.getJSON()?.children ?? [];
		return children.some((child) => child?.type === 'table');
	});
}

/** Clicks the first "Delete row" button visible in the table controls. */
async function deleteFirstRow(page: import('@playwright/test').Page): Promise<void> {
	const tableContainer = page.locator('notectl-editor .ntbl-container').first();
	await tableContainer.hover();
	await page.waitForTimeout(100);

	const rowHandle = page.locator('notectl-editor .ntbl-row-handle').first();
	await rowHandle.hover();
	await page.waitForTimeout(100);

	const deleteBtn = rowHandle.locator('.ntbl-handle-delete');
	await deleteBtn.click();
}

/** Clicks the first "Delete column" button visible in the table controls. */
async function deleteFirstCol(page: import('@playwright/test').Page): Promise<void> {
	const tableContainer = page.locator('notectl-editor .ntbl-container').first();
	await tableContainer.hover();
	await page.waitForTimeout(100);

	const colHandle = page.locator('notectl-editor .ntbl-col-handle').first();
	await colHandle.hover();
	await page.waitForTimeout(100);

	const deleteBtn = colHandle.locator('.ntbl-handle-delete');
	await deleteBtn.click();
}

test.describe('Table Editing — Row & Column Controls', () => {
	test('add row button appends a row', async ({ editor, page }) => {
		await editor.focus();
		await insertTableViaCommand(page);

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
		await insertTableViaCommand(page);

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
		await insertTableViaCommand(page);
		expect(await getTableRowCount(page)).toBe(3);

		await deleteFirstRow(page);

		expect(await getTableRowCount(page)).toBe(2);
	});

	test('delete column via col handle', async ({ editor, page }) => {
		await editor.focus();
		await insertTableViaCommand(page);
		expect(await getTableColCount(page)).toBe(3);

		await deleteFirstCol(page);

		expect(await getTableColCount(page)).toBe(2);
	});

	test('deleting last row removes entire table', async ({ editor, page }) => {
		await editor.focus();
		await insertTableViaCommand(page);

		for (let i = 0; i < 3; i++) {
			if (!(await hasTableBlock(page))) break;
			await deleteFirstRow(page);
			await page.waitForTimeout(100);
		}

		expect(await hasTableBlock(page)).toBe(false);
	});

	test('deleting last column removes entire table', async ({ editor, page }) => {
		await editor.focus();
		await insertTableViaCommand(page);

		for (let i = 0; i < 3; i++) {
			if (!(await hasTableBlock(page))) break;
			await deleteFirstCol(page);
			await page.waitForTimeout(100);
		}

		expect(await hasTableBlock(page)).toBe(false);
	});
});
