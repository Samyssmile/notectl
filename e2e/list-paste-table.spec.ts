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
};

/**
 * Helper: inserts a table via the executeCommand API and returns the cursor
 * in the first cell.
 */
async function insertTable(page: import('@playwright/test').Page): Promise<void> {
	await page.evaluate(() => {
		const el = document.querySelector('notectl-editor') as HTMLElement & {
			executeCommand(name: string): boolean;
		};
		el?.executeCommand('insertTable');
	});
}

/** Extracts all cell children from a table JSON node (row-major order). */
function getCellContents(table: JsonChild): JsonChild[][] {
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

// ══════════════════════════════════════════════════════════════════════════
// Copy list from outside table → paste into table cell (structure preserved)
// ══════════════════════════════════════════════════════════════════════════

test.describe('Copy list outside table → paste into table cell', () => {
	test('bullet list preserves list_item type when pasted into cell', async ({ editor, page }) => {
		await editor.focus();

		// Create a bullet list outside the table
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('Bullet from outside', { delay: 10 });

		// Select all text and copy
		await page.keyboard.press('Home');
		await page.keyboard.press('Shift+End');
		await page.keyboard.press('Control+c');

		// Exit list, insert table
		await page.keyboard.press('End');
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter');
		await insertTable(page);

		// Paste into the first cell
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(300);

		const json: { children: JsonChild[] } = await editor.getJSON();
		const table: JsonChild | undefined = json.children.find((c) => c.type === 'table');
		expect(table).toBeDefined();
		if (!table) return;

		const cellContents: JsonChild[][] = getCellContents(table);
		const firstCell: JsonChild[] = cellContents[0] ?? [];

		// The cell must contain a list_item, not just a paragraph with text
		const listItem: JsonChild | undefined = firstCell.find((c) => c.type === 'list_item');
		expect(listItem).toBeDefined();
		expect(listItem?.attrs?.listType).toBe('bullet');

		// Verify text content
		const listText: string = (listItem?.children ?? []).map((c) => c.text ?? '').join('');
		expect(listText).toContain('Bullet from outside');
	});

	test('ordered list preserves list_item type when pasted into cell', async ({ editor, page }) => {
		await editor.focus();

		// Create an ordered list
		await page.keyboard.type('1. ', { delay: 10 });
		await page.keyboard.type('Ordered from outside', { delay: 10 });

		// Select and copy
		await page.keyboard.press('Home');
		await page.keyboard.press('Shift+End');
		await page.keyboard.press('Control+c');

		// Exit list, insert table
		await page.keyboard.press('End');
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter');
		await insertTable(page);

		// Paste into the first cell
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(300);

		const json: { children: JsonChild[] } = await editor.getJSON();
		const table: JsonChild | undefined = json.children.find((c) => c.type === 'table');
		expect(table).toBeDefined();
		if (!table) return;

		const cellContents: JsonChild[][] = getCellContents(table);
		const firstCell: JsonChild[] = cellContents[0] ?? [];

		const listItem: JsonChild | undefined = firstCell.find((c) => c.type === 'list_item');
		expect(listItem).toBeDefined();
		expect(listItem?.attrs?.listType).toBe('ordered');

		const listText: string = (listItem?.children ?? []).map((c) => c.text ?? '').join('');
		expect(listText).toContain('Ordered from outside');
	});

	test('checklist preserves list_item type when pasted into cell', async ({ editor, page }) => {
		await editor.focus();

		// Create a checklist
		await page.keyboard.type('[ ] ', { delay: 10 });
		await page.keyboard.type('Check from outside', { delay: 10 });

		// Select and copy
		await page.keyboard.press('Home');
		await page.keyboard.press('Shift+End');
		await page.keyboard.press('Control+c');

		// Exit list, insert table
		await page.keyboard.press('End');
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter');
		await insertTable(page);

		// Paste into the first cell
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(300);

		const json: { children: JsonChild[] } = await editor.getJSON();
		const table: JsonChild | undefined = json.children.find((c) => c.type === 'table');
		expect(table).toBeDefined();
		if (!table) return;

		const cellContents: JsonChild[][] = getCellContents(table);
		const firstCell: JsonChild[] = cellContents[0] ?? [];

		const listItem: JsonChild | undefined = firstCell.find((c) => c.type === 'list_item');
		expect(listItem).toBeDefined();
		expect(listItem?.attrs?.listType).toBe('checklist');
		expect(listItem?.attrs?.checked).toBe(false);
	});

	test('pasting replaces empty cell paragraph (no leftover empty block)', async ({
		editor,
		page,
	}) => {
		await editor.focus();

		// Create a bullet list
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('Only item', { delay: 10 });

		// Select and copy
		await page.keyboard.press('Home');
		await page.keyboard.press('Shift+End');
		await page.keyboard.press('Control+c');

		// Exit list, insert table
		await page.keyboard.press('End');
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter');
		await insertTable(page);

		// Paste into the first cell (which has an empty paragraph)
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(300);

		const json: { children: JsonChild[] } = await editor.getJSON();
		const table: JsonChild | undefined = json.children.find((c) => c.type === 'table');
		expect(table).toBeDefined();
		if (!table) return;

		const cellContents: JsonChild[][] = getCellContents(table);
		const firstCell: JsonChild[] = cellContents[0] ?? [];

		// The empty paragraph should have been removed — only the list_item remains
		const paragraphs: JsonChild[] = firstCell.filter((c) => c.type === 'paragraph');
		const emptyParagraphs: JsonChild[] = paragraphs.filter((p) => {
			const text: string = (p.children ?? []).map((c) => c.text ?? '').join('');
			return text === '';
		});
		expect(emptyParagraphs).toHaveLength(0);

		// list_item must be present
		expect(firstCell.some((c) => c.type === 'list_item')).toBe(true);
	});
});

// ══════════════════════════════════════════════════════════════════════════
// Copy list from table cell → paste outside table
// ══════════════════════════════════════════════════════════════════════════

test.describe('Copy list from table cell → paste outside table', () => {
	test('list copied from cell preserves structure when pasted outside', async ({
		editor,
		page,
	}) => {
		await editor.focus();

		// Insert a table first
		await insertTable(page);

		// Create a bullet list in the first cell via input rule
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('Cell bullet item', { delay: 10 });

		// Select the list text and copy
		await page.keyboard.press('Home');
		await page.keyboard.press('Shift+End');
		await page.keyboard.press('Control+c');

		// Navigate outside the table (Escape), create a deterministic paragraph target, paste there.
		await page.keyboard.press('Escape');
		await page.waitForTimeout(100);
		await page.keyboard.press('Enter');
		await page.waitForTimeout(100);

		// Paste into the paragraph after the table
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(300);

		const json: { children: JsonChild[] } = await editor.getJSON();

		// Find list_items outside the table
		const topLevelListItems: JsonChild[] = json.children.filter((c) => c.type === 'list_item');
		expect(topLevelListItems.length).toBeGreaterThanOrEqual(1);

		const pastedItem: JsonChild | undefined = topLevelListItems[topLevelListItems.length - 1];
		expect(pastedItem).toBeDefined();
		if (!pastedItem) return;
		expect(pastedItem.attrs?.listType).toBe('bullet');

		const itemText: string = (pastedItem.children ?? []).map((c) => c.text ?? '').join('');
		expect(itemText).toContain('Cell bullet item');
	});
});

// ══════════════════════════════════════════════════════════════════════════
// Multiple list items copy-paste
// ══════════════════════════════════════════════════════════════════════════

test.describe('Multiple list items copy-paste into table cell', () => {
	test('multiple bullet items pasted into cell keep list_item structure', async ({
		editor,
		page,
	}) => {
		await editor.focus();

		// Create two bullet items
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('First bullet', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Second bullet', { delay: 10 });

		// Select both items (Home, then Shift+Ctrl+End for full selection)
		await page.keyboard.press('Home');
		// Navigate to first block start
		await page.keyboard.press('Control+Home');
		await page.keyboard.press('Shift+Control+End');
		await page.keyboard.press('Control+c');

		// Exit list, insert table
		await page.keyboard.press('End');
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter');
		await insertTable(page);

		// Paste into cell
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(300);

		const json: { children: JsonChild[] } = await editor.getJSON();
		const table: JsonChild | undefined = json.children.find((c) => c.type === 'table');
		expect(table).toBeDefined();
		if (!table) return;

		const cellContents: JsonChild[][] = getCellContents(table);
		const firstCell: JsonChild[] = cellContents[0] ?? [];

		const listItems: JsonChild[] = firstCell.filter((c) => c.type === 'list_item');
		expect(listItems.length).toBeGreaterThanOrEqual(2);

		// Both should be bullet type
		for (const item of listItems) {
			expect(item.attrs?.listType).toBe('bullet');
		}
	});
});
