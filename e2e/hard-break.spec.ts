import { expect, test } from './fixtures/editor-page';

test.describe('Hard Break (Shift+Enter)', () => {
	test('Shift+Enter inserts <br> and stays in same block', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Shift+Enter');
		await page.keyboard.type('World', { delay: 10 });

		const html = await editor.getContentHTML();
		expect(html).toContain('<br>');

		const json = await editor.getJSON();
		expect(json.children.length).toBe(1);
	});

	test('undo removes hard break', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await editor.waitForUndoGroup();
		await page.keyboard.press('Shift+Enter');
		await page.keyboard.type('World', { delay: 10 });

		let html = await editor.getContentHTML();
		expect(html).toContain('<br>');

		await page.keyboard.press('Control+z');
		await page.keyboard.press('Control+z');

		html = await editor.getContentHTML();
		expect(html).not.toContain('<br>');
	});
});
