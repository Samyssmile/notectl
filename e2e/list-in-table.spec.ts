import { expect, test } from './fixtures/editor-page';
import { type JsonChild, getCellContents, insertTable } from './fixtures/table-utils';

// ══════════════════════════════════════════════════════════════════════════
// Section 1: Creating lists inside table cells via input rules
// ══════════════════════════════════════════════════════════════════════════

test.describe('Lists inside table cells — input rules', () => {
	test('typing "- " in a table cell creates a bullet list item', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		// Cursor should be in the first cell
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('Bullet item', { delay: 10 });

		const json: { children: JsonChild[] } = await editor.getJSON();
		const table: JsonChild | undefined = json.children.find((c) => c.type === 'table');
		expect(table).toBeDefined();
		if (!table) return;

		const cellContents: JsonChild[][] = getCellContents(table);
		const firstCell: JsonChild[] = cellContents[0] ?? [];

		// The first cell should contain a list_item (not raw text "- Bullet item")
		const listItem: JsonChild | undefined = firstCell.find((c) => c.type === 'list_item');
		expect(listItem).toBeDefined();
		expect(listItem?.attrs?.listType).toBe('bullet');

		// The prefix "- " should be removed
		const cellText: string = firstCell
			.flatMap((c) => (c.children ?? []).map((t) => t.text ?? ''))
			.join('');
		expect(cellText).toContain('Bullet item');
		expect(cellText).not.toContain('- ');
	});

	test('typing "1. " in a table cell creates an ordered list item', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		await page.keyboard.type('1. ', { delay: 10 });
		await page.keyboard.type('Ordered item', { delay: 10 });

		await expect(async () => {
			const json: { children: JsonChild[] } = await editor.getJSON();
			const table: JsonChild | undefined = json.children.find((c) => c.type === 'table');
			expect(table).toBeDefined();
			if (!table) return;

			const cellContents: JsonChild[][] = getCellContents(table);
			const firstCell: JsonChild[] = cellContents[0] ?? [];

			const listItem: JsonChild | undefined = firstCell.find((c) => c.type === 'list_item');
			expect(listItem).toBeDefined();
			expect(listItem?.attrs?.listType).toBe('ordered');
		}).toPass({ timeout: 5_000 });
	});

	test('typing "[ ] " in a table cell creates a checklist item', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		await page.keyboard.type('[ ] ', { delay: 10 });
		await page.keyboard.type('Todo item', { delay: 10 });

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

	test('multiple list items can be created in a single cell', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		// Create first bullet item
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('Item 1', { delay: 10 });
		await page.keyboard.press('Enter');

		// Second item (Enter in a list should create another list item)
		await page.keyboard.type('Item 2', { delay: 10 });

		const json: { children: JsonChild[] } = await editor.getJSON();
		const table: JsonChild | undefined = json.children.find((c) => c.type === 'table');
		expect(table).toBeDefined();
		if (!table) return;

		const cellContents: JsonChild[][] = getCellContents(table);
		const firstCell: JsonChild[] = cellContents[0] ?? [];

		const listItems: JsonChild[] = firstCell.filter((c) => c.type === 'list_item');
		expect(listItems.length).toBeGreaterThanOrEqual(2);
	});

	test('typing "* " in a table cell creates a bullet list item', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		await page.keyboard.type('* ', { delay: 10 });
		await page.keyboard.type('Star bullet', { delay: 10 });

		const json: { children: JsonChild[] } = await editor.getJSON();
		const table: JsonChild | undefined = json.children.find((c) => c.type === 'table');
		expect(table).toBeDefined();
		if (!table) return;

		const cellContents: JsonChild[][] = getCellContents(table);
		const firstCell: JsonChild[] = cellContents[0] ?? [];

		const listItem: JsonChild | undefined = firstCell.find((c) => c.type === 'list_item');
		expect(listItem).toBeDefined();
		expect(listItem?.attrs?.listType).toBe('bullet');
	});
});

// ══════════════════════════════════════════════════════════════════════════
// Section 2: Copy-pasting lists into / from table cells
// ══════════════════════════════════════════════════════════════════════════

test.describe('Lists copy-paste with table cells', () => {
	test.beforeEach(async ({ context }) => {
		try {
			await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		} catch {
			// Best-effort: some browsers do not expose clipboard permissions via Playwright.
		}
	});

	test('paste bullet list into table cell preserves list_item structure', async ({
		editor,
		page,
	}) => {
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
