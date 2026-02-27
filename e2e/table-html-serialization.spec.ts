import { expect, test } from './fixtures/editor-page';
import { type JsonChild, getCellContents, insertTable } from './fixtures/table-utils';

test.describe('Table HTML serialization', () => {
	test('getContentHTML includes table markup when document contains a table', async ({
		editor,
		page,
	}) => {
		// Arrange: type text, then insert a table below
		await editor.typeText('Hello World');
		await page.keyboard.press('Enter');
		await insertTable(page);

		// Type text into the first table cell
		await page.keyboard.type('AB', { delay: 10 });

		// Act: get both JSON and HTML representations
		const json = await editor.getJSON();
		const html = await editor.getContentHTML();

		// Assert: JSON contains the table with cell content
		const table: JsonChild | undefined = (json.children as JsonChild[]).find(
			(c) => c.type === 'table',
		);
		expect(table).toBeDefined();

		if (!table) return;
		const cellContents: JsonChild[][] = getCellContents(table);
		const firstCellText: string =
			cellContents[0]
				?.flatMap((block) => (block.children ?? []).map((c) => c.text ?? ''))
				.join('') ?? '';
		expect(firstCellText).toBe('AB');

		// Assert: HTML contains full table structure with inline styles
		expect(html).toContain('<table');
		expect(html).toContain('border-collapse: collapse');
		expect(html).toContain('<tr>');
		expect(html).toContain('<td');
		expect(html).toContain('border: 1px solid');
		expect(html).toContain('padding: 8px 12px');
		expect(html).toContain('AB');
	});

	test('getContentHTML preserves text before and after a table', async ({ editor, page }) => {
		// Arrange: paragraph, then table
		await editor.typeText('Before table');
		await page.keyboard.press('Enter');
		await insertTable(page);

		// Act
		const html = await editor.getContentHTML();

		// Assert: both paragraph text and table markup should be present
		expect(html).toContain('Before table');
		expect(html).toContain('<table');
	});

	test('getContentHTML produces standalone table with borders and padding', async ({
		editor,
		page,
	}) => {
		// Arrange: insert a table and type into the first cell
		await editor.focus();
		await insertTable(page);
		await page.keyboard.type('Cell content', { delay: 10 });

		// Act
		const html = await editor.getContentHTML();

		// Assert: table has layout styles, cells have border + padding
		expect(html).toContain('border-collapse: collapse');
		expect(html).toContain('width: 100%');
		expect(html).toContain('border: 1px solid');
		expect(html).toContain('padding: 8px 12px');
		expect(html).toContain('vertical-align: top');
		expect(html).toContain('Cell content');
	});

	test('getContentHTML includes custom border color from table attrs', async ({ editor, page }) => {
		// Arrange: insert a table, then set border color via JSON round-trip
		await editor.focus();
		await insertTable(page);

		const applied: boolean = await page.evaluate(() => {
			type EditorEl = HTMLElement & {
				getJSON(): { children: { type: string; attrs?: Record<string, unknown> }[] };
				setJSON(doc: unknown): void;
			};
			const el = document.querySelector('notectl-editor') as EditorEl | null;
			if (!el) return false;
			const doc = el.getJSON();
			const table = doc.children.find((c) => c.type === 'table');
			if (!table) return false;
			table.attrs = { ...table.attrs, borderColor: '#e69138' };
			el.setJSON(doc);
			return true;
		});
		expect(applied).toBe(true);

		// Act
		const html = await editor.getContentHTML();

		// Assert: table sets the custom property, cells reference it with fallback
		expect(html).toContain('--ntbl-bc: #e69138');
		expect(html).toContain('var(--ntbl-bc');
	});

	test('getContentHTML renders borderless table with transparent borders', async ({
		editor,
		page,
	}) => {
		// Arrange: insert a table with borderColor='none'
		await editor.focus();
		await insertTable(page);

		const applied: boolean = await page.evaluate(() => {
			type EditorEl = HTMLElement & {
				getJSON(): { children: { type: string; attrs?: Record<string, unknown> }[] };
				setJSON(doc: unknown): void;
			};
			const el = document.querySelector('notectl-editor') as EditorEl | null;
			if (!el) return false;
			const doc = el.getJSON();
			const table = doc.children.find((c) => c.type === 'table');
			if (!table) return false;
			table.attrs = { ...table.attrs, borderColor: 'none' };
			el.setJSON(doc);
			return true;
		});
		expect(applied).toBe(true);

		// Act
		const html = await editor.getContentHTML();

		// Assert: borderless mode sets transparent
		expect(html).toContain('--ntbl-bc: transparent');
	});
});
