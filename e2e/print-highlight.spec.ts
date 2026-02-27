import { expect, test } from './fixtures/editor-page';

test.describe('Print: highlight background color', () => {
	test('print output preserves highlight background-color', async ({ editor, page }) => {
		// Arrange: type text and apply highlight
		await editor.typeText('Highlighted text');
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		await editor.markButton('highlight').click();
		const picker = page.locator('notectl-editor .notectl-color-picker');
		await picker.waitFor({ state: 'visible' });
		const swatch = picker.locator('.notectl-color-picker__swatch').first();
		await swatch.click();

		// Verify highlight is applied in editor
		const editorHTML: string = await editor.getContentHTML();
		expect(editorHTML).toContain('background-color');

		// Act: generate print HTML via PrintService.toHTML()
		const printHTML: string = await page.evaluate(() => {
			const el = document.querySelector('notectl-editor') as unknown as {
				getService(key: { id: string }): { toHTML(): string } | undefined;
			};
			const printService = el.getService({ id: 'print' });
			return printService?.toHTML() ?? '';
		});

		// Assert: the print HTML must contain the highlighted span with background-color
		expect(printHTML).toContain('background-color');

		// Assert: the print CSS must include print-color-adjust so browsers
		// actually render the background color in print output
		expect(printHTML).toContain('print-color-adjust');
	});

	test('print output preserves text-color foreground color', async ({ editor, page }) => {
		// Arrange: type text and apply text color
		await editor.typeText('Colored text');
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		await editor.markButton('textColor').click();
		const picker = page.locator('notectl-editor .notectl-color-picker');
		await picker.waitFor({ state: 'visible' });
		const swatch = picker.locator('.notectl-color-picker__swatch').first();
		await swatch.click();

		// Verify text color is applied in editor
		const editorHTML: string = await editor.getContentHTML();
		expect(editorHTML).toContain('color:');

		// Act: generate print HTML
		const printHTML: string = await page.evaluate(() => {
			const el = document.querySelector('notectl-editor') as unknown as {
				getService(key: { id: string }): { toHTML(): string } | undefined;
			};
			const printService = el.getService({ id: 'print' });
			return printService?.toHTML() ?? '';
		});

		// Assert: the print HTML must preserve the colored text
		expect(printHTML).toContain('color:');

		// Assert: print-color-adjust must be set to ensure colors render in print
		expect(printHTML).toContain('print-color-adjust');
	});
});
