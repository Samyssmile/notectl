import { expect, test } from '../fixtures/angular-editor-page';

test.describe('Angular — Basic Editing', () => {
	test('type characters into editor', async ({ editor }) => {
		await editor.typeText('Hello World');
		const text = await editor.getText();
		expect(text.trim()).toBe('Hello World');
	});

	test('Enter creates new paragraph', async ({ editor, page }) => {
		await editor.typeText('Line 1');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Line 2', { delay: 10 });

		const json = await editor.getJSON();
		expect(json.children.length).toBe(2);
	});

	test('Backspace deletes a character', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Backspace');
		const text = await editor.getText();
		expect(text.trim()).toBe('Hell');
	});

	test('Select all and overwrite', async ({ editor, page }) => {
		await editor.typeText('Hello World');
		await page.keyboard.press('Control+a');
		await page.keyboard.type('Replaced', { delay: 10 });
		const text = await editor.getText();
		expect(text.trim()).toBe('Replaced');
	});

	test('Bold formatting via keyboard shortcut', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.press('Control+b');
		await page.keyboard.type('bold text', { delay: 10 });
		await page.keyboard.press('Control+b');
		await page.keyboard.type(' normal', { delay: 10 });

		const html = await editor.getHTML();
		expect(html).toContain('<strong>');
		expect(html).toContain('bold text');
		expect(html).toContain('normal');
	});

	test('Paste plain text', async ({ editor }) => {
		await editor.focus();
		await editor.pasteText('Pasted content');

		const text = await editor.getText();
		expect(text).toContain('Pasted content');
	});

	test('Paste HTML preserves formatting', async ({ editor }) => {
		await editor.focus();
		await editor.pasteHTML('<p><strong>Bold</strong> and <em>italic</em></p>');

		const text = await editor.getText();
		expect(text).toContain('Bold');
		expect(text).toContain('italic');

		const html = await editor.getHTML();
		expect(html).toContain('<strong>');
		expect(html).toContain('<em>');
	});
});
