import { expect, test } from './fixtures/editor-page';

const SIZE_ITEM = '.notectl-font-size-picker__item';

test.describe('FontSizePlugin', () => {
	test('Font size toolbar button is visible', async ({ editor }) => {
		const sizeBtn = editor.markButton('fontSize');
		await expect(sizeBtn).toBeVisible();
	});

	test('Font size popup opens and shows size list', async ({ editor }) => {
		const sizeBtn = editor.markButton('fontSize');
		await sizeBtn.click();

		const popup = editor.root.locator('.notectl-font-size-picker');
		await expect(popup).toBeVisible();

		const items = popup.locator(SIZE_ITEM);
		const count = await items.count();
		expect(count).toBeGreaterThan(0);
	});

	test('Clicking font size input field does not close popup', async ({ editor }) => {
		const sizeBtn = editor.markButton('fontSize');
		await sizeBtn.click();

		const popup = editor.root.locator('.notectl-font-size-picker');
		await expect(popup).toBeVisible();

		// Click the input field inside the popup
		const input = popup.locator('input');
		await expect(input).toBeVisible();
		await input.click();
		// Popup should remain open after clicking its input
		await expect(popup).toBeVisible();
	});

	test('Selecting default size (12) removes font-size mark', async ({ editor, page }) => {
		await editor.recreateWithPlugins({
			toolbar: [
				[{ name: 'FontSizePlugin', config: { sizes: [12, 16, 24, 32, 48], defaultSize: 12 } }],
				[{ name: 'TextFormattingPlugin', config: { bold: true, italic: true, underline: true } }],
			],
			autofocus: true,
		});

		await editor.focus();
		await page.keyboard.type('Hello', { delay: 10 });
		await page.keyboard.press('Control+a');

		const sizeBtn = editor.markButton('fontSize');

		// Apply size 24
		await sizeBtn.click();
		let popup = editor.root.locator('.notectl-font-size-picker');
		const item24 = popup.locator(SIZE_ITEM).filter({ hasText: /^.*24$/ });
		await item24.click();

		// Verify size 24 is applied in JSON
		let json = await editor.getJSON();
		let firstBlock = json.children[0];
		let hasSize = firstBlock?.children.some((c) => c.marks?.some((m) => m.type === 'fontSize'));
		expect(hasSize).toBe(true);

		// Now select all and choose default size (12) to remove the mark
		await page.keyboard.press('Control+a');
		await sizeBtn.click();
		popup = editor.root.locator('.notectl-font-size-picker');
		const item12 = popup.locator(SIZE_ITEM).filter({ hasText: /^.*12$/ });
		await item12.click();

		// Verify fontSize mark is removed
		json = await editor.getJSON();
		firstBlock = json.children[0];
		hasSize = firstBlock?.children.some((c) => c.marks?.some((m) => m.type === 'fontSize'));
		expect(hasSize).toBe(false);
	});
});
