import { expect, test } from './fixtures/editor-page';

test.describe('Title block text alignment', () => {
	test('text alignment toolbar stays enabled after setting block to Title', async ({
		editor,
		page,
	}) => {
		// 1. Type "Hello World"
		await editor.typeText('Hello World');

		// 2. Select all text
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		// 3. Open the heading dropdown and click "Title"
		const headingBtn = editor.markButton('heading');
		await expect(headingBtn).toBeVisible();
		await headingBtn.click();

		// Wait for the heading picker popup to appear
		const popup = editor.root.locator('.notectl-heading-picker');
		await expect(popup).toBeVisible();

		// Click the "Title" item (exact match to avoid matching "Subtitle")
		const titleItem = popup.getByRole('button', { name: 'Title', exact: true });
		await titleItem.click();

		// 4. Verify the block is now a title
		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('title');

		// 5. The alignment toolbar button must be enabled (not disabled)
		const alignBtn = editor.markButton('alignment');
		await expect(alignBtn).toBeVisible();
		await expect(alignBtn).not.toBeDisabled();

		// 6. Open alignment dropdown and click "Align Center"
		await alignBtn.click();

		const alignPopup = editor.root.locator('.notectl-dropdown');
		await expect(alignPopup).toBeVisible();

		const centerItem = alignPopup.locator('.notectl-dropdown__item', {
			has: page.locator('.notectl-dropdown__item-label', { hasText: 'Align Center' }),
		});
		await centerItem.click();

		// 7. Verify the title block now has center alignment
		const updatedJson = await editor.getJSON();
		expect(updatedJson.children[0]?.type).toBe('title');
		expect(updatedJson.children[0]?.attrs?.align).toBe('center');

		// 8. Verify the text content is preserved
		const text = await editor.getText();
		expect(text.trim()).toBe('Hello World');
	});
});
