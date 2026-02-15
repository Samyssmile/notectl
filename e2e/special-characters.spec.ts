import { expect, test } from './fixtures/editor-page';

test.describe('Special Characters – Ampersand Cursor Bug', () => {
	test('cursor stays at correct position after typing ampersand', async ({ editor, page }) => {
		await editor.typeText('A & B');
		const text = await editor.getText();
		expect(text.trim()).toBe('A & B');
	});

	test('typing continues at correct position after ampersand', async ({ editor, page }) => {
		await editor.typeText('Tom & Jerry');
		await page.keyboard.type(' are great', { delay: 10 });

		const text = await editor.getText();
		expect(text.trim()).toBe('Tom & Jerry are great');
	});

	test('cursor does not jump to start after each keystroke with ampersand', async ({
		editor,
		page,
	}) => {
		// Type text with ampersand, then type character by character
		await editor.typeText('R&D');
		await page.keyboard.type(' dept', { delay: 10 });

		const text = await editor.getText();
		// If the cursor jumped to start, text would be garbled like "tped R&D"
		expect(text.trim()).toBe('R&D dept');
	});

	test('multiple ampersands do not cause cursor issues', async ({ editor, page }) => {
		await editor.typeText('A & B & C & D');
		await page.keyboard.type(' end', { delay: 10 });

		const text = await editor.getText();
		expect(text.trim()).toBe('A & B & C & D end');
	});

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
