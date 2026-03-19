import { expect, test } from './fixtures/editor-page';

test.describe('Batch List Operations', () => {
	test('select multiple paragraphs and convert to bullet list', async ({ editor, page }) => {
		await editor.typeText('First line');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Second line', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Third line', { delay: 10 });

		// Select all
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		const bulletBtn = editor.markButton('list-bullet');
		await bulletBtn.click();

		await expect(async () => {
			const json = await editor.getJSON();
			expect(json.children.length).toBe(3);
			for (const block of json.children) {
				expect(block.type).toBe('list_item');
				expect(block.attrs?.listType).toBe('bullet');
			}
		}).toPass({ timeout: 5_000 });
	});

	test('select all bullet items and toggle off to paragraphs', async ({ editor, page }) => {
		await editor.typeText('First');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Second', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Third', { delay: 10 });

		// Convert all to bullet
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);
		const bulletBtn = editor.markButton('list-bullet');
		await bulletBtn.click();

		await expect(async () => {
			const json = await editor.getJSON();
			expect(json.children[0]?.type).toBe('list_item');
		}).toPass({ timeout: 5_000 });

		// Toggle off: select all and click bullet again
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);
		await bulletBtn.click();

		await expect(async () => {
			const json = await editor.getJSON();
			for (const block of json.children) {
				expect(block.type).toBe('paragraph');
			}
		}).toPass({ timeout: 5_000 });
	});

	test('mixed blocks converted to ordered list', async ({ editor, page }) => {
		// Create two paragraphs, then convert first to bullet
		await editor.typeText('Paragraph one');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Paragraph two', { delay: 10 });

		// Move to first line and make it a bullet
		await page.keyboard.press('Control+Home');
		await page.waitForTimeout(100);
		const bulletBtn = editor.markButton('list-bullet');
		await bulletBtn.click();

		await expect(async () => {
			const json = await editor.getJSON();
			expect(json.children[0]?.type).toBe('list_item');
			expect(json.children[1]?.type).toBe('paragraph');
		}).toPass({ timeout: 5_000 });

		// Select all and convert to ordered
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);
		const orderedBtn = editor.markButton('list-ordered');
		await orderedBtn.click();

		await expect(async () => {
			const json = await editor.getJSON();
			for (const block of json.children) {
				expect(block.type).toBe('list_item');
				expect(block.attrs?.listType).toBe('ordered');
			}
		}).toPass({ timeout: 5_000 });
	});

	test('batch indent via Tab on selected list items', async ({ editor, page }) => {
		await editor.typeText('Item A');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Item B', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Item C', { delay: 10 });

		// Convert all to bullet
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);
		const bulletBtn = editor.markButton('list-bullet');
		await bulletBtn.click();

		await expect(async () => {
			const json = await editor.getJSON();
			expect(json.children[0]?.type).toBe('list_item');
		}).toPass({ timeout: 5_000 });

		// Select all and indent
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);
		await page.keyboard.press('Tab');

		await expect(async () => {
			const json = await editor.getJSON();
			for (const block of json.children) {
				expect(block.attrs?.indent).toBe(1);
			}
		}).toPass({ timeout: 5_000 });
	});

	test('batch outdent via Shift-Tab on selected list items', async ({ editor, page }) => {
		await editor.typeText('Item A');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Item B', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Item C', { delay: 10 });

		// Convert all to bullet
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);
		const bulletBtn = editor.markButton('list-bullet');
		await bulletBtn.click();

		await expect(async () => {
			const json = await editor.getJSON();
			expect(json.children[0]?.type).toBe('list_item');
		}).toPass({ timeout: 5_000 });

		// Indent all first
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);
		await page.keyboard.press('Tab');

		await expect(async () => {
			const json = await editor.getJSON();
			expect(json.children[0]?.attrs?.indent).toBe(1);
		}).toPass({ timeout: 5_000 });

		// Now outdent all
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);
		await page.keyboard.press('Shift+Tab');

		await expect(async () => {
			const json = await editor.getJSON();
			for (const block of json.children) {
				expect(block.attrs?.indent).toBe(0);
			}
		}).toPass({ timeout: 5_000 });
	});

	test('toolbar shows active state when all selected blocks are same list type', async ({
		editor,
		page,
	}) => {
		await editor.typeText('First');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Second', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Third', { delay: 10 });

		// Convert all to bullet
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);
		const bulletBtn = editor.markButton('list-bullet');
		await bulletBtn.click();

		await expect(async () => {
			const json = await editor.getJSON();
			expect(json.children[0]?.type).toBe('list_item');
		}).toPass({ timeout: 5_000 });

		// Re-select all; bullet button should show active
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(200);

		await expect(bulletBtn).toHaveAttribute('aria-pressed', 'true');
	});

	test('undo reverses batch toggle in one step', async ({ editor, page }) => {
		await editor.typeText('Line 1');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Line 2', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Line 3', { delay: 10 });

		// Wait for undo grouping
		await editor.waitForUndoGroup();

		// Batch toggle to bullet
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);
		const bulletBtn = editor.markButton('list-bullet');
		await bulletBtn.click();

		await expect(async () => {
			const json = await editor.getJSON();
			expect(json.children[0]?.type).toBe('list_item');
		}).toPass({ timeout: 5_000 });

		// Undo should revert all blocks at once
		await page.keyboard.press('Control+z');

		await expect(async () => {
			const json = await editor.getJSON();
			for (const block of json.children) {
				expect(block.type).toBe('paragraph');
			}
		}).toPass({ timeout: 5_000 });
	});
});
