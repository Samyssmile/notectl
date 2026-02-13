import { expect, test } from './fixtures/editor-page';

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

test.describe('Table Deletion', () => {
	test('Backspace twice removes a table (select then delete)', async ({ editor, page }) => {
		await editor.focus();
		await insertTableViaCommand(page);
		expect(await hasTableBlock(page)).toBe(true);

		await page.keyboard.press('Backspace');
		expect(await hasTableBlock(page)).toBe(true);
		await page.keyboard.press('Backspace');

		expect(await hasTableBlock(page)).toBe(false);
	});

	test('Delete twice removes a table from the last cell boundary', async ({ editor, page }) => {
		await editor.focus();
		await insertTableViaCommand(page);
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
		await insertTableViaCommand(page);
		expect(await hasTableBlock(page)).toBe(true);

		const tableContainer = page.locator('notectl-editor .ntbl-container').first();
		await tableContainer.hover();

		const deleteButton = page.locator('notectl-editor .ntbl-delete-table-btn').first();
		await deleteButton.click();

		expect(await hasTableBlock(page)).toBe(false);
	});
});
