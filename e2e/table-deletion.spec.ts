import { expect, test } from './fixtures/editor-page';
import { hasTableBlock, insertTable } from './fixtures/table-utils';

test.describe('Table Deletion', () => {
	test('Backspace twice removes a table (select then delete)', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);
		expect(await hasTableBlock(page)).toBe(true);

		await page.keyboard.press('Backspace');
		expect(await hasTableBlock(page)).toBe(true);
		await page.keyboard.press('Backspace');

		expect(await hasTableBlock(page)).toBe(false);
	});

	test('Delete twice removes a table from the last cell boundary', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);
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
		await insertTable(page);
		expect(await hasTableBlock(page)).toBe(true);

		const tableContainer = page.locator('notectl-editor .ntbl-container').first();
		await tableContainer.hover();

		const deleteButton = page.locator('notectl-editor .ntbl-delete-table-btn').first();
		await deleteButton.click();

		expect(await hasTableBlock(page)).toBe(false);
	});

	test('a range from the paragraph above into a cell deletes only the selected text', async ({
		editor,
		page,
	}) => {
		const paragraph = (id: string, text: string) => ({
			id,
			type: 'paragraph',
			children: [{ type: 'text', text, marks: [] }],
		});
		const cell = (id: string, text: string) => ({
			id,
			type: 'table_cell',
			children: [paragraph(`${id}p`, text)],
		});
		await editor.setJSON({
			children: [
				paragraph('root', 'root'),
				{
					id: 't',
					type: 'table',
					children: [
						{ id: 'r', type: 'table_row', children: [cell('c1', 'cell'), cell('c2', 'x2')] },
					],
				},
				paragraph('after', 'after'),
			],
		});
		// Chromium's Shift+ArrowDown from `ro|ot` ends such a range in the first
		// cell; set it directly so every browser gets the same range.
		await editor.content.locator('[data-block-id="root"]').click();
		await editor.content.evaluate((root) => {
			const textIn = (id: string): Node => {
				const block = root.querySelector(`[data-block-id="${id}"]`);
				const text = block
					? document.createTreeWalker(block, NodeFilter.SHOW_TEXT).nextNode()
					: null;
				if (!text) throw new Error(`Missing text in ${id}`);
				return text;
			};
			window.getSelection()?.setBaseAndExtent(textIn('root'), 2, textIn('c1p'), 2);
			document.dispatchEvent(new Event('selectionchange'));
		});

		await page.keyboard.press('Backspace');

		const texts = async (): Promise<string[]> =>
			page.evaluate(() => {
				const el = document.querySelector('notectl-editor') as HTMLElement & {
					getState(): { getBlockOrder(): readonly string[]; getBlock(id: string): unknown };
				};
				const state = el.getState();
				return state.getBlockOrder().map((id) => {
					const block = state.getBlock(id) as { children: { text?: string }[] };
					return block.children.map((child) => child.text ?? '').join('');
				});
			});
		await expect.poll(texts).toEqual(['ro', 'll', 'x2', 'after']);
		expect(await hasTableBlock(page)).toBe(true);
	});
});
