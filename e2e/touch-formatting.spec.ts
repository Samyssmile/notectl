import { expect, test } from './fixtures/editor-page';

test.describe('Touch formatting', () => {
	test('Tap to focus and type text', async ({ editor, page }) => {
		await editor.tapFocus();
		await page.keyboard.type('Hello Touch', { delay: 10 });

		const text = await editor.getText();
		expect(text).toBe('Hello Touch');
	});

	test('Select text + Bold via toolbar tap', async ({ editor, page }) => {
		await editor.tapFocus();
		await page.keyboard.type('Bold me', { delay: 10 });

		await editor.selectRange(0, 0, 7);
		await editor.tapMarkButton('bold');

		const html = await editor.getContentHTML();
		expect(html).toContain('<strong>');
		expect(html).toContain('Bold me');
	});

	test('Select text + Italic via toolbar tap', async ({ editor, page }) => {
		await editor.tapFocus();
		await page.keyboard.type('Italic me', { delay: 10 });

		await editor.selectRange(0, 0, 9);
		await editor.tapMarkButton('italic');

		const html = await editor.getContentHTML();
		expect(html).toContain('<em>');
		expect(html).toContain('Italic me');
	});

	test('Select partial text + format leaves rest unformatted', async ({ editor, page }) => {
		await editor.tapFocus();
		await page.keyboard.type('Hello World', { delay: 10 });

		// Select only "World" (offset 6–11)
		await editor.selectRange(0, 6, 11);
		await editor.tapMarkButton('bold');

		const html = await editor.getContentHTML();
		expect(html).toContain('<strong>');
		// The full text is preserved
		const text = await editor.getText();
		expect(text).toBe('Hello World');
		// "Hello " is NOT bold — check that the strong tag doesn't wrap everything
		expect(html).not.toMatch(/<strong>.*Hello/);
	});
});
