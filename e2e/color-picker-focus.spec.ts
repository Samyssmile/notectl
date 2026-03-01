import { expect, test } from './fixtures/editor-page';

test.describe('Color picker focus restoration', () => {
	test('editor remains editable after selecting a text color', async ({ editor, page }) => {
		await editor.typeText('Hello ');
		await page.waitForTimeout(100);

		// Select "Hello " so the color applies to it
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		// Open text-color picker and select first swatch
		await editor.markButton('textColor').click();
		const picker = page.locator('notectl-editor .notectl-color-picker');
		await picker.waitFor({ state: 'visible' });

		const swatch = picker.locator('.notectl-color-picker__swatch').first();
		await swatch.click();

		// Picker should close
		await picker.waitFor({ state: 'hidden' });

		// Move cursor to end and type — should work WITHOUT needing editor.focus()
		await page.keyboard.press('End');
		await page.keyboard.type('World', { delay: 10 });

		const text: string = await editor.getText();
		expect(text).toContain('Hello World');
	});

	test('editor remains editable after selecting a highlight color', async ({ editor, page }) => {
		await editor.typeText('Hello ');
		await page.waitForTimeout(100);

		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		// Open highlight picker and select first swatch
		await editor.markButton('highlight').click();
		const picker = page.locator('notectl-editor .notectl-color-picker');
		await picker.waitFor({ state: 'visible' });

		const swatch = picker.locator('.notectl-color-picker__swatch').first();
		await swatch.click();

		await picker.waitFor({ state: 'hidden' });

		// Type immediately — should work WITHOUT needing editor.focus()
		await page.keyboard.press('End');
		await page.keyboard.type('World', { delay: 10 });

		const text: string = await editor.getText();
		expect(text).toContain('Hello World');
	});

	test('editor remains editable after resetting text color via None button', async ({
		editor,
		page,
	}) => {
		await editor.typeText('Hello ');
		await page.waitForTimeout(100);

		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		// Open text-color picker and click the "None" / reset button
		await editor.markButton('textColor').click();
		const picker = page.locator('notectl-editor .notectl-color-picker');
		await picker.waitFor({ state: 'visible' });

		const resetBtn = picker.locator('.notectl-color-picker__default');
		await resetBtn.click();

		await picker.waitFor({ state: 'hidden' });

		// Type immediately — should work WITHOUT needing editor.focus()
		await page.keyboard.press('End');
		await page.keyboard.type('World', { delay: 10 });

		const text: string = await editor.getText();
		expect(text).toContain('Hello World');
	});
});
