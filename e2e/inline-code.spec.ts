import { expect, test } from './fixtures/editor-page';

test.describe('Inline Code Mark', () => {
	test('Mod-E shortcut makes text inline code', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+e');

		const html = await editor.getContentHTML();
		expect(html).toContain('<code>');
	});

	test('toggle off removes inline code', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+e');
		await page.keyboard.press('Control+e');

		const html = await editor.getContentHTML();
		expect(html).not.toContain('<code>');
	});

	test('toolbar inline_code button applies code mark', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Control+a');

		await editor.markButton('inline_code').click();

		const html = await editor.getContentHTML();
		expect(html).toContain('<code>');
	});

	test('inline code at cursor affects next typed text', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.press('Control+e');
		await page.keyboard.type('code text', { delay: 10 });

		const html = await editor.getContentHTML();
		expect(html).toContain('<code>');
	});

	test('backtick input rule auto-formats to code mark', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('`hello`', { delay: 10 });

		const html = await editor.getContentHTML();
		expect(html).toContain('<code>');
		expect(html).toContain('hello');
		expect(html).not.toContain('`');
	});

	test('inline code persists through undo/redo cycle', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+e');

		// Undo
		await page.keyboard.press('Control+z');
		const afterUndo = await editor.getContentHTML();
		expect(afterUndo).not.toContain('<code>');

		// Redo
		await page.keyboard.press('Control+Shift+z');
		const afterRedo = await editor.getContentHTML();
		expect(afterRedo).toContain('<code>');
	});

	test('inline code inside heading', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('# Title', { delay: 10 });

		// Select "Title"
		for (let i = 0; i < 5; i++) {
			await page.keyboard.press('Shift+ArrowLeft');
		}
		await page.waitForTimeout(100);
		await page.keyboard.press('Control+e');

		const html = await editor.getContentHTML();
		expect(html).toContain('<code>');
	});

	test('toolbar button has correct aria-pressed state', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Control+a');

		const button = editor.markButton('inline_code');
		const pressedBefore = await button.getAttribute('aria-pressed');
		expect(pressedBefore).toBe('false');

		await page.keyboard.press('Control+e');
		await page.waitForTimeout(50);

		const pressedAfter = await button.getAttribute('aria-pressed');
		expect(pressedAfter).toBe('true');
	});

	test('code element is present in DOM (semantic HTML)', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+e');

		const codeElement = editor.content.locator('code');
		await expect(codeElement).toBeVisible();
		await expect(codeElement).toHaveText('Hello');
	});
});
