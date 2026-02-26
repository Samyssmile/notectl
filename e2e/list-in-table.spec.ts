import { expect, test } from './fixtures/editor-page';

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
// Part 1: Creating lists inside table cells via input rules
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
// Part 2: List wrapper rendering inside table cells
// ══════════════════════════════════════════════════════════════════════════

test.describe('Lists inside table cells — DOM wrappers', () => {
	test('bullet list item in table cell is wrapped in <ul>', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('Bullet item', { delay: 10 });

		// The <li> should be inside a <ul> wrapper with the notectl-list class
		const wrapperInfo = await page.evaluate(() => {
			const el = document.querySelector('notectl-editor');
			const shadow = el?.shadowRoot;
			const li = shadow?.querySelector('td .notectl-list-item--bullet');
			if (!li) return { found: false, parentTag: '', hasListClass: false };
			const parent = li.parentElement;
			return {
				found: true,
				parentTag: parent?.tagName ?? '',
				hasListClass: parent?.classList.contains('notectl-list') ?? false,
			};
		});

		expect(wrapperInfo.found).toBe(true);
		expect(wrapperInfo.parentTag).toBe('UL');
		expect(wrapperInfo.hasListClass).toBe(true);
	});

	test('ordered list item in table cell is wrapped in <ol>', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		await page.keyboard.type('1. ', { delay: 10 });
		await page.keyboard.type('Ordered item', { delay: 10 });

		const wrapperInfo = await page.evaluate(() => {
			const el = document.querySelector('notectl-editor');
			const shadow = el?.shadowRoot;
			const li = shadow?.querySelector('td .notectl-list-item--ordered');
			if (!li) return { found: false, parentTag: '', hasListClass: false };
			const parent = li.parentElement;
			return {
				found: true,
				parentTag: parent?.tagName ?? '',
				hasListClass: parent?.classList.contains('notectl-list') ?? false,
			};
		});

		expect(wrapperInfo.found).toBe(true);
		expect(wrapperInfo.parentTag).toBe('OL');
		expect(wrapperInfo.hasListClass).toBe(true);
	});

	test('bullet list in table cell does not show double bullet markers', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('Single bullet', { delay: 10 });

		// The native list-style must be suppressed (set to 'none' by .notectl-list wrapper).
		// Without the wrapper, the browser renders a native bullet PLUS the custom ::before.
		const listStyleType = await page.evaluate(() => {
			const el = document.querySelector('notectl-editor');
			const shadow = el?.shadowRoot;
			const li = shadow?.querySelector('td .notectl-list-item--bullet');
			if (!li) return 'not-found';
			return getComputedStyle(li).listStyleType;
		});

		expect(listStyleType).toBe('none');
	});
});

// ══════════════════════════════════════════════════════════════════════════
// Part 3: Copy-pasting lists into table cells
// ══════════════════════════════════════════════════════════════════════════

test.describe('Lists copy-paste into table cells', () => {
	test.beforeEach(async ({ context, browserName }) => {
		test.skip(browserName === 'firefox', 'Firefox does not support clipboard permissions');
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	});

	test('copy bullet list and paste into table cell', async ({ editor, page }) => {
		await editor.focus();

		// Step 1: Create a bullet list outside the table
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('Outside bullet', { delay: 10 });

		let json: { children: JsonChild[] } = await editor.getJSON();
		expect(json.children[0]?.type).toBe('list_item');

		// Step 2: Select all list text and copy
		await page.keyboard.press('Home');
		await page.keyboard.press('Shift+End');
		await page.keyboard.press('Control+c');

		// Step 3: Press Enter to create new line, then insert a table
		await page.keyboard.press('End');
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter'); // Exit list
		await insertTable(page);

		// Step 4: Paste into the first table cell
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(200);

		// Step 5: Verify the pasted content exists in the cell
		json = await editor.getJSON();
		const table: JsonChild | undefined = json.children.find((c) => c.type === 'table');
		expect(table).toBeDefined();
		if (!table) return;

		const cellContents: JsonChild[][] = getCellContents(table);
		const firstCell: JsonChild[] = cellContents[0] ?? [];

		// The cell should contain the pasted text
		const allText: string = JSON.stringify(firstCell);
		expect(allText).toContain('Outside bullet');
	});

	test('copy ordered list and paste into table cell', async ({ editor, page }) => {
		await editor.focus();

		// Create an ordered list
		await page.keyboard.type('1. ', { delay: 10 });
		await page.keyboard.type('Numbered item', { delay: 10 });

		let json: { children: JsonChild[] } = await editor.getJSON();
		expect(json.children[0]?.type).toBe('list_item');
		expect(json.children[0]?.attrs?.listType).toBe('ordered');

		// Select and copy
		await page.keyboard.press('Home');
		await page.keyboard.press('Shift+End');
		await page.keyboard.press('Control+c');

		// Create table after list
		await page.keyboard.press('End');
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter');
		await insertTable(page);

		// Paste into cell
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(200);

		json = await editor.getJSON();
		const table: JsonChild | undefined = json.children.find((c) => c.type === 'table');
		expect(table).toBeDefined();
		if (!table) return;

		const cellContents: JsonChild[][] = getCellContents(table);
		const firstCell: JsonChild[] = cellContents[0] ?? [];

		const allText: string = JSON.stringify(firstCell);
		expect(allText).toContain('Numbered item');
	});

	test('copy checklist and paste into table cell', async ({ editor, page }) => {
		await editor.focus();

		// Create a checklist
		await page.keyboard.type('[ ] ', { delay: 10 });
		await page.keyboard.type('Check item', { delay: 10 });

		let json: { children: JsonChild[] } = await editor.getJSON();
		expect(json.children[0]?.type).toBe('list_item');
		expect(json.children[0]?.attrs?.listType).toBe('checklist');

		// Select and copy
		await page.keyboard.press('Home');
		await page.keyboard.press('Shift+End');
		await page.keyboard.press('Control+c');

		// Create table after checklist
		await page.keyboard.press('End');
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter');
		await insertTable(page);

		// Paste into cell
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(200);

		json = await editor.getJSON();
		const table: JsonChild | undefined = json.children.find((c) => c.type === 'table');
		expect(table).toBeDefined();
		if (!table) return;

		const cellContents: JsonChild[][] = getCellContents(table);
		const firstCell: JsonChild[] = cellContents[0] ?? [];

		const allText: string = JSON.stringify(firstCell);
		expect(allText).toContain('Check item');
	});
});
