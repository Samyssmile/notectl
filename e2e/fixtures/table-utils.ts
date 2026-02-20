import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Recursive JSON structure for the editor's document tree. */
export type JsonChild = {
	type: string;
	children?: JsonChild[];
	attrs?: Record<string, unknown>;
	text?: string;
};

/** Inserts a 3×3 table via the editor's executeCommand API. Asserts success. */
export async function insertTable(page: Page): Promise<void> {
	const inserted: boolean = await page.evaluate(() => {
		type EditorEl = HTMLElement & {
			executeCommand(name: string): boolean;
		};
		const editor = document.querySelector('notectl-editor') as EditorEl | null;
		if (!editor) return false;
		return editor.executeCommand('insertTable');
	});
	expect(inserted).toBe(true);
}

/** Checks whether the document contains a table block. */
export async function hasTableBlock(page: Page): Promise<boolean> {
	return page.evaluate(() => {
		type EditorEl = HTMLElement & {
			getJSON(): { children?: { type?: string }[] };
		};
		const editor = document.querySelector('notectl-editor') as EditorEl | null;
		const children = editor?.getJSON()?.children ?? [];
		return children.some((child) => child?.type === 'table');
	});
}

/** Counts the number of rows in the first table block. */
export async function getTableRowCount(page: Page): Promise<number> {
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

/** Counts the number of columns in the first row of the first table block. */
export async function getTableColCount(page: Page): Promise<number> {
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

/** Extracts all cell children from a table JSON node (row-major order). */
export function getCellContents(table: JsonChild): JsonChild[][] {
	const rows: JsonChild[] = (table.children ?? []).filter((c) => c.type === 'table_row');
	const result: JsonChild[][] = [];
	for (const row of rows) {
		const cells: JsonChild[] = (row.children ?? []).filter((c) => c.type === 'table_cell');
		for (const cell of cells) {
			result.push(cell.children ?? []);
		}
	}
	return result;
}

/** Clicks the first "Delete row" button visible in the table controls. */
export async function deleteFirstRow(page: Page): Promise<void> {
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
export async function deleteFirstCol(page: Page): Promise<void> {
	const tableContainer = page.locator('notectl-editor .ntbl-container').first();
	await tableContainer.hover();
	await page.waitForTimeout(100);

	const colHandle = page.locator('notectl-editor .ntbl-col-handle').first();
	await colHandle.hover();
	await page.waitForTimeout(100);

	const deleteBtn = colHandle.locator('.ntbl-handle-delete');
	await deleteBtn.click();
}
