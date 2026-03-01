import { expect, test } from './fixtures/editor-page';

test.describe('Dropdown focus restoration', () => {
	test('heading picker restores focus to editor after selection', async ({ editor, page }) => {
		await editor.typeText('Hello ');
		await page.waitForTimeout(100);

		// Open heading picker
		const headingBtn = editor.markButton('heading');
		await headingBtn.click();

		const popup = editor.popup();
		await popup.waitFor({ state: 'visible' });

		// Click first heading option (should be "Paragraph" or similar)
		const firstItem = popup.locator('button[role="option"]').first();
		await firstItem.click();

		// Popup should close
		await popup.waitFor({ state: 'hidden' });

		// Type immediately — should work WITHOUT re-focusing the editor
		await page.keyboard.type('World', { delay: 10 });

		const text: string = await editor.getText();
		expect(text).toContain('Hello World');
	});

	test('font picker restores focus to editor after selection', async ({ editor, page }) => {
		await editor.typeText('Hello ');
		await page.waitForTimeout(100);

		// Select text so font applies
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		// Open font picker
		const fontBtn = editor.markButton('font');
		await fontBtn.click();

		const popup = editor.popup();
		await popup.waitFor({ state: 'visible' });

		// Click first font option
		const firstItem = popup.locator('button[role="option"]').first();
		await firstItem.click();

		// Popup should close
		await popup.waitFor({ state: 'hidden' });

		// Move cursor to end and type — should work WITHOUT re-focusing
		await page.keyboard.press('End');
		await page.keyboard.type('World', { delay: 10 });

		const text: string = await editor.getText();
		expect(text).toContain('Hello World');
	});

	test('font-size picker restores focus to editor after selection', async ({ editor, page }) => {
		await editor.typeText('Hello ');
		await page.waitForTimeout(100);

		// Select text so font size applies
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		// Open font-size picker
		const fontSizeBtn = editor.markButton('fontSize');
		await fontSizeBtn.click();

		const popup = editor.popup();
		await popup.waitFor({ state: 'visible' });

		// Click a size option (not the first/active one to ensure a change)
		const sizeItems = popup.locator('button[role="option"]');
		const secondItem = sizeItems.nth(1);
		await secondItem.click();

		// Popup should close
		await popup.waitFor({ state: 'hidden' });

		// Move cursor to end and type — should work WITHOUT re-focusing
		await page.keyboard.press('End');
		await page.keyboard.type('World', { delay: 10 });

		const text: string = await editor.getText();
		expect(text).toContain('Hello World');
	});
});
