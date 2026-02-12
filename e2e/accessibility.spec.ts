import { expect, test } from './fixtures/editor-page';

test.describe('Accessibility', () => {
	test('Content area has correct ARIA attributes', async ({ editor }) => {
		await expect(editor.content).toHaveAttribute('role', 'textbox');
		await expect(editor.content).toHaveAttribute('aria-multiline', 'true');
		await expect(editor.content).toHaveAttribute('aria-label', 'Rich text editor');
	});

	test('Toolbar has role="toolbar"', async ({ editor }) => {
		await expect(editor.toolbar()).toBeVisible();
	});

	test('Toolbar buttons have aria-pressed', async ({ editor }) => {
		const boldBtn = editor.markButton('bold');
		await expect(boldBtn).toHaveAttribute('aria-pressed');
		await expect(boldBtn).toHaveAttribute('aria-label', 'Bold');
	});

	test('Toolbar buttons show aria-disabled when feature is disabled', async ({ editor }) => {
		await editor.recreate({
			features: { bold: false, italic: false, underline: false },
			toolbar: { bold: true, italic: true, underline: true },
		});

		for (const markType of ['bold', 'italic', 'underline']) {
			await expect(editor.markButton(markType)).toHaveAttribute('aria-disabled', 'true');
		}
	});

	test('Screen reader announcement on format change', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.press('Control+b');

		await expect(editor.announcer()).toHaveText('bold on');

		await page.keyboard.press('Control+b');
		await expect(editor.announcer()).toHaveText('bold off');
	});

	test('All formatting accessible via keyboard only', async ({ editor, page }) => {
		await editor.content.focus();
		await page.keyboard.type('Test', { delay: 10 });
		await page.keyboard.press('Control+a');

		await page.keyboard.press('Control+b');
		await page.keyboard.press('Control+i');
		await page.keyboard.press('Control+u');

		const html = await editor.getHTML();
		expect(html).toContain('<strong>');
		expect(html).toContain('<em>');
		expect(html).toContain('<u>');

		await page.keyboard.press('Control+z');
		await page.keyboard.press('Control+z');
		await page.keyboard.press('Control+z');

		const html2 = await editor.getHTML();
		expect(html2).not.toContain('<strong>');
		expect(html2).not.toContain('<em>');
		expect(html2).not.toContain('<u>');
		const text = await editor.getText();
		expect(text.trim()).toBe('Test');
	});
});
