import { expect, test } from './fixtures/editor-page';

test.describe('Link', () => {
	test('apply link via popup Apply button', async ({ editor, page }) => {
		await editor.typeText('Click here');
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		await editor.markButton('link').click();

		const urlInput = page.locator('notectl-editor input[aria-label="Link URL"]');
		await urlInput.waitFor({ state: 'visible' });
		await urlInput.fill('https://example.com');

		const applyBtn = page.locator('notectl-editor button[aria-label="Apply link"]');
		await applyBtn.click();

		const html = await editor.getContentHTML();
		expect(html).toContain('<a');
		expect(html).toContain('href="https://example.com"');
	});

	test('remove link via popup Remove button', async ({ editor, page }) => {
		// Apply a link first
		await editor.typeText('Remove me');
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		await editor.markButton('link').click();
		const urlInput = page.locator('notectl-editor input[aria-label="Link URL"]');
		await urlInput.waitFor({ state: 'visible' });
		await urlInput.fill('https://remove.example.com');
		const applyBtn = page.locator('notectl-editor button[aria-label="Apply link"]');
		await applyBtn.click();

		let html = await editor.getContentHTML();
		expect(html).toContain('<a');

		// Re-select the linked text so the link button is enabled
		await editor.focus();
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		await editor.markButton('link').click();

		const removeBtn = page.locator('notectl-editor button[aria-label="Remove link"]');
		await removeBtn.waitFor({ state: 'visible' });
		await removeBtn.click();

		html = await editor.getContentHTML();
		expect(html).not.toContain('<a');
	});

	test('link button disabled with collapsed cursor', async ({ editor }) => {
		await editor.typeText('No selection');

		const linkBtn = editor.markButton('link');
		await expect(linkBtn).toHaveAttribute('aria-disabled', 'true');
	});

	test('undo link application', async ({ editor, page }) => {
		await editor.typeText('Undo link');
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		await editor.markButton('link').click();
		const urlInput = page.locator('notectl-editor input[aria-label="Link URL"]');
		await urlInput.waitFor({ state: 'visible' });
		await urlInput.fill('https://undo.example.com');
		const applyBtn = page.locator('notectl-editor button[aria-label="Apply link"]');
		await applyBtn.click();

		let html = await editor.getContentHTML();
		expect(html).toContain('<a');

		await page.keyboard.press('Control+z');

		html = await editor.getContentHTML();
		expect(html).not.toContain('<a');
	});
});
