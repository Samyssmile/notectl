import { expect, test } from './fixtures/editor-page';

test.describe('Link', () => {
	test('apply link via popup Apply button', async ({ editor, page }) => {
		await editor.typeText('Click here');
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		await editor.markButton('link').click();

		const urlInput = page.locator('notectl-editor input[aria-label="URL"]');
		await urlInput.waitFor({ state: 'visible' });
		await urlInput.fill('https://example.com');

		const applyBtn = page.locator('notectl-editor button[aria-label="Apply link"]');
		await applyBtn.click();

		const html = await editor.getHTML();
		expect(html).toContain('<a');
		expect(html).toContain('href="https://example.com"');
	});

	test('apply link via Enter in URL input', async ({ editor, page }) => {
		await editor.typeText('Press enter');
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		await editor.markButton('link').click();

		const urlInput = page.locator('notectl-editor input[aria-label="URL"]');
		await urlInput.waitFor({ state: 'visible' });
		await urlInput.fill('https://enter.example.com');
		await urlInput.press('Enter');

		const html = await editor.getHTML();
		expect(html).toContain('<a');
		expect(html).toContain('href="https://enter.example.com"');
	});

	test('link button tooltip shows Ctrl+K shortcut', async ({ editor }) => {
		const linkBtn = editor.markButton('link');
		const tooltip = await linkBtn.getAttribute('data-tooltip');
		expect(tooltip).toContain('Ctrl+K');
	});

	test('remove link via popup Remove button', async ({ editor, page }) => {
		// Apply a link first
		await editor.typeText('Remove me');
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		await editor.markButton('link').click();
		const urlInput = page.locator('notectl-editor input[aria-label="URL"]');
		await urlInput.waitFor({ state: 'visible' });
		await urlInput.fill('https://remove.example.com');
		const applyBtn = page.locator('notectl-editor button[aria-label="Apply link"]');
		await applyBtn.click();

		let html = await editor.getHTML();
		expect(html).toContain('<a');

		// Re-select the linked text so the link button is enabled
		await editor.focus();
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		await editor.markButton('link').click();

		const removeBtn = page.locator('notectl-editor button[aria-label="Remove link"]');
		await removeBtn.waitFor({ state: 'visible' });
		await removeBtn.click();

		html = await editor.getHTML();
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
		const urlInput = page.locator('notectl-editor input[aria-label="URL"]');
		await urlInput.waitFor({ state: 'visible' });
		await urlInput.fill('https://undo.example.com');
		const applyBtn = page.locator('notectl-editor button[aria-label="Apply link"]');
		await applyBtn.click();

		let html = await editor.getHTML();
		expect(html).toContain('<a');

		await page.keyboard.press('Control+z');

		html = await editor.getHTML();
		expect(html).not.toContain('<a');
	});
});
