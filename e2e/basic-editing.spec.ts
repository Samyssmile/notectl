import { expect, test } from './fixtures/editor-page';

test.describe('Basic Editing', () => {
	test('type characters into empty editor', async ({ editor, page }) => {
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

	test('Backspace at block start merges blocks', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Enter');
		await page.keyboard.type('World', { delay: 10 });
		for (let i = 0; i < 5; i++) {
			await page.keyboard.press('ArrowLeft');
		}
		await page.keyboard.press('Backspace');

		const json = await editor.getJSON();
		expect(json.children.length).toBe(1);
		const text = await editor.getText();
		expect(text.trim()).toBe('HelloWorld');
	});

	test('Delete removes a character forward', async ({ editor, page }) => {
		await editor.typeText('Hello');
		for (let i = 0; i < 5; i++) {
			await page.keyboard.press('ArrowLeft');
		}
		await page.keyboard.press('Delete');
		const text = await editor.getText();
		expect(text.trim()).toBe('ello');
	});

	test('Ctrl+Backspace deletes word backward', async ({ editor, page }) => {
		await editor.typeText('Hello World');
		await page.keyboard.press('Control+Backspace');

		const text = await editor.getText();
		expect(text.trim()).toBe('Hello');
	});

	test('Ctrl+Delete deletes word forward', async ({ editor, page }) => {
		await editor.typeText('Hello World');
		for (let i = 0; i < 5; i++) {
			await page.keyboard.press('ArrowLeft');
		}
		await page.keyboard.press('Control+Delete');

		const text = await editor.getText();
		expect(text.trim()).toBe('Hello');
	});

	test('Select all with Ctrl+A', async ({ editor, page }) => {
		await editor.typeText('Hello World');
		await page.keyboard.press('Control+a');
		await page.keyboard.type('Replaced', { delay: 10 });
		const text = await editor.getText();
		expect(text.trim()).toBe('Replaced');
	});

	test('Text selection and overwrite', async ({ editor, page }) => {
		await editor.typeText('Hello World');
		await page.keyboard.press('Control+a');
		await page.keyboard.type('Bye', { delay: 10 });
		const text = await editor.getText();
		expect(text.trim()).toBe('Bye');
	});

	test('Cut removes selected text', async ({ editor, page }) => {
		await editor.typeText('Hello World');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+x');

		const text = await editor.getText();
		expect(text.trim()).toBe('');
	});

	test('Copy and paste within editor', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('End');
		await editor.pasteText('Hello');

		const text = await editor.getText();
		expect(text.trim()).toBe('HelloHello');
	});

	test('Paste plain text from external source', async ({ editor }) => {
		await editor.focus();
		await editor.pasteText('Pasted content');

		const text = await editor.getText();
		expect(text).toContain('Pasted content');
	});

	test('Paste HTML from external source extracts text', async ({ editor }) => {
		await editor.focus();
		await editor.pasteHTML('<p><strong>Bold</strong> and <em>italic</em></p>');

		const text = await editor.getText();
		expect(text).toContain('Bold');
		expect(text).toContain('italic');
	});
});
