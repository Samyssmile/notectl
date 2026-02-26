import { expect, test } from './fixtures/editor-page';

test.describe('Checklist', () => {
	test('clicking checklist toolbar button converts paragraph to checklist', async ({
		editor,
		page,
	}) => {
		await editor.typeText('My task');

		const checklistBtn = editor.markButton('list-checklist');
		await expect(checklistBtn).toBeVisible();
		await checklistBtn.click();

		await expect(async () => {
			const json = await editor.getJSON();
			const block = json.children[0];
			expect(block?.type).toBe('list_item');
			expect(block?.attrs?.listType).toBe('checklist');
			expect(block?.attrs?.checked).toBe(false);
		}).toPass({ timeout: 5_000 });
	});

	test('clicking checklist button again reverts to paragraph', async ({ editor, page }) => {
		await editor.typeText('My task');

		const checklistBtn = editor.markButton('list-checklist');
		await checklistBtn.click();

		let json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('list_item');

		await checklistBtn.click();
		json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('paragraph');
	});

	test('checklist preserves text content', async ({ editor, page }) => {
		await editor.typeText('Buy groceries');

		const checklistBtn = editor.markButton('list-checklist');
		await checklistBtn.click();

		const text = await editor.getText();
		expect(text.trim()).toBe('Buy groceries');
	});

	test('placeholder disappears when checklist is toggled on empty editor', async ({
		editor,
		page,
	}) => {
		// Don't type any text — the editor is empty with placeholder visible
		const placeholder = editor.content;
		await expect(placeholder).toHaveClass(/notectl-content--empty/);

		const checklistBtn = editor.markButton('list-checklist');
		await checklistBtn.click();

		// Placeholder should disappear because the block is now a list_item, not paragraph
		await expect(placeholder).not.toHaveClass(/notectl-content--empty/);
	});

	test('Enter on checklist item creates new checklist item', async ({ editor, page }) => {
		await editor.typeText('First task');

		const checklistBtn = editor.markButton('list-checklist');
		await checklistBtn.click();

		await page.keyboard.press('Enter');
		await page.keyboard.type('Second task', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children.length).toBe(2);
		expect(json.children[0]?.type).toBe('list_item');
		expect(json.children[0]?.attrs?.listType).toBe('checklist');
		expect(json.children[1]?.type).toBe('list_item');
		expect(json.children[1]?.attrs?.listType).toBe('checklist');
		expect(json.children[1]?.attrs?.checked).toBe(false);
	});

	test('Enter on empty checklist item exits list (converts to paragraph)', async ({
		editor,
		page,
	}) => {
		await editor.typeText('Task');

		const checklistBtn = editor.markButton('list-checklist');
		await checklistBtn.click();

		// Press Enter to create a new empty checklist item, then Enter again to exit
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter');

		const json = await editor.getJSON();
		expect(json.children.length).toBe(2);
		expect(json.children[0]?.type).toBe('list_item');
		expect(json.children[0]?.attrs?.listType).toBe('checklist');
		// Second block should be a paragraph (exited list)
		expect(json.children[1]?.type).toBe('paragraph');
	});

	test('Backspace at start of list item converts to paragraph', async ({ editor, page }) => {
		// Toggle checklist on empty editor, then press Backspace
		const checklistBtn = editor.markButton('list-checklist');
		await checklistBtn.click();

		const json1 = await editor.getJSON();
		expect(json1.children[0]?.type).toBe('list_item');

		await page.keyboard.press('Backspace');

		const json2 = await editor.getJSON();
		expect(json2.children[0]?.type).toBe('paragraph');
	});

	test('Backspace at start of non-empty list item converts to paragraph keeping text', async ({
		editor,
		page,
	}) => {
		// Toggle checklist on empty editor (cursor is at offset 0)
		const checklistBtn = editor.markButton('list-checklist');
		await checklistBtn.click();

		// Type some text — cursor moves to the right
		await page.keyboard.type('Keep this text', { delay: 10 });

		const json1 = await editor.getJSON();
		expect(json1.children[0]?.type).toBe('list_item');

		// Move cursor back to the very start with Home, wait for selection sync
		await page.keyboard.press('Home');
		await page.waitForTimeout(100);

		// Backspace at offset 0 should convert list_item → paragraph
		await page.keyboard.press('Backspace');

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('paragraph');

		const text = await editor.getText();
		expect(text).toContain('Keep this text');
	});

	test('Backspace removes characters normally in middle of list item', async ({ editor, page }) => {
		await editor.typeText('Hello');

		const checklistBtn = editor.markButton('list-checklist');
		await checklistBtn.click();

		await page.keyboard.press('Backspace');

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('list_item');
		const text = await editor.getText();
		expect(text.trim()).toBe('Hell');
	});

	test('Enter on bullet list creates new bullet list item', async ({ editor, page }) => {
		await editor.typeText('First');

		const bulletBtn = editor.markButton('list-bullet');
		await bulletBtn.click();

		await page.keyboard.press('Enter');
		await page.keyboard.type('Second', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children.length).toBe(2);
		expect(json.children[0]?.attrs?.listType).toBe('bullet');
		expect(json.children[1]?.attrs?.listType).toBe('bullet');
	});

	test('clicking checkbox area toggles checked state', async ({ editor, page }) => {
		await editor.typeText('Toggle me');

		const checklistBtn = editor.markButton('list-checklist');
		await checklistBtn.click();

		const listItem = editor.content.locator('.notectl-list-item--checklist');
		await expect(listItem).toBeVisible();
		await expect(listItem).toHaveAttribute('data-checked', 'false');

		// Click in the checkbox area (left edge of the list item)
		const box = await listItem.boundingBox();
		if (!box) throw new Error('bounding box not available');
		await page.mouse.click(box.x + 10, box.y + box.height / 2);

		await expect(listItem).toHaveAttribute('data-checked', 'true');
	});

	test('clicking text area does not toggle checked state', async ({ editor, page }) => {
		await editor.typeText('Do not toggle');

		const checklistBtn = editor.markButton('list-checklist');
		await checklistBtn.click();

		const listItem = editor.content.locator('.notectl-list-item--checklist');
		await expect(listItem).toHaveAttribute('data-checked', 'false');

		// Click in the text area (well past the checkbox region)
		const box = await listItem.boundingBox();
		if (!box) throw new Error('bounding box not available');
		await page.mouse.click(box.x + 100, box.y + box.height / 2);

		// Should still be unchecked
		await expect(listItem).toHaveAttribute('data-checked', 'false');
	});

	test('clicking checkbox of non-selected item toggles it', async ({ editor, page }) => {
		await editor.typeText('First task');

		const checklistBtn = editor.markButton('list-checklist');
		await checklistBtn.click();

		await page.keyboard.press('Enter');
		await page.keyboard.type('Second task', { delay: 10 });

		const items = editor.content.locator('.notectl-list-item--checklist');
		await expect(items).toHaveCount(2);

		// Cursor is on second item; click checkbox of first item
		const firstItem = items.nth(0);
		const box = await firstItem.boundingBox();
		if (!box) throw new Error('bounding box not available');
		await page.mouse.click(box.x + 10, box.y + box.height / 2);

		await expect(firstItem).toHaveAttribute('data-checked', 'true');
		// Second item should remain unchecked
		await expect(items.nth(1)).toHaveAttribute('data-checked', 'false');
	});
});
