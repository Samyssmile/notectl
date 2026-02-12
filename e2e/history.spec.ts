import { expect, test } from './fixtures/editor-page';

test.describe('History', () => {
	test('Undo typing', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await editor.waitForUndoGroup();
		await page.keyboard.press('Control+z');

		const text = await editor.getText();
		expect(text.trim()).toBe('');
	});

	test('Redo after undo', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await editor.waitForUndoGroup();
		await page.keyboard.press('Control+z');
		await page.keyboard.press('Control+Shift+z');

		const text = await editor.getText();
		expect(text.trim()).toBe('Hello');
	});

	test('Redo cleared after new input', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await editor.waitForUndoGroup();
		await page.keyboard.press('Control+z');
		await page.keyboard.type('World', { delay: 10 });
		await page.keyboard.press('Control+Shift+z');

		const text = await editor.getText();
		expect(text.trim()).toBe('World');
	});

	test('Undo formatting', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+b');

		let html = await editor.getHTML();
		expect(html).toContain('<strong>');

		await page.keyboard.press('Control+z');
		html = await editor.getHTML();
		expect(html).not.toContain('<strong>');
	});

	test('Undo grouping — fast typing is one group, pause creates new group', async ({
		editor,
		page,
	}) => {
		await editor.typeText('Hello');
		await editor.waitForUndoGroup();
		await page.keyboard.type(' World', { delay: 10 });
		await editor.waitForUndoGroup();

		await page.keyboard.press('Control+z');
		let text = await editor.getText();
		expect(text.trim()).toBe('Hello');

		await page.keyboard.press('Control+z');
		text = await editor.getText();
		expect(text.trim()).toBe('');
	});

	test('Multiple undo', async ({ editor, page }) => {
		await editor.typeText('First');
		await editor.waitForUndoGroup();
		await editor.typeText(' Second');
		await editor.waitForUndoGroup();

		await page.keyboard.press('Control+z');
		let text = await editor.getText();
		expect(text.trim()).toBe('First');

		await page.keyboard.press('Control+z');
		text = await editor.getText();
		expect(text.trim()).toBe('');
	});

	test('Redo via Ctrl+Y', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await editor.waitForUndoGroup();
		await page.keyboard.press('Control+z');

		let text = await editor.getText();
		expect(text.trim()).toBe('');

		await page.keyboard.press('Control+y');
		text = await editor.getText();
		expect(text.trim()).toBe('Hello');
	});
});
