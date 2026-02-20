import { expect, test } from './fixtures/editor-page';

test.describe('Hard Break (Shift+Enter)', () => {
	test('Shift+Enter inserts <br> within same paragraph', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Shift+Enter');
		await page.keyboard.type('World', { delay: 10 });

		const html = await editor.getHTML();
		expect(html).toContain('<br>');

		const json = await editor.getJSON();
		expect(json.children.length).toBe(1);
	});

	test('text before and after hard break stays in same block', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Shift+Enter');
		await page.keyboard.type('World', { delay: 10 });

		const text = await editor.getText();
		expect(text).toContain('Hello');
		expect(text).toContain('World');

		const json = await editor.getJSON();
		expect(json.children.length).toBe(1);
	});

	test('multiple Shift+Enter produces multiple <br>', async ({ editor, page }) => {
		await editor.typeText('A');
		await page.keyboard.press('Shift+Enter');
		await page.keyboard.press('Shift+Enter');
		await page.keyboard.type('B', { delay: 10 });

		const html = await editor.getHTML();
		const brCount = (html.match(/<br>/g) || []).length;
		expect(brCount).toBeGreaterThanOrEqual(2);

		const json = await editor.getJSON();
		expect(json.children.length).toBe(1);
	});

	test('undo removes hard break', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await editor.waitForUndoGroup();
		await page.keyboard.press('Shift+Enter');
		await page.keyboard.type('World', { delay: 10 });

		let html = await editor.getHTML();
		expect(html).toContain('<br>');

		await page.keyboard.press('Control+z');
		await page.keyboard.press('Control+z');

		html = await editor.getHTML();
		expect(html).not.toContain('<br>');
	});
});
