import { expect, test } from './fixtures/editor-page';

test.describe('Toolbar Configuration', () => {
	test('All buttons visible by default', async ({ editor }) => {
		await expect(editor.markButton('bold')).toBeVisible();
		await expect(editor.markButton('italic')).toBeVisible();
		await expect(editor.markButton('underline')).toBeVisible();
	});

	test('Bold button hidden', async ({ editor }) => {
		await editor.recreate({
			toolbar: { bold: false, italic: true, underline: true },
		});
		await expect(editor.markButton('bold')).toHaveCount(0);
		await expect(editor.markButton('italic')).toBeVisible();
		await expect(editor.markButton('underline')).toBeVisible();
	});

	test('Italic button hidden', async ({ editor }) => {
		await editor.recreate({
			toolbar: { bold: true, italic: false, underline: true },
		});
		await expect(editor.markButton('bold')).toBeVisible();
		await expect(editor.markButton('italic')).toHaveCount(0);
		await expect(editor.markButton('underline')).toBeVisible();
	});

	test('Underline button hidden', async ({ editor }) => {
		await editor.recreate({
			toolbar: { bold: true, italic: true, underline: false },
		});
		await expect(editor.markButton('bold')).toBeVisible();
		await expect(editor.markButton('italic')).toBeVisible();
		await expect(editor.markButton('underline')).toHaveCount(0);
	});

	test('All buttons hidden — no toolbar rendered', async ({ editor }) => {
		await editor.recreate({
			toolbar: { bold: false, italic: false, underline: false },
		});
		await expect(editor.markButton('bold')).toHaveCount(0);
		await expect(editor.markButton('italic')).toHaveCount(0);
		await expect(editor.markButton('underline')).toHaveCount(0);
		await expect(editor.toolbar()).toHaveCount(0);
	});

	test('Runtime toolbar update via configurePlugin()', async ({ editor }) => {
		await expect(editor.markButton('bold')).toBeVisible();

		await editor.configurePlugin('toolbar', { bold: false });

		await expect(editor.markButton('bold')).toHaveCount(0);
		await expect(editor.markButton('italic')).toBeVisible();
		await expect(editor.markButton('underline')).toBeVisible();
	});

	test('Feature disabled vs. toolbar hidden — different behavior', async ({ editor, page }) => {
		// Case 1: Toolbar hidden — button gone, shortcut still works
		await editor.recreate({
			toolbar: { bold: false, italic: true, underline: true },
		});

		await expect(editor.markButton('bold')).toHaveCount(0);
		await editor.typeText('Test');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+b');
		let html = await editor.getContentHTML();
		expect(html).toContain('<strong>');

		// Case 2: Feature disabled — button visible but disabled, shortcut does nothing
		await editor.recreate({
			features: { bold: false },
			toolbar: { bold: true, italic: true, underline: true },
		});

		const boldBtn = editor.markButton('bold');
		await expect(boldBtn).toBeVisible();
		await expect(boldBtn).toBeDisabled();

		await editor.typeText('Test');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+b');
		html = await editor.getContentHTML();
		expect(html).not.toContain('<strong>');
	});
});
