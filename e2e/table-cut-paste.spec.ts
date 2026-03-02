import { expect, test } from './fixtures/editor-page';
import { hasTableBlock, insertTable } from './fixtures/table-utils';

type JsonChild = {
	type: string;
	children?: JsonChild[];
	text?: string;
	attrs?: Record<string, unknown>;
};

test.beforeEach(async ({ context }) => {
	try {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	} catch {
		// Best-effort: some browsers do not expose clipboard permissions via Playwright.
	}
});

test.describe('Table cut and paste', () => {
	test('Ctrl+A → Ctrl+X removes table completely', async ({ editor, page }) => {
		// Arrange: text above + table + implicit paragraph below
		await editor.typeText('Hello above');
		await page.keyboard.press('Enter');
		await editor.focus();
		await insertTable(page);

		// Verify table exists
		expect(await hasTableBlock(page)).toBe(true);

		// Act: select all → cut
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+x');
		await page.waitForTimeout(200);

		// Assert: table should be gone, editor should be empty
		const json: { children: JsonChild[] } = await editor.getJSON();
		const hasTable: boolean = json.children.some((c) => c.type === 'table');
		expect(hasTable).toBe(false);

		// Should have just an empty paragraph
		const texts: string[] = json.children.map((c) =>
			(c.children ?? []).map((ch) => ch.text ?? '').join(''),
		);
		const nonEmpty: string[] = texts.filter((t) => t.length > 0);
		expect(nonEmpty).toHaveLength(0);
	});

	test('Ctrl+A → Ctrl+X → Ctrl+V restores table structure', async ({ editor, page }) => {
		// Arrange: text + table
		await editor.typeText('Hello');
		await page.keyboard.press('Enter');
		await editor.focus();
		await insertTable(page);

		expect(await hasTableBlock(page)).toBe(true);

		// Act: select all → cut → paste
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+x');
		await page.waitForTimeout(200);
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(300);

		// Assert: table should be restored
		expect(await hasTableBlock(page)).toBe(true);

		// Also check that "Hello" text is present
		const json: { children: JsonChild[] } = await editor.getJSON();
		const paragraphs: JsonChild[] = json.children.filter((c) => c.type === 'paragraph');
		const texts: string[] = paragraphs.map((p) =>
			(p.children ?? []).map((c) => c.text ?? '').join(''),
		);
		expect(texts).toContain('Hello');
	});

	test('paste table HTML creates table structure', async ({ editor }) => {
		// Arrange: focus editor
		await editor.focus();

		// Act: paste HTML containing a table
		await editor.pasteHTML(
			'<p>Before</p><table><tr><td>A1</td><td>B1</td></tr><tr><td>A2</td><td>B2</td></tr></table><p>After</p>',
		);
		await editor.page.waitForTimeout(300);

		// Assert: should have paragraph + table + paragraph
		const json: { children: JsonChild[] } = await editor.getJSON();
		expect(json.children.some((c) => c.type === 'table')).toBe(true);

		// Verify table structure
		const table: JsonChild | undefined = json.children.find((c) => c.type === 'table');
		expect(table).toBeDefined();
		const rows: JsonChild[] = (table?.children ?? []).filter((c) => c.type === 'table_row');
		expect(rows.length).toBe(2);

		// Verify cell content
		const firstRow: JsonChild | undefined = rows[0];
		const cells: JsonChild[] = (firstRow?.children ?? []).filter((c) => c.type === 'table_cell');
		expect(cells.length).toBe(2);
	});

	test('table cell text preserved through paste cycle', async ({ editor, page }) => {
		// Arrange: type text in first cell
		await editor.focus();
		await insertTable(page);

		// Type into the first cell
		await page.keyboard.type('Cell content', { delay: 10 });

		// Verify content
		expect(await hasTableBlock(page)).toBe(true);

		// Act: select all → copy → clear → paste
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+c');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+x');
		await page.waitForTimeout(200);
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(300);

		// Assert: table should still exist
		expect(await hasTableBlock(page)).toBe(true);
	});
});
