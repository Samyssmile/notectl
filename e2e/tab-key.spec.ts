import { expect, test } from './fixtures/editor-page';

test.describe('Tab Key Behavior', () => {
	test('Tab inserts a tab character in a paragraph', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Tab');
		await page.keyboard.type('World', { delay: 10 });

		const text = await editor.getText();
		expect(text.trim()).toBe('Hello\tWorld');
	});

	test('Tab keeps focus inside the editor', async ({ editor, page }) => {
		await editor.typeText('Some text');
		await page.keyboard.press('Tab');

		const isFocused = await page.evaluate(() => {
			const el = document.querySelector('notectl-editor');
			const content = el?.shadowRoot?.querySelector('.notectl-content');
			return content?.contains(document.activeElement) || el?.shadowRoot?.activeElement === content;
		});
		expect(isFocused).toBe(true);
	});

	test('Tab at beginning of empty paragraph inserts tab', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.press('Tab');
		await page.keyboard.type('Indented', { delay: 10 });

		const text = await editor.getText();
		expect(text).toContain('\tIndented');
	});

	test('Shift-Tab does not leave the editor', async ({ editor, page }) => {
		await editor.typeText('Some text');
		await page.keyboard.press('Shift+Tab');

		const isFocused = await page.evaluate(() => {
			const el = document.querySelector('notectl-editor');
			const content = el?.shadowRoot?.querySelector('.notectl-content');
			return content?.contains(document.activeElement) || el?.shadowRoot?.activeElement === content;
		});
		expect(isFocused).toBe(true);
	});

	test('Tab in a heading inserts tab character', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('# ', { delay: 10 });
		await page.keyboard.type('Title', { delay: 10 });
		await page.keyboard.press('Tab');
		await page.keyboard.type('More', { delay: 10 });

		const text = await editor.getText();
		expect(text.trim()).toBe('Title\tMore');
	});

	test('multiple Tabs insert multiple tab characters', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.press('Tab');
		await page.keyboard.press('Tab');
		await page.keyboard.type('Double indented', { delay: 10 });

		const text = await editor.getText();
		expect(text).toContain('\t\tDouble indented');
	});

	test('Tab replaces selected text', async ({ editor, page }) => {
		await editor.typeText('Hello World');

		// Select all text, then replace with Tab
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Tab');
		await page.keyboard.type('after', { delay: 10 });

		const text = await editor.getText();
		expect(text).toContain('\tafter');
		expect(text).not.toContain('Hello');
	});

	test('Tab in a list item indents instead of inserting tab', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('- ', { delay: 10 });
		await page.keyboard.type('Item text', { delay: 10 });

		const jsonBefore = await editor.getJSON();
		expect(jsonBefore.children[0]?.type).toBe('list_item');
		expect(jsonBefore.children[0]?.attrs?.indent).toBe(0);

		await page.keyboard.press('Tab');

		const jsonAfter = await editor.getJSON();
		expect(jsonAfter.children[0]?.type).toBe('list_item');
		expect(jsonAfter.children[0]?.attrs?.indent).toBe(1);

		// Text should NOT contain a tab character
		const text = await editor.getText();
		expect(text).not.toContain('\t');
	});

	test('Tab in a table cell navigates to next cell', async ({ editor, page }) => {
		await editor.focus();

		// Insert a table via command API
		await page.evaluate(() => {
			const el = document.querySelector('notectl-editor') as HTMLElement & {
				executeCommand(name: string): boolean;
			};
			el?.executeCommand('insertTable');
		});

		// Type in first cell, then Tab to navigate to next cell
		await page.keyboard.type('Cell 1', { delay: 10 });
		await page.keyboard.press('Tab');
		await page.keyboard.type('Cell 2', { delay: 10 });

		// Verify via JSON: cells are in different table_cell blocks
		const json = await editor.getJSON();
		const table = json.children.find((c: { type: string }) => c.type === 'table');
		expect(table).toBeDefined();

		// Extract cell texts from nested table structure
		// Cells contain paragraphs, which contain text nodes
		const cellTexts: string[] = [];
		for (const row of table.children ?? []) {
			for (const cell of row.children ?? []) {
				for (const block of cell.children ?? []) {
					for (const child of block.children ?? []) {
						if (child.text) cellTexts.push(child.text);
					}
				}
			}
		}
		expect(cellTexts).toContain('Cell 1');
		expect(cellTexts).toContain('Cell 2');

		// Tab navigated between cells, not inserted a tab character
		expect(cellTexts.some((t: string) => t.includes('\t'))).toBe(false);
	});

	test('Tab is undoable', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await editor.waitForUndoGroup();
		await page.keyboard.press('Tab');
		await page.keyboard.type('World', { delay: 10 });

		let text = await editor.getText();
		expect(text.trim()).toBe('Hello\tWorld');

		// Tab + 'World' are in one undo group, 'Hello' in another
		await page.keyboard.press('Control+z');
		text = await editor.getText();
		expect(text.trim()).toBe('Hello');
	});
});
