import { expect, test } from './fixtures/editor-page';

test.describe('Special Characters – Ampersand Cursor Bug', () => {
	test('Backspace works correctly after ampersand', async ({ editor, page }) => {
		await editor.typeText('X&Y');
		await page.keyboard.press('Backspace');

		const text = await editor.getText();
		expect(text.trim()).toBe('X&');
	});

	test('Enter after ampersand creates block at correct position', async ({ editor, page }) => {
		await editor.typeText('before & after');
		// Move cursor between & and space-after
		for (let i = 0; i < 6; i++) {
			await page.keyboard.press('ArrowLeft');
		}
		await page.keyboard.press('Enter');

		const json = await editor.getJSON();
		expect(json.children.length).toBe(2);
		const allText = await editor.getText();
		expect(allText).toContain('before &');
		expect(allText).toContain(' after');
	});

	test('select-all and replace works with ampersands', async ({ editor, page }) => {
		await editor.typeText('a&b');
		await page.keyboard.press('Control+a');
		await page.keyboard.type('replaced', { delay: 10 });

		const text = await editor.getText();
		expect(text.trim()).toBe('replaced');
	});
});

test.describe('Special Characters – Other HTML Entities', () => {
	test('less-than and greater-than signs render correctly', async ({ editor }) => {
		await editor.typeText('a < b > c');
		const text = await editor.getText();
		expect(text.trim()).toBe('a < b > c');
	});

	test('typing after less-than sign maintains cursor position', async ({ editor, page }) => {
		await editor.typeText('x < y');
		await page.keyboard.type(' is true', { delay: 10 });

		const text = await editor.getText();
		expect(text.trim()).toBe('x < y is true');
	});

	test('quotes do not interfere with cursor', async ({ editor, page }) => {
		await editor.typeText('She said "hello"');
		await page.keyboard.type(' back', { delay: 10 });

		const text = await editor.getText();
		expect(text.trim()).toBe('She said "hello" back');
	});
});
